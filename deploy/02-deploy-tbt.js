const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer, treasury, vault, fee_collector } = await getNamedAccounts()

	const WTBT = await deploy("TBTPoolV2Permission", {
		from: deployer,
		log: true,
		waitConfirmations: 2,
	})
	log(`🎉 TBTPoolV2Permission deployed at ${WTBT.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Verifying WTBT on Etherscan...")
		await verify(WTBT.address)
	}
}

module.exports.tags = ["all", "WTBT"]
