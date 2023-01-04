#! /bin/sh
rm .env
echo PRIVATE_KEY="<INSERT-YOUR-WALLET-PRIVATE-KEY>" >> .env

yarn hardhat compile
yarn hardhat deploy-zksync --script deploy-factory.ts 
yarn hardhat deploy-zksync --script deploy-wallet.ts
yarn hardhat deploy-zksync --script deploy-guardians.ts