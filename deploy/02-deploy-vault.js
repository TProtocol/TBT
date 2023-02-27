const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, GoerliAddressConfig } = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const vaultArgs = [GoerliAddressConfig.adminAddress, GoerliAddressConfig.underlyingAddress]
	const vault = await deploy("Vault", {
		from: deployer,
		log: true,
		waitConfirmations: 2,
		args: vaultArgs,
	})
	log(`🎉 Vault deployed at ${vault.address}`)
	if (!developmentChains.includes(network.name)) {
		console.log("Verifying vault on Etherscan...")
		await verify(vault.address, vaultArgs)
	}
}

module.exports.tags = ["vault", "all"]
