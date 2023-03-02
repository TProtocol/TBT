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

	const TBT = await ethers.getContractFactory(TBTId)

	const TBTProxy = await upgrades.deployProxy(
		TBT,
		["rebasing TBT", "TBT", config.adminAddress, config.wTBTPoolV2PermissionProxyAddress],
		{
			from: deployer,
			log: true,
			waitConfirmations: 2,
		}
	)

	await TBTProxy.deployed()

	log(`🎉 TBT deployed at ${TBTProxy.address}`)
	if (!developmentChains.includes(network.name)) {
		console.log("Verifying TBT on Etherscan...")
		await verify(TBTProxy.address)
	}
}

module.exports.tags = ["TBT", "all"]
