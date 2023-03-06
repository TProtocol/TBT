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

	const treasury = await ethers.getContractAt(
		TreasuryId,
		(
			await deployments.get(TreasuryId)
		).address
	)

	const vault = await ethers.getContractAt(VaultId, (await deployments.get(VaultId)).address)
	const wTBTPool = await ethers.getContractFactory(wTBTPoolV2PermissionId)
	const wTBTPoolV2PermissionProxy = await upgrades.deployProxy(
		wTBTPool,
		[
			"wTBT Pool",
			"wTBT",
			config.adminAddress,
			config.underlyingAddress,
			0,
			treasury.address,
			vault.address,
			config.feeCollectorAddress,
			config.managementFeeCollectorAddress,
		],
		{
			from: deployer,
			log: true,
			waitConfirmations: 2,
		}
	)

	log(`🎉 wTBTPoolV2Permission deployed at ${wTBTPoolV2PermissionProxy.address}`)

	// set role
	let WTBTPOOL_ROLE = await treasury.WTBTPOOL_ROLE()
	await treasury.grantRole(WTBTPOOL_ROLE, wTBTPoolV2PermissionProxy.address)
	WTBTPOOL_ROLE = await vault.WTBTPOOL_ROLE()
	await vault.grantRole(WTBTPOOL_ROLE, wTBTPoolV2PermissionProxy.address)

	let MANAGER_ROLE = await treasury.MANAGER_ROLE()
	await treasury.grantRole(MANAGER_ROLE, config.poolManagerAddress)

	let APR_ROLE = await wTBTPoolV2PermissionProxy.APR_MANAGER_ROLE()
	await wTBTPoolV2PermissionProxy.grantRole(APR_ROLE, config.aprManagerAddress)

	// set fee
	// 0.1% mint fee
	await wTBTPoolV2PermissionProxy.setMintFeeRate(100000)
	// 0.2% redeem protocol fee
	await wTBTPoolV2PermissionProxy.setRedeemFeeRate(200000)
	// 0.1% mp redeem fee
	await wTBTPoolV2PermissionProxy.setRedeemMPFeeRate(100000)
	// 0.1% interest cost fee
	await wTBTPoolV2PermissionProxy.setMintInterestCostFeeRate(100000)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying wTBTPoolV2Permission on Etherscan...")
		await verify(wTBTPoolV2PermissionProxy.address)
	}
}

module.exports.tags = ["wTBT", "all"]
