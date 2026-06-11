// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/ExecutionProxy.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address feeVault = vm.envOr("FEE_VAULT", vm.addr(deployerKey));
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(10));

        // Use env private key to sign broadcast transactions, or fallback to CLI key.
        // Set DEPLOYER_PRIVATE_KEY as a decimal value for vm.envUint.
        if (deployerKey != 0) {
            vm.startBroadcast(deployerKey);
        } else {
            vm.startBroadcast();
        }

        // Deploy implementation
        ExecutionProxy impl = new ExecutionProxy();

        // Deploy proxy WITHOUT calling initialize in constructor to avoid delegatecall-in-constructor issues
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), "");
        ExecutionProxy proxied = ExecutionProxy(payable(address(proxy)));

        // Initialize the proxied implementation via a separate external call
        proxied.initialize(feeVault, feeBps);

        console.log("ExecutionProxy (proxy):", address(proxied));
        console.log("ExecutionProxy (impl):", address(impl));
        console.log("Fee vault:", feeVault);
        console.log("Fee bps:", feeBps);

        vm.stopBroadcast();
    }
}
