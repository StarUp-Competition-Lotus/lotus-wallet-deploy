#! /bin/sh
sh main.sh
yarn hardhat deploy-zksync --script deploy-new-signer.ts
yarn hardhat deploy-zksync --script test-recovery.ts