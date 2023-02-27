const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

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
}

module.exports.tags = ["all", "WTBT"]
