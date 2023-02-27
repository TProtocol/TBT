const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

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
}

module.exports.tags = ["all", "TBT"]
