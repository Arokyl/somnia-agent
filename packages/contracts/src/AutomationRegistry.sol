// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IExecutionProxy.sol";

/// @title AutomationRegistry
/// @notice Stores conditional swap orders on-chain.
///         Off-chain keepers (your backend) monitor conditions and call executeOrder
///         when the condition is satisfied. All conditions are re-validated on-chain.
contract AutomationRegistry is UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    // ─── Types ───────────────────────────────────────────────────────────────

    struct ConditionalOrder {
        address user;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 maxGasPrice;       // tx.gasprice must be <= this to execute
        uint256 expiresAt;
        bool    active;
        address aggregatorTarget;
        bytes   aggregatorCalldata;
    }

    // ─── State ───────────────────────────────────────────────────────────────

    mapping(uint256 => ConditionalOrder) public orders;
    mapping(address => uint256[]) public userOrders;
    uint256 public nextOrderId;

    address public executionProxy;
    mapping(address => bool) public keepers;

    // ─── Events ──────────────────────────────────────────────────────────────

    event OrderCreated(uint256 indexed orderId, address indexed user, address tokenIn, address tokenOut, uint256 amountIn);
    event OrderExecuted(uint256 indexed orderId, uint256 amountOut);
    event OrderCancelled(uint256 indexed orderId);
    event KeeperUpdated(address indexed keeper, bool allowed);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error OrderInactive();
    error OrderExpired();
    error GasPriceTooHigh(uint256 current, uint256 max);
    error NotOrderOwner();

    // ─── Initializer ─────────────────────────────────────────────────────────

    function initialize(address _executionProxy) external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        executionProxy = _executionProxy;
    }

    // ─── User-facing: create order ───────────────────────────────────────────

    /// @notice Create a conditional order. The user must have approved
    ///         the ExecutionProxy to spend `amountIn` of `tokenIn`.
    function createOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 maxGasPrice,
        uint256 expiresAt,
        address aggregatorTarget,
        bytes calldata aggregatorCalldata
    ) external returns (uint256 orderId) {
        require(expiresAt > block.timestamp, "Expiry must be future");
        require(amountIn > 0, "amountIn must be > 0");

        orderId = nextOrderId++;
        orders[orderId] = ConditionalOrder({
            user:               msg.sender,
            tokenIn:            tokenIn,
            tokenOut:           tokenOut,
            amountIn:           amountIn,
            minAmountOut:       minAmountOut,
            maxGasPrice:        maxGasPrice,
            expiresAt:          expiresAt,
            active:             true,
            aggregatorTarget:   aggregatorTarget,
            aggregatorCalldata: aggregatorCalldata
        });

        userOrders[msg.sender].push(orderId);
        emit OrderCreated(orderId, msg.sender, tokenIn, tokenOut, amountIn);
    }

    // ─── Keeper: execute order ────────────────────────────────────────────────

    /// @notice Called by an approved keeper when all conditions are satisfied.
    ///         All conditions are re-checked here on-chain — the keeper cannot cheat.
    function executeOrder(uint256 orderId) external nonReentrant {
        if (!keepers[msg.sender]) revert Unauthorized();

        ConditionalOrder storage order = orders[orderId];

        if (!order.active)                    revert OrderInactive();
        if (block.timestamp > order.expiresAt) revert OrderExpired();
        if (tx.gasprice > order.maxGasPrice)  revert GasPriceTooHigh(tx.gasprice, order.maxGasPrice);

        // Mark inactive before external call (CEI pattern)
        order.active = false;

        // Pull tokens from user into this contract temporarily
        uint256 value = 0;
        if (order.tokenIn == address(0)) {
            // Native token — user must have pre-approved via a wrapper or we use WETH pattern
            // For MVP, require ERC-20 tokens only in on-chain orders
            revert("Native token orders not supported in v1");
        } else {
            IERC20(order.tokenIn).safeTransferFrom(order.user, address(this), order.amountIn);
            IERC20(order.tokenIn).approve(executionProxy, order.amountIn);
        }

        // Call ExecutionProxy
        uint256 amountOut = IExecutionProxy(executionProxy).executeSwap{value: value}(
            order.tokenIn,
            order.tokenOut,
            order.amountIn,
            order.minAmountOut,
            block.timestamp + 300, // 5 min deadline
            order.aggregatorTarget,
            order.aggregatorCalldata
        );

        // Reset approval for the execution proxy and send output to the user
        // best-effort: try to reset allowance to 0 for the execution proxy.
        // `safeApprove` is an internal library call and cannot be used with try/catch,
        // so call the external `approve` and handle failures gracefully.
        try IERC20(order.tokenIn).approve(executionProxy, 0) returns (bool ok) {
            // if token returns a bool, we ignore false result (best-effort)
            if (!ok) {
                // no-op: some tokens return false instead of reverting
            }
        } catch {
            // ignore failures (some tokens revert or have non-standard behavior)
        }

        IERC20(order.tokenOut).safeTransfer(order.user, amountOut);

        emit OrderExecuted(orderId, amountOut);
    }

    // ─── User: cancel order ───────────────────────────────────────────────────

    function cancelOrder(uint256 orderId) external {
        if (orders[orderId].user != msg.sender) revert NotOrderOwner();
        if (!orders[orderId].active)            revert OrderInactive();
        orders[orderId].active = false;
        emit OrderCancelled(orderId);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    function getUserOrders(address user) external view returns (uint256[] memory) {
        return userOrders[user];
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        require(keeper != address(0), "invalid keeper");
        keepers[keeper] = allowed;
        emit KeeperUpdated(keeper, allowed);
    }

    function setExecutionProxy(address proxy) external onlyOwner {
        require(proxy != address(0), "invalid proxy");
        executionProxy = proxy;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
    // Reserved storage gap for upgradeability
    uint256[50] private __gap;
}
