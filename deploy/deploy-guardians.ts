import { utils, Wallet, Provider } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"

import { writeFileSync } from "fs"
import { join } from "path"

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as string
const PRIVATE_KEY = process.env.PRIVATE_KEY as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const userAccount = new Wallet(PRIVATE_KEY).connect(provider)
    const factoryArtifact = await hre.artifacts.readArtifact("WalletFactory")

    const walletFactory = new ethers.Contract(FACTORY_ADDRESS, factoryArtifact.abi, userAccount)
    
    const salt = ethers.constants.HashZero

    const signingAccount1 = Wallet.createRandom()
    const { privateKey: signingKey1, address: signingAddress1 } = signingAccount1

    const tx1 = await walletFactory.deployWallet(salt, signingAddress1)
    await tx1.wait()

    // Getting the address of the deployed contract
    const abiCoder = new ethers.utils.AbiCoder()
    const guardianAddr1 = utils.create2Address(
        FACTORY_ADDRESS,
        await walletFactory.aaBytecodeHash(),
        salt,
        abiCoder.encode(["address"], [signingAddress1])
    )
    console.log(`Guardian 1 deployed on address ${guardianAddr1}`)

    console.log("Adding funds to Guardian 1...")

    await (
        await userAccount.sendTransaction({
            to: guardianAddr1,
            value: ethers.utils.parseEther("0.001"),
        })
    ).wait()

    console.log("Finished adding funds to Guardian 1")

    writeFileSync(
        join(__dirname, "..", ".env"),
        `GUARDIAN_ADDRESS_1="${guardianAddr1}"\nGUARDIAN_SK_1="${signingKey1}"\n`,
        { flag: "a+" }
    )

    const signingAccount2 = Wallet.createRandom()
    const { privateKey: signingKey2, address: signingAddress2 } = signingAccount2

    const tx2 = await walletFactory.deployWallet(salt, signingAddress2)
    await tx2.wait()

    const guardianAddr2 = utils.create2Address(
        FACTORY_ADDRESS,
        await walletFactory.aaBytecodeHash(),
        salt,
        abiCoder.encode(["address"], [signingAddress2])
    )
    console.log(`Guardian 2 deployed on address ${guardianAddr2}`)

    console.log("Adding fund to Guardian 2...")

    await (
        await userAccount.sendTransaction({
            to: guardianAddr2,
            value: ethers.utils.parseEther("0.001"),
        })
    ).wait()

    console.log("Finished adding funds to Guardian 2")

    writeFileSync(
        join(__dirname, "..", ".env"),
        `GUARDIAN_ADDRESS_2="${guardianAddr2}"\nGUARDIAN_SK_2="${signingKey2}"\n`,
        { flag: "a+" }
    )
}
