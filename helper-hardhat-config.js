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
	poolManagerAddress: "0x7a193303206f0Ea05C9C16a5652C727b8465Db52",
	feeCollectorAddress: "0x7a193303206f0Ea05C9C16a5652C727b8465Db52",
	managementFeeCollecorAddress: "0x7a193303206f0Ea05C9C16a5652C727b8465Db52",
	aprManagerAddress: "0x7a193303206f0Ea05C9C16a5652C727b8465Db52",

	wTBTPoolV2PermissionProxyAddress: "0x1CF77a8435B9cE3e2485599f862a3823f378c077",
	TBTProxyAddress: "0x9E93503fFAd054722053Aa47110ce73db771Cfd5",
}

// Mainnet Settings
const MainnetAddressConfig = {
	mpMintPoolAddress: "0x5a47DF2aaec5ad2F95A6a353c906559075f94186",
	mpRedeemPoolAddress: "0xDEE9Ed3B19d104ADBbE255B6bEFC680b4eaAAda3",
	stbtAddress: "0x530824DA86689C9C17CdC2871Ff29B058345b44a",
	underlyingAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
	daiAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
	usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
	usdtAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
	adminAddress: "0xEAb746DE6bd1b2714ed95AaB6945B82315613264",
	poolManagerAddress: "0xe65C40E6b6432Ca593E5A65263d2F67f04D5958c",
	feeCollectorAddress: "0xE4f55830f92685Ba9c321aE4aCe137d4b030626D",
	managementFeeCollecorAddress: "0x29723F1D8824f5DE6c53819A658770afC7eF4F48",
	aprManagerAddress: "0xA3404a7CB0Bbbda93581F2d2f9e5e0f3b9421bAC",

	wTBTPoolV2PermissionProxyAddress: "0x1CF77a8435B9cE3e2485599f862a3823f378c077",
	TBTProxyAddress: "0x9E93503fFAd054722053Aa47110ce73db771Cfd5",
}

// Sepolia Settings
const SepoliaAddressConfig = {
	mpMintPoolAddress: "0x5a47DF2aaec5ad2F95A6a353c906559075f94186",
	mpRedeemPoolAddress: "0xDEE9Ed3B19d104ADBbE255B6bEFC680b4eaAAda3",
	stbtAddress: "0x93E8b62F8b5b9669f8dfd235d6fd3aEb1da689a3",
	underlyingAddress: "0x9B06975EfE73334946BC96bC411fA17B68195A5C",
	daiAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
	usdcAddress: "0x9B06975EfE73334946BC96bC411fA17B68195A5C",
	usdtAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
	adminAddress: "0xEAb746DE6bd1b2714ed95AaB6945B82315613264",
	poolManagerAddress: "0xe65C40E6b6432Ca593E5A65263d2F67f04D5958c",
	feeCollectorAddress: "0xE4f55830f92685Ba9c321aE4aCe137d4b030626D",
	managementFeeCollecorAddress: "0x29723F1D8824f5DE6c53819A658770afC7eF4F48",
	aprManagerAddress: "0xA3404a7CB0Bbbda93581F2d2f9e5e0f3b9421bAC",

	wTBTPoolV2PermissionProxyAddress: "0x1CF77a8435B9cE3e2485599f862a3823f378c077",
	TBTProxyAddress: "0x9E93503fFAd054722053Aa47110ce73db771Cfd5",
}

const AddressConfig = {
	1: MainnetAddressConfig,
	5: GoerliAddressConfig,
	1337: MainnetAddressConfig,
	11155111: SepoliaAddressConfig,
}

const TreasuryId = "Treasury"
const VaultId = "Vault"
const wTBTPoolV2PermissionId = "wTBTPoolV2Permission"
const TBTId = "TBT"
const TBTHelperId = "TBTHelper"

module.exports = {
	developmentChains,
	AddressConfig,
	TreasuryId,
	VaultId,
	wTBTPoolV2PermissionId,
	TBTId,
	TBTHelperId,
}
