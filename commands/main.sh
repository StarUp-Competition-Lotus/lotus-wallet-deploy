#! /bin/sh
rm .env
echo "PRIVATE_KEY=\"8ed772c06d5241f5b82ee5b950dabc21c11916d4fdcd6053d3b0ff864c00c9c0\"" >> .env

yarn hardhat compile
yarn hardhat deploy-zksync --script deploy-factory.ts 
yarn hardhat deploy-zksync --script deploy-wallet.ts