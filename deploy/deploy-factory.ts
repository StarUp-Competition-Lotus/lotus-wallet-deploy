import { utils, Wallet } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { Deployer } from "@matterlabs/hardhat-zksync-deploy"

const PRIVATE_KEY = process.env.PRIVATE_KEY as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const userAccount = new Wallet(PRIVATE_KEY)
    const deployer = new Deployer(hre, userAccount)
    const factoryArtifact = await deployer.loadArtifact("WalletFactory")
    const aaArtifact = await deployer.loadArtifact("AAWallet")

    // Deposit some funds to L2 in order to be able to perform L2 transactions.
    // You can remove the depositing step if the `wallet` has enough funds on zkSync
    // const depositAmount = ethers.utils.parseEther("0.001")
    // const depositHandle = await deployer.zkWallet.deposit({
    //     to: deployer.zkWallet.address,
    //     token: utils.ETH_ADDRESS,
    //     amount: depositAmount,
    // })
    // await depositHandle.wait()

    // Getting the bytecodeHash of the account
    const bytecodeHash = utils.hashBytecode(aaArtifact.bytecode)

    const factory = await deployer.deploy(factoryArtifact, [bytecodeHash], undefined, [
        // Since the factory requires the code of the multisig to be available,
        // we should pass it here as well.
        aaArtifact.bytecode,
    ])

    console.log(`Wallet factory address: ${factory.address}`)
}
