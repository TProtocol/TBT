require("dotenv").config();

// require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-ethers");
require("hardhat-gas-reporter");
require("solidity-coverage");
// require("@nomiclabs/hardhat-vyper");
// require("@nomiclabs/hardhat-truffle5");
require("hardhat-erc1820");
require("@nomicfoundation/hardhat-chai-matchers");
require('@openzeppelin/hardhat-upgrades');

const default_mnemonic = process.env.MNEMONIC || "test"

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners();

    for (const account of accounts) {
        console.log(account.address);
    }
});

// Get accounts by mnemonic
function getAccounts(mnemonic, count) {
    return {
        count,
        mnemonic,
        path: "m/44'/60'/0'/0",
    }
}
// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        version: "0.8.15",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000,
            },
        },
    },
    networks: {
        rinkeby: {
            url: "https://eth-rinkeby.alchemyapi.io/v2/TODO",
            accounts: getAccounts(default_mnemonic, 10),
        },
        mainnet: {
            url: "https://eth-mainnet.alchemyapi.io/v2/TODO",
            accounts: getAccounts(default_mnemonic, 10),
        },
        goerli: {
            url: "https://eth-goerli.g.alchemy.com/v2/TODO",
            accounts: getAccounts(default_mnemonic, 10),
        }
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== undefined,
        coinmarketcap: "TODO",
        currency: "USD",
    },
    etherscan: {
        apiKey: 'TODO',
    },
};