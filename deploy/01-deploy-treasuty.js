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
		config.recoveryFundAddress,
		config.PriceFeedAddress,
		[config.daiAddress, config.usdcAddress, config.usdtAddress],
	]
	const deployResult = await deploy(TreasuryId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: treasuryArgs,
	})

	const treasury = await ethers.getContractAt(TreasuryId, deployResult.address)

	log(`🎉 Treasury deployed at ${treasury.address}`)

	// set mint threshold, basis underlying token
	await treasury.setMintThreshold(ethers.utils.parseUnits("100000", 6))

	// set redeem threshold, basis stbt token
	await treasury.setRedeemThreshold(ethers.utils.parseUnits("100000", 18))

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(treasury.address, treasuryArgs)
	}
}

module.exports.tags = ["treasury", "all"]
