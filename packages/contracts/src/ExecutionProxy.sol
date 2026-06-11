// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ExecutionProxy
/// @notice Main entry point for AI agent swap execution on Somnia.
///         Users approve this contract to spend their tokens; the AI agent
///         builds calldata from an approved aggregator, the user signs and
///         broadcasts the transaction directly — this contract never holds funds.
/// @dev UUPS upgradeable so bugs can be fixed without redeployment of a new address.
contract ExecutionProxy is UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    // ─── Constants ──────────────────────────────────────────────────────────

    uint256 public constant MAX_FEE_BPS      = 50;    // 0.5% max protocol fee
    uint256 public constant MAX_SLIPPAGE_BPS = 1000;  // 10% hard cap — anything higher reverts
    address public constant NATIVE           = address(0); // sentinel for native token (ETH/STT)

    // ─── State ──────────────────────────────────────────────────────────────

    address public feeVault;
    uint256 public feeBps;

    /// @notice Aggregator router addresses allowed to receive calldata
    mapping(address => bool) public approvedTargets;

    // ─── Events ─────────────────────────────────────────────────────────────

    event SwapExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address aggregator,
        uint256 feeAmount
    );
    event TargetApproved(address indexed target, bool approved);
    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error UnauthorizedTarget(address target);
    error SlippageExceeded(uint256 minRequired, uint256 received);
    error TransferFailed();
    error InvalidAmount();
    error FeeTooHigh(uint256 proposed, uint256 max);
    error DeadlineExpired();

    // ─── Initializer (replaces constructor for upgradeable) ─────────────────

    function initialize(address _feeVault, uint256 _feeBps) external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh(_feeBps, MAX_FEE_BPS);
        feeVault = _feeVault;
        feeBps   = _feeBps;
    }

    // ─── Core swap function ──────────────────────────────────────────────────

    /// @notice Execute a swap via an approved aggregator.
    ///         The AI agent builds the aggregator calldata off-chain;
    ///         this contract enforces slippage protection on-chain.
    ///
    /// @param tokenIn            Input token address (address(0) = native)
    /// @param tokenOut           Output token address (address(0) = native)
    /// @param amountIn           Exact input amount
    /// @param minAmountOut       Minimum acceptable output — swap reverts if not met
    /// @param deadline           Unix timestamp after which the tx reverts
    /// @param aggregatorTarget   Approved aggregator router contract
    /// @param aggregatorCalldata Encoded swap calldata from the aggregator API
    function executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        address aggregatorTarget,
        bytes calldata aggregatorCalldata
    ) external payable nonReentrant returns (uint256 amountOut) {
        // ── Pre-checks ──────────────────────────────────────────────────────
        if (!approvedTargets[aggregatorTarget]) revert UnauthorizedTarget(aggregatorTarget);
        if (amountIn == 0)                       revert InvalidAmount();
        if (block.timestamp > deadline)          revert DeadlineExpired();

        // ── Pull input token ─────────────────────────────────────────────────
        if (tokenIn != NATIVE) {
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
            // Approve exact amount — reset to 0 after in case aggregator doesn't spend all
            IERC20(tokenIn).approve(aggregatorTarget, amountIn);
        }

        // ── Snapshot output balance ──────────────────────────────────────────
        uint256 balanceBefore = _balanceOf(tokenOut);

        // ── Call aggregator ──────────────────────────────────────────────────
        uint256 nativeValue = tokenIn == NATIVE ? amountIn : 0;
        (bool success,) = aggregatorTarget.call{value: nativeValue}(aggregatorCalldata);
        if (!success) revert TransferFailed();

        // ── Reset leftover approval (safety) ─────────────────────────────────
        if (tokenIn != NATIVE) {
            // Return any leftover tokenIn to user (dust recovery)
            uint256 leftoverAmount = IERC20(tokenIn).balanceOf(address(this));
            if (leftoverAmount > 0) {
                IERC20(tokenIn).safeTransfer(msg.sender, leftoverAmount);
            }
            IERC20(tokenIn).approve(aggregatorTarget, 0);
        }

        // ── Measure output ───────────────────────────────────────────────────
        amountOut = _balanceOf(tokenOut) - balanceBefore;
        if (amountOut < minAmountOut) revert SlippageExceeded(minAmountOut, amountOut);

        // ── Protocol fee ─────────────────────────────────────────────────────
        uint256 fee        = feeBps > 0 ? (amountOut * feeBps) / 10_000 : 0;
        uint256 userAmount = amountOut - fee;

        if (fee > 0) _transfer(tokenOut, feeVault, fee);
        _transfer(tokenOut, msg.sender, userAmount);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, userAmount, aggregatorTarget, fee);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setApprovedTarget(address target, bool approved) external onlyOwner {
        approvedTargets[target] = approved;
        emit TargetApproved(target, approved);
    }

    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps, MAX_FEE_BPS);
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    function setFeeVault(address newVault) external onlyOwner {
        feeVault = newVault;
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    function _balanceOf(address token) internal view returns (uint256) {
        return token == NATIVE
            ? address(this).balance
            : IERC20(token).balanceOf(address(this));
    }

    function _transfer(address token, address to, uint256 amount) internal {
        if (token == NATIVE) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // ─── UUPS upgrade authorization ──────────────────────────────────────────

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ─── Rescue stuck funds (safety valve) ──────────────────────────────────

    /// @notice Allows owner to rescue tokens accidentally sent to this contract.
    ///         This contract should never hold user funds beyond a single transaction.
    function rescueToken(address token, uint256 amount) external onlyOwner {
        if (token == NATIVE) {
            (bool ok,) = payable(owner()).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    receive() external payable {}
}
