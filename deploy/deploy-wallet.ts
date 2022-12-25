import { utils, Wallet, Provider } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"

import { writeFileSync } from 'fs';
import { join } from 'path'

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as string
const PRIVATE_KEY = process.env.PRIVATE_KEY as string

export default async function deployWallet (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const userAccount = new Wallet(PRIVATE_KEY).connect(provider)
    const factoryArtifact = await hre.artifacts.readArtifact("WalletFactory")

    const walletFactory = new ethers.Contract(FACTORY_ADDRESS, factoryArtifact.abi, userAccount)

    const signingAccount = Wallet.createRandom()
    const { privateKey: signingKey, address: signingAddress } = signingAccount
    console.log("signingAddress :", signingAddress)
    console.log("signingKey :", signingKey)

    const salt = ethers.constants.HashZero

    const tx = await walletFactory.deployWallet(salt, signingAddress)
    await tx.wait()

    // Getting the address of the deployed contract
    const abiCoder = new ethers.utils.AbiCoder()
    const walletAddress = utils.create2Address(
        FACTORY_ADDRESS,
        await walletFactory.aaBytecodeHash(),
        salt,
        abiCoder.encode(["address"], [signingAddress])
    )
    console.log(`Wallet deployed on address ${walletAddress}`)

    console.log("Adding fund to the wallet...")

    await (
        await userAccount.sendTransaction({
            to: walletAddress,
            value: ethers.utils.parseEther("0.01"),
        })
    ).wait()

    writeFileSync(join(__dirname, '..', '.env'), `WALLET_ADDRESS="${walletAddress}"\nWALLET_SIGNING_KEY="${signingKey}"\nWALLET_SIGNING_ADDRESS="${signingAddress}"\n`, { flag: 'a+' }, );

    const balance = await provider.getBalance(walletAddress)
    console.log("Wallet Balance :", ethers.utils.formatEther(balance.toString()), "ETH")
}
