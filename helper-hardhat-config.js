const developmentChains = ["hardhat"]

// Goerli Testnet Settings
const GoerliAddressConfig = {
	mpMintPoolAddress: "0x981B62de4864ed5b2c762A4e20bDA01b70EeBb2E",
	mpRedeemPoolAddress: "0x199E9C9A58e0CF6D26c4e753693644Ca65A4c497",
	stbtAddress: "0x0f539454d2Effd45E9bFeD7C57B2D48bFd04CB32",
	underlyingAddress: "0x43c7181e745Be7265EB103c5D69F1b7b4EF8763f",
	daiAddress: "0x73967c6a0904aA032C103b4104747E88c566B1A2",
	usdcAddress: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F",
	usdtAddress: "0x509Ee0d083DdF8AC028f2a56731412edD63223B9",
	adminAddress: "0x7a193303206f0Ea05C9C16a5652C727b8465Db52",
}

// Mainnet Settings
const MainnetAddressConfig = {
	mpMintPoolAddress: "",
	mpRedeemPoolAddress: "",
	stbtAddress: "",
	underlyingAddress: "",
	daiAddress: "",
	usdcAddress: "",
	usdtAddress: "",
	adminAddress: "",
}

module.exports = {
	developmentChains,
	GoerliAddressConfig,
}
