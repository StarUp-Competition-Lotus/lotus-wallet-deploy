import { utils, Wallet, Provider } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const PRIVATE_KEY = process.env.PRIVATE_KEY as string
const WALLET_ADDRESS = process.env.WALLET_ADDRESS as string
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const account = new Wallet(PRIVATE_KEY).connect(provider)
    const walletArtifact = await hre.artifacts.readArtifact("WalletFactory")

    const wallet = new ethers.Contract(FACTORY_ADDRESS, walletArtifact.abi, account)

    console.log(wallet)
}
