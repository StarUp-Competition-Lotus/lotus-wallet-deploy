// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@matterlabs/zksync-contracts/l2/system-contracts/Constants.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/SystemContractsCaller.sol";

contract WalletFactory {
    bytes32 public aaBytecodeHash;

    event WalletCreated(address indexed walletAddress, address indexed signingAddress);

    constructor(bytes32 _aaBytecodeHash) {
        aaBytecodeHash = _aaBytecodeHash;
    }

    function deployWallet(
        bytes32 salt,
        address signingAddress
    ) external returns (address walletAddress) {
        bytes memory returnData = SystemContractsCaller.systemCall(
            uint32(gasleft()),
            address(DEPLOYER_SYSTEM_CONTRACT),
            0,
            abi.encodeCall(
                DEPLOYER_SYSTEM_CONTRACT.create2Account,
                (salt, aaBytecodeHash, abi.encode(signingAddress))
            )
        );

        (walletAddress, ) = abi.decode(returnData, (address, bytes));
        emit WalletCreated(walletAddress, signingAddress);
    }
}
