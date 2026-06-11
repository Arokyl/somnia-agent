// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @dev Minimal ERC20 interface used by the direct deployment variant.
interface IERC20Direct {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title ExecutionProxyDirect
/// @notice Non-upgradeable Somnia deployment variant of ExecutionProxy.
/// @dev Keeps the swap/admin behavior while avoiding UUPS/proxy deployment bytecode.
contract ExecutionProxyDirect {
    uint256 public constant MAX_FEE_BPS = 50;
    uint256 public constant MAX_SLIPPAGE_BPS = 1000;
    address public constant NATIVE = address(0);

    address public owner;
    address public feeVault;
    uint256 public feeBps;

    mapping(address => bool) public approvedTargets;

    uint256 private locked;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
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

    error UnauthorizedTarget(address target);
    error SlippageExceeded(uint256 minRequired, uint256 received);
    error TransferFailed();
    error InvalidAmount();
    error FeeTooHigh(uint256 proposed, uint256 max);
    error DeadlineExpired();
    error NotOwner();
    error Reentrant();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked == 1) revert Reentrant();
        locked = 1;
        _;
        locked = 0;
    }

    constructor(address _feeVault, uint256 _feeBps) {
        if (_feeVault == address(0)) revert ZeroAddress();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh(_feeBps, MAX_FEE_BPS);

        owner = msg.sender;
        feeVault = _feeVault;
        feeBps = _feeBps;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        address aggregatorTarget,
        bytes calldata aggregatorCalldata
    ) external payable nonReentrant returns (uint256 amountOut) {
        if (!approvedTargets[aggregatorTarget]) revert UnauthorizedTarget(aggregatorTarget);
        if (amountIn == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert DeadlineExpired();

        if (tokenIn != NATIVE) {
            _safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);
            _safeApprove(tokenIn, aggregatorTarget, amountIn);
        }

        uint256 balanceBefore = _balanceOf(tokenOut);
        uint256 nativeValue = tokenIn == NATIVE ? amountIn : 0;

        (bool success,) = aggregatorTarget.call{value: nativeValue}(aggregatorCalldata);
        if (!success) revert TransferFailed();

        if (tokenIn != NATIVE) {
            uint256 leftoverAmount = IERC20Direct(tokenIn).balanceOf(address(this));
            if (leftoverAmount > 0) {
                _safeTransfer(tokenIn, msg.sender, leftoverAmount);
            }
            _safeApprove(tokenIn, aggregatorTarget, 0);
        }

        amountOut = _balanceOf(tokenOut) - balanceBefore;
        if (amountOut < minAmountOut) revert SlippageExceeded(minAmountOut, amountOut);

        uint256 fee = feeBps > 0 ? (amountOut * feeBps) / 10_000 : 0;
        uint256 userAmount = amountOut - fee;

        if (fee > 0) _transfer(tokenOut, feeVault, fee);
        _transfer(tokenOut, msg.sender, userAmount);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, userAmount, aggregatorTarget, fee);
    }

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
        if (newVault == address(0)) revert ZeroAddress();
        feeVault = newVault;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function rescueToken(address token, uint256 amount) external onlyOwner {
        _transfer(token, owner, amount);
    }

    function _balanceOf(address token) internal view returns (uint256) {
        return token == NATIVE ? address(this).balance : IERC20Direct(token).balanceOf(address(this));
    }

    function _transfer(address token, address to, uint256 amount) internal {
        if (token == NATIVE) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            _safeTransfer(token, to, amount);
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20Direct.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20Direct.transferFrom, (from, to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeApprove(address token, address spender, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20Direct.approve, (spender, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    receive() external payable {}
}
