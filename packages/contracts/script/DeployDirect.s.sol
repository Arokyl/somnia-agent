// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ExecutionProxyDirect.sol";

contract DeployDirect is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address feeVault = vm.envOr("FEE_VAULT", vm.addr(deployerKey));
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(10));

        if (deployerKey != 0) {
            vm.startBroadcast(deployerKey);
        } else {
            vm.startBroadcast();
        }

        ExecutionProxyDirect executionProxy = new ExecutionProxyDirect(feeVault, feeBps);

        console.log("ExecutionProxyDirect:", address(executionProxy));
        console.log("Owner:", executionProxy.owner());
        console.log("Fee vault:", executionProxy.feeVault());
        console.log("Fee bps:", executionProxy.feeBps());

        vm.stopBroadcast();
    }
}
