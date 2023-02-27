require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-etherscan")
require("@nomicfoundation/hardhat-chai-matchers")
require("hardhat-deploy")
require("solidity-coverage")
require("hardhat-gas-reporter")
require("@openzeppelin/hardhat-upgrades")
require("dotenv").config()

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const DEPLOYER_KEY = process.env.DEPLOYER_KEY
const TREASURY_KEY = process.env.TREASURY_KEY
const VAULT_KEY = process.env.VAULT_KEY
const FEE_COLLECTOR_KEY = process.env.FEE_COLLECTOR_KEY
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY

module.exports = {
	solidity: {
		version: "0.8.7",
		settings: {
			optimizer: {
				enabled: true,
				runs: 1000,
			},
		},
	},
	networks: {
		hardhat: { chainId: 1337 },
		goerli: {
			url: "https://eth-goerli.g.alchemy.com/v2/" + ALCHEMY_API_KEY,
			chainId: 5,
			accounts: [DEPLOYER_KEY, TREASURY_KEY, VAULT_KEY, FEE_COLLECTOR_KEY],
			confirmations: 2,
		},
	},
	gasReporter: {
		enabled: process.env.REPORT_GAS !== undefined,
		coinmarketcap: "TODO",
		currency: "USD",
	},
	etherscan: {
		apiKey: {
			goerli: ETHERSCAN_API_KEY,
		},
	},
	namedAccounts: {
		deployer: {
			default: 0,
		},
		treasury: {
			default: 1,
		},
		vault: {
			default: 2,
		},
		fee_collector: {
			default: 3,
		},
	},
}
