const { getNamedAccounts, deployments, network, upgrades } = require("hardhat")
const {
	developmentChains,
	AddressConfig,
	TimelockId,
} = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const TWO_DAY = 3600 * 24 * 2

	const Timelock = await deploy(TimelockId, {
		from: deployer,
		log: true,
		waitConfirmations: 2,
		args: [
			config.safeWalletAddress,
			TWO_DAY
		],
	})

	log(`🎉 Timelock deployed at ${Timelock.address}`)
	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying Timelock on Etherscan...")
		await verify(Timelock.address, [
			config.safeWalletAddress,
			TWO_DAY
		])
	}
}

module.exports.tags = ["Timelock", "all"]
