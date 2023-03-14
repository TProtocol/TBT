const { getNamedAccounts, deployments, network, upgrades } = require("hardhat")
const {
	developmentChains,
	AddressConfig,
	TreasuryId,
	VaultId,
	wTBTPoolV2PermissionId,
	TBTId,
	TBTHelperId,
} = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const TBTHelper = await deploy(TBTHelperId, {
		from: deployer,
		log: true,
		waitConfirmations: 2,
		args: [
			config.TBTProxyAddress,
			config.wTBTPoolV2PermissionProxyAddress,
			config.underlyingAddress,
			config.recoveryFundAddress,
		],
	})

	log(`🎉 TBTHelper deployed at ${TBTHelper.address}`)
	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying TBTHelper on Etherscan...")
		await verify(TBTHelper.address, [
			config.TBTProxyAddress,
			config.wTBTPoolV2PermissionProxyAddress,
			config.underlyingAddress,
			config.recoveryFundAddress,
		])
	}
}

module.exports.tags = ["TBTHelper", "all"]
