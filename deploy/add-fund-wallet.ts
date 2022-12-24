import { Wallet, Provider } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const PRIVATE_KEY = process.env.PRIVATE_KEY as string
const WALLET_ADDRESS = process.env.WALLET_ADDRESS as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const userAccount = new Wallet(PRIVATE_KEY).connect(provider)
    const walletArtifact = await hre.artifacts.readArtifact("AAWallet")

    const wallet = new ethers.Contract(WALLET_ADDRESS, walletArtifact.abi, userAccount)

    await (
        await userAccount.sendTransaction({
            to: wallet.address,
            value: ethers.utils.parseEther("0.003"),
        })
    ).wait()

    const balance = await provider.getBalance(wallet.address)
    console.log("Wallet Balance :", ethers.utils.formatEther(balance.toString()), "ETH")
}
