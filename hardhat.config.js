require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-etherscan")
require("@nomicfoundation/hardhat-chai-matchers")
require("hardhat-deploy")
require("solidity-coverage")
require("hardhat-gas-reporter")
require("dotenv").config()

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const DEPLOYER_KEY = process.env.DEPLOYER_KEY
const TREASURY_KEY = process.env.TREASURY_KEY
const VAULT_KEY = process.env.VAULT_KEY
const FEE_COLLECTOR_KEY = process.env.FEE_COLLECTOR_KEY

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
		hardhat: { chainId: 31337 },
		bscTestnet: {
			url: "https://data-seed-prebsc-2-s3.binance.org:8545",
			accounts: [DEPLOYER_KEY, TREASURY_KEY, VAULT_KEY, FEE_COLLECTOR_KEY],
			chainId: 97,
		},
	},
	gasReporter: {
		enabled: process.env.REPORT_GAS !== undefined,
		coinmarketcap: "TODO",
		currency: "USD",
	},
	etherscan: {
		apiKey: {
			bscTestnet: ETHERSCAN_API_KEY,
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
