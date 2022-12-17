#! /bin/sh
rm .env
echo "PRIVATE_KEY=\"6cb6d63de37d2399f6495bbbd60ae6e2530d2de00f11802374865754b60b1609\"" >> .env

yarn hardhat compile
yarn hardhat deploy-zksync --script deploy-factory.ts 
yarn hardhat deploy-zksync --script deploy-wallet.ts 
# yarn hardhat deploy-zksync --script wallet-add-fund.ts 
yarn hardhat deploy-zksync --script wallet-add-guardians.ts 