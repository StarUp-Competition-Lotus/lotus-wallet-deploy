import { utils, Wallet } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { Deployer } from "@matterlabs/hardhat-zksync-deploy"

import { writeFile, writeFileSync } from 'fs';
import { join } from 'path';

const PRIVATE_KEY = process.env.PRIVATE_KEY as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const userAccount = new Wallet(PRIVATE_KEY)
    const deployer = new Deployer(hre, userAccount)
    const factoryArtifact = await deployer.loadArtifact("WalletFactory")
    const aaArtifact = await deployer.loadArtifact("AAWallet")

    // Getting the bytecodeHash of the account
    const bytecodeHash = utils.hashBytecode(aaArtifact.bytecode)

    const factory = await deployer.deploy(factoryArtifact, [bytecodeHash], undefined, [
        // Since the factory requires the code of the multisig to be available,
        // we should pass it here as well.
        aaArtifact.bytecode,
    ])

    writeFileSync(join(__dirname, '..', '.env'), `FACTORY_ADDRESS="${factory.address}"\n`, { flag: 'a+' });

    console.log(`Wallet factory address: ${factory.address}`)
}
