import { Wallet, Provider } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { executeAAWalletTransaction } from "../utils"
const WALLET_ADDRESS = process.env.WALLET_ADDRESS as string
const WALLET_SIGNING_KEY = process.env.WALLET_SIGNING_KEY as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const signingAccount = new Wallet(WALLET_SIGNING_KEY).connect(provider)
    const walletArtifact = await hre.artifacts.readArtifact("AAWallet")

    const wallet = new ethers.Contract(WALLET_ADDRESS, walletArtifact.abi, signingAccount)

    const addGuardianTx = await wallet.populateTransaction.addGuardian(
        "0xb607A500574fE29afb0d0681f1dC3E82f79f4877"
    )

    const removeGuardianTx = await wallet.populateTransaction.removeGuardian(0)

    const showGuardians = async () => {
        const guardians = await wallet.getGuardians()
        console.log("Guardians: ", guardians)
    }

    console.log("adding guardian...")
    await executeAAWalletTransaction(addGuardianTx, provider)
    await showGuardians()

    console.log("removing guardian...")
    await executeAAWalletTransaction(removeGuardianTx, provider)
    await showGuardians()
}
