// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/ExecutionProxy.sol";

/// @dev Minimal mock ERC-20 for testing
contract MockERC20 {
    string public symbol;
    uint8  public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _symbol) { symbol = _symbol; }

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        return true;
    }
}

/// @dev Mock aggregator that just returns a fixed output amount
contract MockAggregator {
    MockERC20 public outputToken;
    uint256   public outputAmount;

    constructor(MockERC20 _out, uint256 _amount) {
        outputToken  = _out;
        outputAmount = _amount;
    }

    fallback() external payable {
        // Simulate a successful swap by minting output tokens to the caller
        outputToken.mint(msg.sender, outputAmount);
    }
}

contract ExecutionProxyTest is Test {
    ExecutionProxy proxy;
    MockERC20      tokenIn;
    MockERC20      tokenOut;
    MockAggregator aggregator;

    address owner   = address(this);
    address user    = makeAddr("user");
    address vault   = makeAddr("vault");

    function setUp() public {
        // Deploy implementation
        ExecutionProxy impl = new ExecutionProxy();

        // Deploy proxy
        bytes memory initData = abi.encodeCall(ExecutionProxy.initialize, (vault, 10)); // 0.1% fee
        ERC1967Proxy proxyContract = new ERC1967Proxy(address(impl), initData);
        proxy = ExecutionProxy(payable(address(proxyContract)));

        // Deploy tokens
        tokenIn  = new MockERC20("WETH");
        tokenOut = new MockERC20("USDC");

        // Deploy mock aggregator (returns 2000 USDC for 1 WETH)
        aggregator = new MockAggregator(tokenOut, 2000e6);

        // Approve aggregator in proxy
        proxy.setApprovedTarget(address(aggregator), true);

        // Fund user with tokenIn
        tokenIn.mint(user, 10 ether);
    }

    function test_basicSwap() public {
        uint256 amountIn     = 1 ether;
        uint256 minAmountOut = 1900e6; // 1900 USDC minimum (5% slippage tolerance)

        vm.startPrank(user);
        tokenIn.approve(address(proxy), amountIn);

        uint256 userUsdcBefore = tokenOut.balanceOf(user);

        proxy.executeSwap(
            address(tokenIn),
            address(tokenOut),
            amountIn,
            minAmountOut,
            block.timestamp + 300,
            address(aggregator),
            ""
        );

        uint256 received = tokenOut.balanceOf(user) - userUsdcBefore;

        // User should get 2000 USDC minus 0.1% fee = 1998 USDC
        assertGt(received, minAmountOut, "User received less than minimum");
        assertLt(received, 2000e6,       "Fee was not taken");
        vm.stopPrank();
    }

    function test_revert_slippageExceeded() public {
        uint256 amountIn     = 1 ether;
        uint256 minAmountOut = 2100e6; // More than aggregator returns — should revert

        vm.startPrank(user);
        tokenIn.approve(address(proxy), amountIn);

        vm.expectRevert(abi.encodeWithSelector(ExecutionProxy.SlippageExceeded.selector, 2100e6, 2000e6));
        proxy.executeSwap(
            address(tokenIn),
            address(tokenOut),
            amountIn,
            minAmountOut,
            block.timestamp + 300,
            address(aggregator),
            ""
        );
        vm.stopPrank();
    }

    function test_revert_unauthorizedTarget() public {
        address fakeAggregator = makeAddr("fake");

        vm.startPrank(user);
        tokenIn.approve(address(proxy), 1 ether);

        vm.expectRevert(abi.encodeWithSelector(ExecutionProxy.UnauthorizedTarget.selector, fakeAggregator));
        proxy.executeSwap(
            address(tokenIn),
            address(tokenOut),
            1 ether,
            0,
            block.timestamp + 300,
            fakeAggregator,
            ""
        );
        vm.stopPrank();
    }

    function test_revert_deadlineExpired() public {
        vm.startPrank(user);
        tokenIn.approve(address(proxy), 1 ether);

        vm.expectRevert(ExecutionProxy.DeadlineExpired.selector);
        proxy.executeSwap(
            address(tokenIn),
            address(tokenOut),
            1 ether,
            0,
            block.timestamp - 1, // expired
            address(aggregator),
            ""
        );
        vm.stopPrank();
    }

    function test_revert_zeroAmount() public {
        vm.startPrank(user);
        vm.expectRevert(ExecutionProxy.InvalidAmount.selector);
        proxy.executeSwap(address(tokenIn), address(tokenOut), 0, 0, block.timestamp + 300, address(aggregator), "");
        vm.stopPrank();
    }

    function test_feeCalculation(uint256 amountIn) public {
        amountIn = bound(amountIn, 0.001 ether, 5 ether);
        uint256 expectedOut = (amountIn / 1e12) * 2000; // rough USDC equivalent

        vm.startPrank(user);
        tokenIn.mint(user, amountIn);
        tokenIn.approve(address(proxy), amountIn);

        // Update mock to return proportional amount
        aggregator = new MockAggregator(tokenOut, expectedOut);
        // stop acting as user so we can call owner-only admin function
        vm.stopPrank();
        proxy.setApprovedTarget(address(aggregator), true);

        // resume acting as user for the swap
        vm.startPrank(user);

        uint256 vaultBefore = tokenOut.balanceOf(vault);
        proxy.executeSwap(address(tokenIn), address(tokenOut), amountIn, 0, block.timestamp + 300, address(aggregator), "");

        uint256 feeCollected = tokenOut.balanceOf(vault) - vaultBefore;
        uint256 expectedFee  = (expectedOut * 10) / 10_000; // 0.1% fee
        assertApproxEqRel(feeCollected, expectedFee, 0.01e18, "Fee calculation wrong");
        vm.stopPrank();
    }
}
