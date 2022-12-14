import { utils, Wallet, Provider } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"

// Put the address of your AA factory
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as string
const PRIVATE_KEY = process.env.PRIVATE_KEY as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const wallet = new Wallet(PRIVATE_KEY).connect(provider)
    const factoryArtifact = await hre.artifacts.readArtifact("WalletFactory")

    const walletFactory = new ethers.Contract(FACTORY_ADDRESS, factoryArtifact.abi, wallet)

    const secretKey = Wallet.createRandom()

    // For the simplicity of the tutorial, we will use zero hash as salt
    const salt = ethers.constants.HashZero

    const tx = await walletFactory.deployAccount(salt, secretKey.address)
    await tx.wait()

    // Getting the address of the deployed contract
    const abiCoder = new ethers.utils.AbiCoder()
    const multisigAddress = utils.create2Address(
        FACTORY_ADDRESS,
        await walletFactory.aaBytecodeHash(),
        salt,
        abiCoder.encode(["address"], [secretKey.address])
    )
    console.log(`Multisig deployed on address ${multisigAddress}`)
}
