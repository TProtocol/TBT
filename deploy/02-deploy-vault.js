const { getNamedAccounts, deployments, network } = require("hardhat")
const {
	developmentChains,
	AddressConfig,
	VaultId,
	TreasuryId,
} = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const vaultArgs = [
		config.adminAddress,
		config.underlyingAddress,
		config.stbtAddress,
		config.recoveryFundAddress,
	]
	const deployResult = await deploy(VaultId, {
		from: deployer,
		log: true,
		waitConfirmations: 2,
		args: vaultArgs,
	})

	const vault = await ethers.getContractAt(VaultId, deployResult.address)
	log(`🎉 Vault deployed at ${vault.address}`)

	const treasury = await ethers.getContractAt(
		TreasuryId,
		(
			await deployments.get(TreasuryId)
		).address
	)

	// set role
	let TREASURY_ROLE = await vault.TREASURY_ROLE()
	await vault.grantRole(TREASURY_ROLE, treasury.address)
	// set vault address
	await treasury.setValut(vault.address)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(vault.address, vaultArgs)
	}
}

module.exports.tags = ["vault", "all"]
