const { getNamedAccounts } = require("hardhat")

// Get the contract address
const wTBTAddress = "0xbad45474dB15EF71542732b276574A115BB6189b"
const TBTAddress = "0xAD243011772F48a456F0216961B2934763E35410"
const USDCAddress = "0x43c7181e745Be7265EB103c5D69F1b7b4EF8763f" // Goerli Test USDC from MXP

async function InitWTBT() {
	const { deployer, treasury, vault, fee_collector } = await getNamedAccounts()
	const wTBTPoolV2Permission = await ethers.getContractFactory("wTBTPoolV2Permission")
	const IwTBT = await wTBTPoolV2Permission.attach(wTBTAddress)

	// Initialize the contract
	const name = "Wrap T-Bill Token"
	const symbol = "wTBT"
	const admin = deployer
	const underlyingToken = USDCAddress
	const capitalLowerBound = "0"
	const treasuryAddress = treasury.toString()
	const vaultAddress = vault.toString()
	const feeCollectorAddress = fee_collector.toString()
	// set the parameters
	const targetAPR = "4000000" // 4%
	const mintFeeRate = "100000" // 0.1% => 100000
	const withdrawFeeRate = "300000" // 0.3% => 300000
	const processPeriod = "1" // 1 days for testing

	// Initialize the contract
	tx = await IwTBT.initialize(
		name,
		symbol,
		admin,
		underlyingToken,
		capitalLowerBound,
		treasuryAddress,
		vaultAddress,
		feeCollectorAddress
	)
	await tx.wait(2)
	console.log("wTBT initialized")
	// Set the parameters
	tx = await IwTBT.setTargetAPR(targetAPR, {})
	await tx.wait(2)
	console.log("wTBT APR set")
	tx = await IwTBT.setMintFeeRate(mintFeeRate, {})
	await tx.wait(2)
	console.log("wTBT Mint Fee Rate set")
	tx = await IwTBT.setWithdrawFeeRate(withdrawFeeRate, {})
	await tx.wait(2)
	console.log("wTBT Withdraw Fee Rate set")
	tx = await IwTBT.setProcessPeriod(processPeriod, {})
	await tx.wait(2)
	console.log("wTBT Process Period set")
}

// Main function
async function InitTBT() {
	const { deployer } = await getNamedAccounts()
	// Get the contract factory
	const TBT = await ethers.getContractFactory("TBT")
	const ITBT = await TBT.attach(TBTAddress)

	const name = "T-Bill Token"
	const symbol = "TBT"
	const admin = deployer.toString()
	const wtbt = wTBTAddress

	// Initialize the contract
	tx = await ITBT.initialize(name, symbol, admin, wtbt, {})
	await tx.wait(2)
	console.log("TBT initialized")
}

async function main() {
	console.log("Initializing wTBT and TBT")
	await InitWTBT()
	await InitTBT()
	console.log("wTBT and TBT initialized!")
}

main()
