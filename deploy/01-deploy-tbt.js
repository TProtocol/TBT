const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const TBT = await deploy("TBTPoolV2Permission", {
		from: deployer,
		log: true,
		waitConfirmations: 2,
	})
	log(`🎉 TBTPoolV2Permission deployed at ${TBT.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Verifying TBT on Etherscan...")
		await verify(TBT.address)
	}
}

module.exports.tags = ["all", "TBT"]
