const { getNamedAccounts } = require("hardhat")

async function main() {
	const { deployer, treasury, vault, fee_collector } = await getNamedAccounts()
	const TBTPoolV2Permission = await ethers.getContract("TBTPoolV2Permission", deployer)
	console.log("Initializing TBTPoolV2Permission...")
	// Arguments:
	const name = "Test TBill Token"
	const symbol = "TTBT"
	const admin = deployer
	const _underlyingToken = "0xbcBBB78D1B17A90499F2D4F2CF41f7f71Eb145Ac" // USDC
	const _capitalLowerBound = "0"
	const _treasury = treasury // Multisig Wallet Address
	const _vault = vault // Multisig Vault Address
	const _fee_colletion = fee_collector // Multisig Fee Collection Address

	const tx = await TBTPoolV2Permission.initialize(
		name,
		symbol,
		admin,
		_underlyingToken,
		_capitalLowerBound,
		_treasury,
		_vault,
		_fee_colletion
	)
	await tx.wait(1)
	console.log("TBTPoolV2Permission initialized!")
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
