const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

const underlyingTokenAddress = "0x43c7181e745Be7265EB103c5D69F1b7b4EF8763f"

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const wTBTPoolV2Permission = await deploy("wTBTPoolV2Permission", {
		from: deployer,
		log: true,
		waitConfirmations: 2,
	})
	log(`🎉 wTBTPoolV2Permission deployed at ${wTBTPoolV2Permission.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Verifying wTBTPoolV2Permission on Etherscan...")
		await verify(wTBTPoolV2Permission.address)
	}

	const TBT = await deploy("TBT", {
		from: deployer,
		log: true,
		waitConfirmations: 2,
	})
	log(`🎉 TBT deployed at ${TBT.address}`)
	if (!developmentChains.includes(network.name)) {
		console.log("Verifying TBT on Etherscan...")
		await verify(TBT.address)
	}

	const TBTHelper = await deploy("TBTHelper", {
		from: deployer,
		log: true,
		waitConfirmations: 2,
		args: [wTBTPoolV2Permission.address, TBT.address, underlyingTokenAddress],
	})
	log(`🎉 TBTHelper deployed at ${TBTHelper.address}`)
	if (!developmentChains.includes(network.name)) {
		console.log("Verifying TBTHelper on Etherscan...")
		await verify(TBTHelper.address, [
			wTBTPoolV2Permission.address,
			TBT.address,
			underlyingTokenAddress,
		])
	}
}

module.exports.tags = ["TBT", "all"]
