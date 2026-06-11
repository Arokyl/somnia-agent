// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployProxy is Script {
    function run() external {
        address impl = vm.envAddress("IMPLEMENTATION_ADDRESS");
        require(impl != address(0), "IMPLEMENTATION_ADDRESS not set");

        vm.startBroadcast();
        ERC1967Proxy proxy = new ERC1967Proxy(impl, "");
        console.log("Deployed proxy:", address(proxy));
        vm.stopBroadcast();
    }
}
