const hre = require("hardhat");

async function main() {

    const ExtensionFactory = await hre.ethers.getContractFactory("ERC1400TokensValidator");
    const extension = await ExtensionFactory.deploy();
    const extensionInstance = await extension.deployed();

    console.log(
      "\n   > ERC1400TokensValidator deployment: Success -->",
      extensionInstance.address
    );
  }
  
  // We recommend this pattern to be able to use async/await everywhere
  // and properly handle errors.
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
