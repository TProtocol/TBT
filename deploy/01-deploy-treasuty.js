const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, GoerliAddressConfig } = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const treasuryArgs = [
		GoerliAddressConfig.adminAddress,
		GoerliAddressConfig.mpMintPoolAddress,
		GoerliAddressConfig.mpRedeemPoolAddress,
		GoerliAddressConfig.stbtAddress,
		GoerliAddressConfig.underlyingAddress,
		[
			GoerliAddressConfig.daiAddress,
			GoerliAddressConfig.usdcAddress,
			GoerliAddressConfig.usdtAddress,
		],
	]
	const treasury = await deploy("Treasury", {
		from: deployer,
		log: true,
		waitConfirmations: 2,
		args: treasuryArgs,
	})
	log(`🎉 Treasury deployed at ${treasury.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Verifying vault on Etherscan...")
		await verify(treasury.address, treasuryArgs)
	}
}

module.exports.tags = ["treasury", "all"]
