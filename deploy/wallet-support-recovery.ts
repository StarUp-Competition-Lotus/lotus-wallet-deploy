import { utils, Wallet, Provider, types, EIP712Signer } from "zksync-web3"
import * as ethers from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"

import { writeFileSync } from 'fs';
import { join } from 'path'

const WALLET_ADDRESS = process.env.WALLET_ADDRESS as string
const GUARDIAN_WALLET_ADDRESS = process.env.GUARDIAN_WALLET_ADDRESS as string
const GUARDIAN_SIGNING_KEY = process.env.GUARDIAN_SIGNING_KEY as string

export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork)
    const signingAccount = new Wallet(GUARDIAN_SIGNING_KEY).connect(provider)
    const walletArtifact = await hre.artifacts.readArtifact("AAWallet")

    const wallet = new ethers.Contract(GUARDIAN_WALLET_ADDRESS, walletArtifact.abi, signingAccount)

    let tx = await wallet.populateTransaction.supportRecovery(
        "<GUARDIAN_WALLET_PUBLIC_KEY>"
    )

    tx = {
        ...tx,
        from: GUARDIAN_WALLET_ADDRESS,
        to: WALLET_ADDRESS
    }

    let gasLimit = await provider.estimateGas(tx)
    let gasPrice = await provider.getGasPrice()

    tx = {
        ...tx,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
        chainId: (await provider.getNetwork()).chainId,
        nonce: await provider.getTransactionCount(wallet.address),
        type: 113,
        customData: {
            ergsPerPubdata: utils.DEFAULT_ERGS_PER_PUBDATA_LIMIT,
        } as types.Eip712Meta,
        value: ethers.BigNumber.from(0),
    }

    const signedTxHash = EIP712Signer.getSignedDigest(tx)

    const signature = ethers.utils.concat([
        // Note, that `signMessage` wouldn't work here, since we don't want
        // the signed hash to be prefixed with `\x19Ethereum Signed Message:\n`
        ethers.utils.joinSignature(signingAccount._signingKey().signDigest(signedTxHash)),
    ])

    tx.customData = {
        ...tx.customData,
        customSignature: signature,
    }

    const supportRecoveryTx = await provider.sendTransaction(utils.serialize(tx))
    await supportRecoveryTx.wait()
}
