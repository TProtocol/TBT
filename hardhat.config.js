require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-etherscan")
require("@nomicfoundation/hardhat-chai-matchers")
require("hardhat-deploy")
require("solidity-coverage")
require("hardhat-gas-reporter")
require("@openzeppelin/hardhat-upgrades")
require("@nomiclabs/hardhat-vyper")
require("dotenv").config()

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const DEPLOYER_KEY = process.env.DEPLOYER_KEY
const POOLMANAGER_KEY = process.env.POOLMANAGER_KEY
const APRMANAGER_KEY = process.env.APRMANAGER_KEY
const FEE_COLLECTOR_KEY = process.env.FEE_COLLECTOR_KEY
const MANAGERFEE_COLLECTOR_KEY = process.env.MANAGERFEE_COLLECTOR_KEY
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY

const FORK_NODE = process.env.FORK_NODE

module.exports = {
	vyper: {
		compilers: [{ version: "0.2.15" }, { version: "0.2.4" }],
	},
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
		hardhat: {
			chainId: 1337,
			forking: {
				url: FORK_NODE,
			},
		},
		goerli: {
			url: "https://eth-goerli.g.alchemy.com/v2/" + ALCHEMY_API_KEY,
			chainId: 5,
			accounts: [
				DEPLOYER_KEY,
				POOLMANAGER_KEY,
				APRMANAGER_KEY,
				FEE_COLLECTOR_KEY,
				MANAGERFEE_COLLECTOR_KEY,
			],
			confirmations: 2,
		},
		sepolia: {
			url: "https://eth-sepolia.g.alchemy.com/v2/" + ALCHEMY_API_KEY,
			chainId: 11155111,
			accounts: [
				DEPLOYER_KEY,
				POOLMANAGER_KEY,
				APRMANAGER_KEY,
				FEE_COLLECTOR_KEY,
				MANAGERFEE_COLLECTOR_KEY,
			],
			confirmations: 2,
		},
		mainnet: {
			url: "https://eth-mainnet.g.alchemy.com/v2/" + ALCHEMY_API_KEY,
			chainId: 1,
			accounts: [
				DEPLOYER_KEY,
				POOLMANAGER_KEY,
				APRMANAGER_KEY,
				FEE_COLLECTOR_KEY,
				MANAGERFEE_COLLECTOR_KEY,
			],
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
			sepolia: ETHERSCAN_API_KEY,
		},
	},
	namedAccounts: {
		deployer: {
			default: 0,
		},
		poolManager: {
			default: 1,
		},
		aprManager: {
			default: 2,
		},
		fee_collector: {
			default: 3,
		},
		managementFeeCollector: {
			default: 4,
		},
	},
}
