const { BigNumber, ContractFactory } = require("ethers")

const { ethers, upgrades } = require("hardhat")
const { expect } = require("chai")

const ONE_HOUR = 3600
const ONE_DAY = ONE_HOUR * 24
const ONE_WEEK = ONE_DAY * 7
const ONE_MONTH = ONE_DAY * 30
const ONE_YEAR = ONE_DAY * 365

const mineBlockWithTimestamp = async (provider, timestamp) => {
	await provider.send("evm_mine", [timestamp])
	return Promise.resolve()
}

describe("TBTHelper.test Contract", async () => {
	let wtbtPool
	let usdtToken, daiToken, usdcToken, stbtToken

	let investor, investor2, investor3
	let deployer
	let mpMintPool, mpRedeemPool
	let treasury, vault, fee_collector, manager_fee_collector, priceFeed

	let now

	let rtbt, tbtHelper

	beforeEach(async () => {
		;[
			controller,
			investor,
			investor2,
			investor3,
			deployer,
			admin,
			poolManager,
			fee_collector,
			manager_fee_collector,
			mpMintPool,
			mpRedeemPool,
			interestCostFeeCollector,
		] = await ethers.getSigners()
		now = (await ethers.provider.getBlock("latest")).timestamp
		const ERC20Token = await ethers.getContractFactory("ERC20Token")
		usdtToken = await ERC20Token.connect(deployer).deploy("USDT", "USDT", 6)
		usdcToken = await ERC20Token.connect(deployer).deploy("USDC", "USDC", 6)
		daiToken = await ERC20Token.connect(deployer).deploy("DAI", "DAI", 18)
		stbtToken = await ERC20Token.connect(deployer).deploy("STBT", "STBT", 18)
		await usdcToken
			.connect(deployer)
			.mint(investor.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC
		await usdcToken
			.connect(deployer)
			.mint(investor2.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC

		const PriceFeed = await ethers.getContractFactory("MockPriceFeed")

		priceFeed = await PriceFeed.deploy()

		const TreasuryFactory = await ethers.getContractFactory("Treasury")

		treasury = await TreasuryFactory.connect(deployer).deploy(
			admin.address,
			mpMintPool.address,
			mpRedeemPool.address,
			stbtToken.address,
			usdcToken.address,
			admin.address,
			priceFeed.address,
			[daiToken.address, usdcToken.address, usdtToken.address]
		)
		await treasury.deployed()

		const VaultFactory = await ethers.getContractFactory("Vault")

		vault = await VaultFactory.connect(deployer).deploy(
			admin.address,
			usdcToken.address,
			admin.address
		)
		await vault.deployed()

		wTBTPool = await ethers.getContractFactory("wTBTPoolV2Permission")
		wtbtPool = await upgrades.deployProxy(wTBTPool, [
			"TBT Pool",
			"wTBT",
			admin.address,
			usdcToken.address,
			0,
			treasury.address,
			vault.address,
			fee_collector.address,
			manager_fee_collector.address,
		])
		await wtbtPool.deployed()

		await usdcToken
			.connect(deployer)
			.mint(treasury.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC

		TBTFactory = await ethers.getContractFactory("TBT")
		rtbt = await upgrades.deployProxy(TBTFactory, [
			"rebasing TBT",
			"TBT",
			admin.address,
			wtbtPool.address,
		])

		await rtbt.deployed()

		// SET ROLE
		let WTBTPOOL_ROLE = await treasury.WTBTPOOL_ROLE()
		await treasury.connect(admin).grantRole(WTBTPOOL_ROLE, wtbtPool.address)
		WTBTPOOL_ROLE = await vault.WTBTPOOL_ROLE()
		await vault.connect(admin).grantRole(WTBTPOOL_ROLE, wtbtPool.address)

		const TBTHelper = await ethers.getContractFactory("TBTHelper")
		tbtHelper = await TBTHelper.connect(deployer).deploy(
			rtbt.address,
			wtbtPool.address,
			usdcToken.address,
			admin.address
		)
		await tbtHelper.deployed()
	})

	describe("Mint", async () => {
		beforeEach(async () => {
			await wtbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))
			await wtbtPool
				.connect(investor2)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))
		})
		it("Should be able to mint wTBT", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(tbtHelper.address, amountToBuy)
			await tbtHelper.connect(investor).mintWTBT(amountToBuy)
			// because 0% apr. the balance of wtbt should be equal 100 * 10**18.
			expect(await wtbtPool.balanceOf(investor.address)).to.be.equal(
				ethers.utils.parseUnits("100", 18)
			)
			expect(await rtbt.balanceOf(investor.address)).to.be.equal(0)
		})
		it("Should be able to mint TBT", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(tbtHelper.address, amountToBuy)
			await tbtHelper.connect(investor).mintTBT(amountToBuy)

			expect(await wtbtPool.balanceOf(investor.address)).to.be.equal(0)
			// because 0% apr. the balance of tbt should be equal 100 * 10**18.
			expect(await rtbt.balanceOf(investor.address)).to.be.equal(
				ethers.utils.parseUnits("100", 18)
			)
		})
	})
})
