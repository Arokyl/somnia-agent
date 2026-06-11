// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IExecutionProxy {
    function executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        address aggregatorTarget,
        bytes calldata aggregatorCalldata
    ) external payable returns (uint256 amountOut);

    function approvedTargets(address target) external view returns (bool);
    function feeBps() external view returns (uint256);
    function feeVault() external view returns (address);
}
