import { utils, Wallet, Provider } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as string
const PRIVATE_KEY = process.env.PRIVATE_KEY as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const wallet = new Wallet(PRIVATE_KEY).connect(provider)
    const factoryArtifact = await hre.artifacts.readArtifact("WalletFactory")

    const walletFactory = new ethers.Contract(FACTORY_ADDRESS, factoryArtifact.abi, wallet)

    const { privateKey: signingKey, address: signingAddress } = Wallet.createRandom()
    console.log('signingAddress :', signingAddress);
    console.log('signingKey :', signingKey);

    const salt = ethers.constants.HashZero

    const tx = await walletFactory.deployAccount(salt, signingKey, signingAddress)
    await tx.wait()

    // Getting the address of the deployed contract
    const abiCoder = new ethers.utils.AbiCoder()
    const walletAddress = utils.create2Address(
        FACTORY_ADDRESS,
        await walletFactory.aaBytecodeHash(),
        salt,
        abiCoder.encode(["bytes32", "address"], [signingKey, signingAddress])
    )
    console.log(`Wallet deployed on address ${walletAddress}`)
}
