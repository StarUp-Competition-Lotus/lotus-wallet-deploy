import { Wallet, Provider } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const PRIVATE_KEY = process.env.PRIVATE_KEY as string
const WALLET_ADDRESS = process.env.WALLET_ADDRESS as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const account = new Wallet(PRIVATE_KEY).connect(provider)
    const walletArtifact = await hre.artifacts.readArtifact("AAWallet")

    const wallet = new ethers.Contract(WALLET_ADDRESS, walletArtifact.abi, account)

    await (
        await account.sendTransaction({
            to: wallet.address,
            // You can increase the amount of ETH sent to the multisig
            value: ethers.utils.parseEther("0.001"),
        })
    ).wait()

    const balance = await provider.getBalance(wallet.address)
    console.log("balance :", ethers.utils.formatEther(balance.toString()), "ETH")
}
