import { utils, Wallet, Provider, types, EIP712Signer } from "zksync-web3"
import * as ethers from "ethers"

export const executeAAWalletTransaction = async (
    walletAddress: string,
    walletSigningKey: string,
    tx: ethers.ethers.PopulatedTransaction,
    provider: Provider
) => {
    let modifiedTx = {
        ...tx,
        from: walletAddress,
    }
    const signingAccount = new Wallet(walletSigningKey).connect(provider)

    let gasLimit = await provider.estimateGas(modifiedTx)
    let gasPrice = await provider.getGasPrice()

    modifiedTx = {
        ...modifiedTx,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
        chainId: (await provider.getNetwork()).chainId,
        nonce: await provider.getTransactionCount(walletAddress),
        type: 113,
        customData: {
            ergsPerPubdata: utils.DEFAULT_ERGS_PER_PUBDATA_LIMIT,
        } as types.Eip712Meta,
        value: ethers.BigNumber.from(0),
    }
    const signedTxHash = EIP712Signer.getSignedDigest(modifiedTx)

    const signature = ethers.utils.concat([
        // Note, that `signMessage` wouldn't work here, since we don't want
        // the signed hash to be prefixed with `\x19Ethereum Signed Message:\n`
        ethers.utils.joinSignature(signingAccount._signingKey().signDigest(signedTxHash)),
    ])

    modifiedTx.customData = {
        ...modifiedTx.customData,
        customSignature: signature,
    }

    const executeTx = await provider.sendTransaction(utils.serialize(modifiedTx))
    await executeTx.wait(6)
}

export const getBalance = async (address: string, provider: Provider): Promise<number> => {
    const balance = await provider.getBalance(address)
    const formattedBalance = parseFloat(ethers.utils.formatEther(balance.toString()))
    return formattedBalance
}
