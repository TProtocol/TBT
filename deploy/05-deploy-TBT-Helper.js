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
			config.wTBTPoolV2PermissionProxyAddress,
			config.TBTProxyAddress,
			config.underlyingAddress,
		],
	})

	log(`🎉 TBTHelper deployed at ${TBTHelper.address}`)
	if (!developmentChains.includes(network.name)) {
		console.log("Verifying TBTHelper on Etherscan...")
		await verify(TBTHelper.address, [
			config.wTBTPoolV2PermissionProxyAddress,
			config.TBTProxyAddress,
			config.underlyingAddress,
		])
	}
}

module.exports.tags = ["TBTHelper", "all"]
