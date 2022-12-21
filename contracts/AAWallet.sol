// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@matterlabs/zksync-contracts/l2/system-contracts/interfaces/IAccount.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/TransactionHelper.sol";

import "@openzeppelin/contracts/interfaces/IERC1271.sol";

// Used for signature validation
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// Access zkSync system contracts, in this case for nonce validation vs NONCE_HOLDER_SYSTEM_CONTRACT
import "@matterlabs/zksync-contracts/l2/system-contracts/Constants.sol";
// to call non-view method of system contracts
import "@matterlabs/zksync-contracts/l2/system-contracts/SystemContractsCaller.sol";

contract AAWallet is IAccount, IERC1271 {
    // to get transaction hash
    using TransactionHelper for Transaction;

    // state variables for account owners
    address private signingAddress;
    address[] public guardians;
    
    mapping(address => bool) private isGuardian;

    bool private inRecovery;
    uint256 private recoveryCycle;
    struct Recovery {
        address newSigningAddress;
        uint256 revoveryRound;
        bool isRecoveryExecuted;
    }
    mapping(address => Recovery) private guardianToRecovery;

    bytes4 constant EIP1271_SUCCESS_RETURN_VALUE = 0x1626ba7e;

    modifier onlyBootloader() {
        require(msg.sender == BOOTLOADER_FORMAL_ADDRESS, "Only bootloader can call this method");
        _;
    }

    modifier onlyGuardian() {
        require(isGuardian[msg.sender], "Only guardian can call this method");
        _;
    }

    modifier ownerOrWallet() {
        require(
            msg.sender == BOOTLOADER_FORMAL_ADDRESS ||
                msg.sender == signingAddress ||
                msg.sender == address(this),
            "Only guardian or bootloader can call this method"
        );
        _;
    }

    modifier notInRecovery() {
        require(!inRecovery, "The wallet must not be in recovery mode");
        _;
    }

    modifier onlyInRecovery() {
        require(inRecovery, "The wallet must be in recovery mode");
        _;
    }

    constructor(address _signingAddress) {
        // should not pass secret as params for security reasons
        signingAddress = _signingAddress;
    }

    function validateTransaction(
        bytes32,
        bytes32 _suggestedSignedHash,
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        _validateTransaction(_suggestedSignedHash, _transaction);
    }

    function _validateTransaction(
        bytes32 _suggestedSignedHash,
        Transaction calldata _transaction
    ) internal {
        // Incrementing the nonce of the account.
        // Note, that reserved[0] by convention is currently equal to the nonce passed in the transaction
        SystemContractsCaller.systemCall(
            uint32(gasleft()),
            address(NONCE_HOLDER_SYSTEM_CONTRACT),
            0,
            abi.encodeCall(INonceHolder.incrementMinNonceIfEquals, (_transaction.reserved[0]))
        );

        bytes32 txHash;
        // While the suggested signed hash is usually provided, it is generally
        // not recommended to rely on it to be present, since in the future
        // there may be tx types with no suggested signed hash.
        if (_suggestedSignedHash == bytes32(0)) {
            txHash = _transaction.encodeHash();
        } else {
            txHash = _suggestedSignedHash;
        }

        require(isValidSignature(txHash, _transaction.signature) == EIP1271_SUCCESS_RETURN_VALUE);
    }

    function executeTransaction(
        bytes32,
        bytes32,
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        _executeTransaction(_transaction);
    }

    function _executeTransaction(Transaction calldata _transaction) internal {
        address to = address(uint160(_transaction.to));
        uint256 value = _transaction.reserved[1];
        bytes memory data = _transaction.data;

        if (to == address(DEPLOYER_SYSTEM_CONTRACT)) {
            // We allow calling ContractDeployer with any calldata
            SystemContractsCaller.systemCall(
                uint32(gasleft()),
                to,
                uint128(_transaction.reserved[1]), // By convention, reserved[1] is `value`
                _transaction.data
            );
        } else {
            bool success;
            assembly {
                success := call(gas(), to, value, add(data, 0x20), mload(data), 0, 0)
            }
            require(success);
        }
    }

    function executeTransactionFromOutside(Transaction calldata _transaction) external payable {
        _validateTransaction(bytes32(0), _transaction);

        _executeTransaction(_transaction);
    }

    function isValidSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) public view override returns (bytes4) {
        // uint signatureLength = _signature.length;
        // require(
        //     signatureLength >= 65 && signatureLength % 65 == 0,
        //     "Signature length is incorrect"
        // );

        // if (signatureLength == 65) {
        //     address recoveredAddr = ECDSA.recover(_hash, _signature);
        //     require(recoveredAddr == signingAddress, "Signature is incorrect");
        //     return EIP1271_SUCCESS_RETURN_VALUE;
        // }

        // for (uint256 i = 0; i < signatureLength; i += 1) {
        //     address curGuardianAddr = guardians[i];
        //     address curRecoveredAddr = ECDSA.recover(_hash, _signature[i * 65:i * 65 + 65]);
        //     require(curRecoveredAddr == curGuardianAddr, "Signature is incorrect");
        // }

        require(_signature.length == 65, "Incorect Length");

        address RecoveredAddr = ECDSA.recover(_hash, _signature[0:65]);
        require(RecoveredAddr == signingAddress, "Signature is incorrect");

        return EIP1271_SUCCESS_RETURN_VALUE;
    }

    function payForTransaction(
        bytes32,
        bytes32,
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        bool success = _transaction.payToTheBootloader();
        require(success, "Failed to pay the fee to the operator");
    }

    function prePaymaster(
        bytes32,
        bytes32,
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        _transaction.processPaymasterInput();
    }

    receive() external payable {
        // If the bootloader called the `receive` function, it likely means
        // that something went wrong and the transaction should be aborted. The bootloader should
        // only interact through the `validateTransaction`/`executeTransaction` methods.
        assert(msg.sender != BOOTLOADER_FORMAL_ADDRESS);
    }

    // GUARDIAN FUNCTIONS
    // add guardian
    function addGuardian(address _guardian) external ownerOrWallet {
        require(
            !isGuardian[_guardian] && _guardian != signingAddress && _guardian != address(this),
            "Invalid Guardian Address"
        );
        guardians.push(_guardian);
        isGuardian[_guardian] = true;
    }

    // initiate remove guardian
    // execute remove guardian
    // cancel remove guardian
    // -------------------------------------------------

    // SOCIAL RECOVERY FUNCTIONS
    // initiate social recovery
    function initiateRecovery(address _newSigningAddress) onlyGuardian notInRecovery external {
        // we are entering a new recovery round
        recoveryCycle++;
        guardianToRecovery[msg.sender] = Recovery(
            _newSigningAddress,
            recoveryCycle, 
            false
        );
        inRecovery = true;
    }

    function supportRecovery(address _newSigningAddress) onlyGuardian onlyInRecovery external {
        guardianToRecovery[msg.sender] = Recovery(
            _newSigningAddress,
            recoveryCycle, 
            false
        );
    }

    function cancelRecovery() ownerOrWallet onlyInRecovery external {
        inRecovery = false;
    }

    function executeRecovery(address _newSigningAddress) onlyGuardian onlyInRecovery external {
        for (uint i = 0; i < guardians.length; i++) {
            // cache recovery struct in memory
            Recovery memory recovery = guardianToRecovery[guardians[i]];

            require(recovery.revoveryRound == recoveryCycle, "round mismatch");
            require(recovery.newSigningAddress == _newSigningAddress, "disagreement on new owner");
            require(!recovery.isRecoveryExecuted, "duplicate guardian used in recovery");

            // set field to true in storage, not memory
            guardianToRecovery[guardians[i]].isRecoveryExecuted = true;
        }

        inRecovery = false;
        signingAddress = _newSigningAddress;
    }

    // VAULT FUNCTIONS
    // initiate withdraw
    // cancel withdraw
    // approve withdraw
    // execute witdraw

    // -------------------------------------------------
    // GETTER FUNCTIONS
    function getSigningAddress() public view ownerOrWallet returns (address) {
        return signingAddress;
    }

    function getGuardians() public view ownerOrWallet returns (address[] memory) {
        return guardians;
    }
}
