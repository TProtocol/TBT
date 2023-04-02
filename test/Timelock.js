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

describe("Timelock Contract", async () => {
	let wtbtPool
	let usdtToken, daiToken, usdcToken, stbtToken

	let investor, investor2, investor3
	let deployer
	let mpMintPool, mpRedeemPool
	let treasury, vault, fee_collector, manager_fee_collector, priceFeed, timelock

	let recoverAddress
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
			recoverAddress
		] = await ethers.getSigners()
		now = (await ethers.provider.getBlock("latest")).timestamp

		const TimeLockFactory = await ethers.getContractFactory("Timelock")
		// 2 day

		timelock = await TimeLockFactory.connect(deployer).deploy(admin.address, ONE_DAY * 2)
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
			recoverAddress.address,
			priceFeed.address,
			[daiToken.address, usdcToken.address, usdtToken.address]
		)
		await treasury.deployed()

		const VaultFactory = await ethers.getContractFactory("Vault")

		vault = await VaultFactory.connect(deployer).deploy(
			admin.address,
			usdcToken.address,
			recoverAddress.address
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

	describe("Treasury", async () => {
		it("Should be able to recover by timelock", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToSent = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).transfer(treasury.address, amountToSent)

			let ADMIN_ROLE = await treasury.ADMIN_ROLE()
			await treasury.connect(admin).grantRole(ADMIN_ROLE, timelock.address)

			let recoverData = await treasury.interface.encodeFunctionData("recoverERC20", [usdcToken.address, amountToSent])

			let lockTime = now + 3 * ONE_DAY
			await timelock.connect(admin).queueTransaction(treasury.address, 0, "", recoverData, lockTime)
			await mineBlockWithTimestamp(ethers.provider, lockTime)
			await timelock.connect(admin).executeTransaction(treasury.address, 0, "", recoverData, lockTime)
			expect(await usdcToken.balanceOf(recoverAddress.address)).to.be.equal(amountToSent)
		})
	})

	describe("Vault", async () => {
		it("Should be able to recover by timelock", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToSent = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).transfer(vault.address, amountToSent)

			let ADMIN_ROLE = await vault.ADMIN_ROLE()
			await vault.connect(admin).grantRole(ADMIN_ROLE, timelock.address)

			let recoverData = await vault.interface.encodeFunctionData("recoverERC20", [usdcToken.address, amountToSent])

			let lockTime = now + 3 * ONE_DAY
			await timelock.connect(admin).queueTransaction(vault.address, 0, "", recoverData, lockTime)
			await mineBlockWithTimestamp(ethers.provider, lockTime)
			await timelock.connect(admin).executeTransaction(vault.address, 0, "", recoverData, lockTime)
			expect(await usdcToken.balanceOf(recoverAddress.address)).to.be.equal(amountToSent)
		})
	})
})
