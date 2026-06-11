// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract DeployProbe {
    address public owner;
    uint256 public value;

    constructor(uint256 initialValue) {
        owner = msg.sender;
        value = initialValue;
    }
}
