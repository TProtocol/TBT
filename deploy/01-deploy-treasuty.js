const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, AddressConfig, TreasuryId } = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const treasuryArgs = [
		config.adminAddress,
		config.mpMintPoolAddress,
		config.mpRedeemPoolAddress,
		config.stbtAddress,
		config.underlyingAddress,
		[config.daiAddress, config.usdcAddress, config.usdtAddress],
	]
	const treasury = await deploy(TreasuryId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: treasuryArgs,
	})
	log(`🎉 Treasury deployed at ${treasury.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(treasury.address, treasuryArgs)
	}
}

module.exports.tags = ["treasury", "all"]
