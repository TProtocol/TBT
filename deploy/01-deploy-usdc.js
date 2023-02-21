const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../helper-function")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const USDC = await deploy("ERC20Token", {
		from: deployer,
		log: true,
		waitConfirmations: 2,
		args: ["USDC", "USDC", 6],
	})

	log(`🎉 USDC deployed at ${USDC.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Verifying USDC on Etherscan...")
		await verify(USDC.address, ["USDC", "USDC", 6])
	}
}

module.exports.tags = ["all", "USDC"]
