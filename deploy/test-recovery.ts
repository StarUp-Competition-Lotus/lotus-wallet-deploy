import { Wallet, Provider } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { executeAAWalletTransaction } from "../utils"

const WALLET_ADDRESS = process.env.WALLET_ADDRESS as string
const WALLET_SIGNING_KEY = process.env.WALLET_SIGNING_KEY as string
const GUARDIAN_ADDRESS_1 = process.env.GUARDIAN_ADDRESS_1 as string
const GUARDIAN_ADDRESS_2 = process.env.GUARDIAN_ADDRESS_2 as string
const GUARDIAN_SK_1 = process.env.GUARDIAN_SK_1 as string
const GUARDIAN_SK_2 = process.env.GUARDIAN_SK_2 as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const guardianSigningAccount = new Wallet(GUARDIAN_SK_1).connect(provider)
    const ownerSigningAccount = new Wallet(WALLET_SIGNING_KEY).connect(provider)
    const walletArtifact = await hre.artifacts.readArtifact("AAWallet")

    const walletSignedByOwner = new ethers.Contract(
        WALLET_ADDRESS,
        walletArtifact.abi,
        ownerSigningAccount
    )
    const walletSignedByGuardian = new ethers.Contract(
        WALLET_ADDRESS,
        walletArtifact.abi,
        guardianSigningAccount
    )

    const { address: newSigningAddr, privateKey: newSigningKey } = Wallet.createRandom()

    console.log("adding guardians...")
    const addGuardian1Tx = await walletSignedByOwner.populateTransaction.addGuardian(GUARDIAN_ADDRESS_1)
    const addGuardian2Tx = await walletSignedByOwner.populateTransaction.addGuardian(GUARDIAN_ADDRESS_2)
    await executeAAWalletTransaction(WALLET_ADDRESS, WALLET_SIGNING_KEY, addGuardian1Tx, provider)
    await executeAAWalletTransaction(WALLET_ADDRESS, WALLET_SIGNING_KEY, addGuardian2Tx, provider)
    const guardians = await walletSignedByOwner.getGuardians()
    console.log("Guardians: ", guardians)

    console.log("initiating recovery: ")
    let initiateRecoveryTx = await walletSignedByGuardian.populateTransaction.initiateRecovery(
        newSigningAddr
    )

    await executeAAWalletTransaction(
        GUARDIAN_ADDRESS_1,
        GUARDIAN_SK_1,
        initiateRecoveryTx,
        provider
    )

    console.log("recovery initiated. supporting recovery")
    let supportRecoveryTx = await walletSignedByGuardian.populateTransaction.supportRecovery()

    await executeAAWalletTransaction(GUARDIAN_ADDRESS_2, GUARDIAN_SK_2, supportRecoveryTx, provider)

    console.log("recovery supported. executing recovery")
    let executeRecoveryTx = await walletSignedByGuardian.populateTransaction.executeRecovery()

    await executeAAWalletTransaction(GUARDIAN_ADDRESS_2, GUARDIAN_SK_2, executeRecoveryTx, provider)
    console.log("recovery executed. checking whether new sk works:")

    const newSigningAccount = new Wallet(newSigningKey).connect(provider)
    const newSignatureWallet = new ethers.Contract(
        WALLET_ADDRESS,
        walletArtifact.abi,
        newSigningAccount
    )
    const checkNewSigningKeyTx = await newSignatureWallet.getSigningAddress()
    console.log("new signing address: ", checkNewSigningKeyTx)
}
