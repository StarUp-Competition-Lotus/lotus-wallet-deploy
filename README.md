# Lotus Wallet Smart Contract

## About

This is the smart contract part of the Lotus wallet with multiple tests to 
showcase the features of the wallet.

## 1. Clone the repo

Run the following commands:
```
git clone https://github.com/StarUp-Competition-Lotus/lotus-wallet-deploy.git
cd lotus-wallet-deploy
yarn
```

## 2. Insert your wallet's private key to commands/main.sh

After installing the dependencies, replace `<INSERT-YOUR-WALLET-PRIVATE-KEY>` with your wallet's private key in `commands/main.sh` to create the Lotus Wallet.  

## 3. Run one of the following scripts
Deploy a wallet and send 0.01 ETH to it 

```
sh commands/main.sh
```

Deploy a wallet and send 0.01 ETH to it + test recovery features

```
sh commands/test-recovery.sh
```
Deploy a wallet and send 0.01 ETH to it + test vault features

```
sh commands/test-vault.sh
```

