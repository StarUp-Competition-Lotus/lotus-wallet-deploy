import { Wallet, Provider } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { executeAAWalletTransaction, getBalance } from "../utils"

const PRIVATE_KEY = process.env.PRIVATE_KEY as string
const WALLET_ADDRESS = process.env.WALLET_ADDRESS as string
const WALLET_SIGNING_KEY = process.env.WALLET_SIGNING_KEY as string
const GUARDIAN_ADDRESS_1 = process.env.GUARDIAN_ADDRESS_1 as string
const GUARDIAN_ADDRESS_2 = process.env.GUARDIAN_ADDRESS_2 as string
const GUARDIAN_SK_1 = process.env.GUARDIAN_SK_1 as string
const GUARDIAN_SK_2 = process.env.GUARDIAN_SK_2 as string
const MY_ACCOUNT = process.env.MY_ACCOUNT as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const walletArtifact = await hre.artifacts.readArtifact("AAWallet")
    const userAccount = new Wallet(PRIVATE_KEY).connect(provider)

    const walletSigningAccount = new Wallet(WALLET_SIGNING_KEY).connect(provider)
    const guardian1SigningAccount = new Wallet(GUARDIAN_SK_1).connect(provider)
    const guardian2SigningAccount = new Wallet(GUARDIAN_SK_2).connect(provider)

    const wallet = new ethers.Contract(WALLET_ADDRESS, walletArtifact.abi, walletSigningAccount)

    // check balance
    const userBalance = await getBalance(userAccount.address, provider)
    console.log("userBalance :", userBalance)
    if (userBalance < 0.01) return

    // adding funds to signing account
    console.log("Adding funds to signing account...")
    await (
        await userAccount.sendTransaction({
            to: walletSigningAccount.address,
            value: ethers.utils.parseEther("0.002"),
        })
    ).wait()

    // check balance
    const walletBalance = await getBalance(wallet.address, provider)
    console.log("walletBalance :", walletBalance)
    if (walletBalance < 0.001) return

    // add guardians
    console.log("adding guardians...")
    const addGuardian1Tx = await wallet.populateTransaction.addGuardian(GUARDIAN_ADDRESS_1)
    const addGuardian2Tx = await wallet.populateTransaction.addGuardian(GUARDIAN_ADDRESS_2)
    await executeAAWalletTransaction(WALLET_ADDRESS, WALLET_SIGNING_KEY, addGuardian1Tx, provider)
    await executeAAWalletTransaction(WALLET_ADDRESS, WALLET_SIGNING_KEY, addGuardian2Tx, provider)
    const guardians = await wallet.getGuardians()
    console.log("Guardians: ", guardians)

    // create a withdrawal request
    console.log("creating withdrawal request...")
    const createWithdrawRequestTx = await wallet.populateTransaction.createWithdrawRequest(
        ethers.utils.parseUnits((0.001).toString(), "ether"),
        MY_ACCOUNT
    )
    await executeAAWalletTransaction(
        WALLET_ADDRESS,
        WALLET_SIGNING_KEY,
        createWithdrawRequestTx,
        provider
    )

    // guardians approve requests
    console.log("guardians approving requests...")
    const withdrawRequestByGuardian1 = new ethers.Contract(
        WALLET_ADDRESS,
        walletArtifact.abi,
        guardian1SigningAccount
    )
    const withdrawRequestByGuardian2 = new ethers.Contract(
        WALLET_ADDRESS,
        walletArtifact.abi,
        guardian2SigningAccount
    )
    const approveWithdrawRequestTx1 =
        await withdrawRequestByGuardian1.populateTransaction.approveWithdrawRequest(0)
    const approveWithdrawRequestTx2 =
        await withdrawRequestByGuardian2.populateTransaction.approveWithdrawRequest(0)
    await executeAAWalletTransaction(
        GUARDIAN_ADDRESS_1,
        GUARDIAN_SK_1,
        approveWithdrawRequestTx1,
        provider
    )
    await executeAAWalletTransaction(
        GUARDIAN_ADDRESS_2,
        GUARDIAN_SK_2,
        approveWithdrawRequestTx2,
        provider
    )
    console.log("guardians finish approving requests")

    let myAccBalance = await getBalance(MY_ACCOUNT, provider)
    console.log("myAccBalance :", myAccBalance)

    //owner execute withdrawal
    console.log("owner executing withdrawal...")
    const executeWithdrawRequestTx = await wallet.populateTransaction.executeWithdrawRequest(0)
    await executeAAWalletTransaction(
        WALLET_ADDRESS,
        WALLET_SIGNING_KEY,
        executeWithdrawRequestTx,
        provider
    )

    myAccBalance = await getBalance(MY_ACCOUNT, provider)
    console.log("myAccBalance :", myAccBalance)

    // create another withdrawal request
    console.log("creating another withdrawal request...")
    const createWithdrawRequestTx2 = await wallet.populateTransaction.createWithdrawRequest(
        ethers.utils.parseUnits((0.001).toString(), "ether"),
        MY_ACCOUNT
    )
    await executeAAWalletTransaction(
        WALLET_ADDRESS,
        WALLET_SIGNING_KEY,
        createWithdrawRequestTx2,
        provider
    )

    // cancel request
    console.log("cancel withdraw request...")
    const cancelWithdrawRequestTx = await wallet.populateTransaction.cancelWithdrawRequest(1)
    await executeAAWalletTransaction(
        WALLET_ADDRESS,
        WALLET_SIGNING_KEY,
        cancelWithdrawRequestTx,
        provider
    )
    console.log("Success");
}
