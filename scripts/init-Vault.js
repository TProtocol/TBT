const { getNamedAccounts } = require("hardhat")
const USDCAddress = "0x43c7181e745Be7265EB103c5D69F1b7b4EF8763f" // Goerli Test USDC from MXP
const wTBTAddress = "0xbad45474dB15EF71542732b276574A115BB6189b"

// ABI Approve ERC20
const ABI = [
	{
		inputs: [
			{
				internalType: "address",
				name: "spender",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
		],
		name: "approve",
		outputs: [
			{
				internalType: "bool",
				name: "",
				type: "bool",
			},
		],
		stateMutability: "nonpayable",
		type: "function",
	},
]

async function main() {
	const { vault } = await getNamedAccounts()
	const wallet = await ethers.getSigner(vault)
	const IUSDC = new ethers.Contract(USDCAddress, ABI, wallet)
	const tx = await IUSDC.approve(wTBTAddress, ethers.utils.parseUnits("100000000000000000000", 6))
	await tx.wait(2)
	console.log("Vault approved USDC to wTBT")
}

main()
