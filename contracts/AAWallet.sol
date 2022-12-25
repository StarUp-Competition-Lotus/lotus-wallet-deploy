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

    // EVENTS

    event GuardianAdded(address indexed walletAddr, address indexed guardian);
    event GuardianRemoved(address indexed walletAddr, address indexed guardian);

    event RecoveryInitiated(
        address indexed walletAddr,
        uint256 indexed recoverCycle,
        address newSigningAddress,
        address[] requiredGuardians,
        address initiator
    );
    event RecoverySupported(
        address indexed walletAddr,
        uint256 indexed recoverIndex,
        address guardianSupported
    );
    event RecoveryCanceled(address indexed walletAddr, uint256 indexed recoverIndex);
    event RecoveryExecuted(address indexed walletAddr, uint256 indexed recoverIndex);

    event WithdrawRequestCreated(
        address indexed walletAddr,
        uint256 indexed withdrawIndex,
        address receiver,
        uint256 amount,
        address[] requiredGuardians
    );
    event WithdrawRequestApproved(
        address indexed walletAddr,
        uint256 indexed withdrawIndex,
        address guardianApproved
    );
    event WithdrawRequestCanceled(address indexed walletAddr, uint256 indexed withdrawIndex);
    event WithdrawRequestExecuted(address indexed walletAddr, uint256 indexed withdrawIndex);

    // ---------------------------------------------

    // VARIABLES

    // main variables
    address private signingAddress;
    address[] public guardians;
    mapping(address => bool) private isGuardian;

    // social recovery variables
    struct Recovery {
        address newSigningAddress;
        mapping(address => bool) recoverySupports;
        mapping(address => bool) requiredGuardiansMapping;
        address[] requiredGuardians;
    }
    bool private inRecovery;
    uint256 private recoveryCycle;
    mapping(uint256 => Recovery) private recoveryRounds;

    // withdraw requests variables
    struct WithdrawRequest {
        address receiver;
        uint256 amount;
        mapping(address => bool) approvals;
        mapping(address => bool) requiredGuardiansMapping;
        address[] requiredGuardians;
        bool isActive;
    }
    mapping(uint256 => WithdrawRequest) private withdrawRequests;
    uint256 private withdrawRequestsCount;

    bytes4 constant EIP1271_SUCCESS_RETURN_VALUE = 0x1626ba7e;

    // ---------------------------------------------

    // MODIFIERS

    modifier onlyBootloader() {
        require(msg.sender == BOOTLOADER_FORMAL_ADDRESS, "Only bootloader can call this method");
        _;
    }

    modifier ownerOrWallet() {
        require(
            msg.sender == BOOTLOADER_FORMAL_ADDRESS ||
                msg.sender == signingAddress ||
                msg.sender == address(this),
            "Only owner or bootloader can call this method"
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

    // ---------------------------------------------

    // CONSTRUCTOR

    constructor(address _signingAddress) {
        signingAddress = _signingAddress;
    }

    // ---------------------------------------------

    // AA FUNCTIONS

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

    // -------------------------------------------------

    // GUARDIAN FUNCTIONS

    function addGuardian(address _guardian) external ownerOrWallet {
        require(
            !isGuardian[_guardian] && _guardian != signingAddress && _guardian != address(this),
            "Invalid Guardian Address"
        );
        guardians.push(_guardian);
        isGuardian[_guardian] = true;
        emit GuardianAdded(address(this), _guardian);
    }

    function removeGuardian(uint256 index) external ownerOrWallet {
        require(index < guardians.length);
        address removedGuardian = guardians[index];
        for (uint256 i = index; i < guardians.length - 1; i++) {
            guardians[i] = guardians[i + 1];
        }
        delete isGuardian[removedGuardian];
        guardians.pop();
        emit GuardianRemoved(address(this), removedGuardian);
    }

    // -------------------------------------------------

    // SOCIAL RECOVERY FUNCTIONS

    function initiateRecovery(address _newSigningAddress) external notInRecovery {
        require(isGuardian[msg.sender], "Only guardian can call this method");
        recoveryCycle++;
        Recovery storage newRecovery = recoveryRounds[recoveryCycle];
        newRecovery.newSigningAddress = _newSigningAddress;
        newRecovery.recoverySupports[msg.sender] = true;
        for (uint256 i = 0; i < guardians.length; i++) {
            newRecovery.requiredGuardiansMapping[guardians[i]] = true;
        }
        newRecovery.requiredGuardians = guardians;
        inRecovery = true;
        emit RecoveryInitiated(
            address(this),
            recoveryCycle,
            _newSigningAddress,
            guardians,
            msg.sender
        );
    }

    function supportRecovery() external onlyInRecovery {
        Recovery storage recovery = recoveryRounds[recoveryCycle];
        require(recovery.requiredGuardiansMapping[msg.sender], "not a required guardian");
        require(!recovery.recoverySupports[msg.sender], "already support this recovery");
        recovery.recoverySupports[msg.sender] = true;
        emit RecoverySupported(address(this), recoveryCycle, msg.sender);
    }

    function cancelRecovery() external ownerOrWallet onlyInRecovery {
        inRecovery = false;
        emit RecoveryCanceled(address(this), recoveryCycle);
    }

    function executeRecovery() external onlyInRecovery {
        Recovery storage recovery = recoveryRounds[recoveryCycle];
        require(recovery.requiredGuardiansMapping[msg.sender], "not a required guardian");
        for (uint i = 0; i < recovery.requiredGuardians.length; i++) {
            require(
                recovery.recoverySupports[recovery.requiredGuardians[i]],
                "all guardians must support recovery"
            );
        }
        signingAddress = recovery.newSigningAddress;
        inRecovery = false;
        emit RecoveryExecuted(address(this), recoveryCycle);
    }

    // VAULT FUNCTIONS

    function createWithdrawRequest(uint256 _amount, address _receiver) external ownerOrWallet {
        require(_amount > 0 && _amount <= address(this).balance, "Invalid Amount");
        WithdrawRequest storage newRequest = withdrawRequests[withdrawRequestsCount];
        newRequest.amount = _amount;
        newRequest.receiver = _receiver;
        newRequest.isActive = true;
        for (uint256 i = 0; i < guardians.length; i++) {
            newRequest.requiredGuardiansMapping[guardians[i]] = true;
        }
        newRequest.requiredGuardians = guardians;
        withdrawRequestsCount++;
        emit WithdrawRequestCreated(
            address(this),
            withdrawRequestsCount,
            _receiver,
            _amount,
            guardians
        );
    }

    function approveWithdrawRequest(uint256 index) external {
        require(index <= withdrawRequestsCount);
        WithdrawRequest storage request = withdrawRequests[index];
        require(request.requiredGuardiansMapping[msg.sender], "Not a required guardian");
        require(request.isActive, "Request is not active");
        require(!request.approvals[msg.sender], "Already approved this request");
        request.approvals[msg.sender] = true;
        emit WithdrawRequestApproved(address(this), withdrawRequestsCount, msg.sender);
    }

    function cancelWithdrawRequest(uint256 index) external ownerOrWallet {
        require(index <= withdrawRequestsCount);
        require(withdrawRequests[index].isActive);
        withdrawRequests[index].isActive = false;
        emit WithdrawRequestCanceled(address(this), index);
    }

    function executeWithdrawRequest(uint256 index) external ownerOrWallet {
        require(index <= withdrawRequestsCount);
        require(withdrawRequests[index].isActive);
        WithdrawRequest storage request = withdrawRequests[index];
        require(request.amount <= address(this).balance, "Insufficient Balance");
        for (uint i = 0; i < request.requiredGuardians.length; i++) {
            require(
                request.approvals[request.requiredGuardians[i]],
                "all guardians must approve withdraw"
            );
        }
        (bool success, ) = payable(request.receiver).call{value: request.amount}("");
        require(success, "Transfer failed");
        request.isActive = false;
        emit WithdrawRequestExecuted(address(this), index);
    }

    // -------------------------------------------------

    // GETTER FUNCTIONS

    function getSigningAddress() public view ownerOrWallet returns (address) {
        return signingAddress;
    }

    function getGuardians() public view ownerOrWallet returns (address[] memory) {
        return guardians;
    }

    function getRecoveryState() public view ownerOrWallet returns (bool) {
        return inRecovery;
    }

    function getRecoveryCycle() public view ownerOrWallet returns (uint256) {
        return recoveryCycle;
    }

    function getWithdrawRequestsCount() public view ownerOrWallet returns (uint256) {
        return withdrawRequestsCount;
    }
}
