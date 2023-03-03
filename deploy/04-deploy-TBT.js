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
			waitConfirmations: 10,
		}
	)

	await TBTProxy.deployed()

	log(`🎉 TBT deployed at ${TBTProxy.address}`)
	if (!developmentChains.includes(network.name)) {
		// sleep for 1min to wait for etherscan to index the contract
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))

		console.log("Verifying TBT on Etherscan...")
		await verify(TBTProxy.address)
	}
}

module.exports.tags = ["TBT", "all"]
