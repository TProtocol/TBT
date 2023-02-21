const { BigNumber } = require("ethers")

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

describe("TBT Contract", async () => {
	let tbtPool
	let usdcToken

	let investor
	let investor2
	let investor3
	let deployer
	let controller
	let treasury
	let vault
	let fee_collection

	let admin
	let poolManager

	let now

	let rtbt

	const mint = async (account, amount) => {
		await tbtPool.connect(account).mint(amount)
	}

	const redeem = async (account, amount) => {
		await tbtPool.connect(account).redeem(amount)
	}

	beforeEach(async () => {
		;[
			controller,
			treasury,
			vault,
			investor,
			investor2,
			investor3,
			deployer,
			admin,
			poolManager,
			fee_collection,
		] = await ethers.getSigners()
		now = (await ethers.provider.getBlock("latest")).timestamp
		const ERC20Token = await ethers.getContractFactory("ERC20Token")
		usdcToken = await ERC20Token.connect(deployer).deploy("USDC", "USDC", 6)
		await usdcToken
			.connect(deployer)
			.mint(investor.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC
		await usdcToken
			.connect(deployer)
			.mint(investor2.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC

		TBTPool = await ethers.getContractFactory("wTBTPoolV2Permission")
		tbtPool = await upgrades.deployProxy(TBTPool, [
			"TBT Pool 1",
			"wTBT",
			admin.address,
			usdcToken.address,
			0,
			vault.address,
			treasury.address,
			fee_collection.address,
		])
		await tbtPool.deployed()

		await usdcToken
			.connect(deployer)
			.mint(treasury.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC
		await usdcToken
			.connect(treasury)
			.approve(tbtPool.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC

		TBTFactory = await ethers.getContractFactory("TBT")
		rtbt = await upgrades.deployProxy(TBTFactory, [
			"rebasing TBT",
			"TBT",
			admin.address,
			tbtPool.address,
		])

		await rtbt.deployed()
	})

	describe("Wrap", async () => {
		beforeEach(async () => {
			await tbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))
			await tbtPool
				.connect(investor2)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))
		})
		it("Should be able to wrap TBT from TBT", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy)
			await tbtPool.connect(investor).mint(amountToBuy)

			const tbtBalance = await tbtPool.balanceOf(investor.address)

			await rtbt.connect(investor).wrap(tbtBalance)
		})

		it("Should not be able to wrap zero TBT", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy)

			await tbtPool.connect(investor).mint(amountToBuy)

			await expect(rtbt.connect(investor).wrap(0)).to.be.reverted
		})

		it("Should not be able to wrap when pause", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy)

			await tbtPool.connect(investor).mint(amountToBuy)

			await rtbt.connect(admin).pause()

			const tbtBalance = await tbtPool.balanceOf(investor.address)

			await expect(rtbt.connect(investor).wrap(tbtBalance)).to.be.reverted
		})
	})

	describe("Unwrap", async () => {
		beforeEach(async () => {
			await tbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))

			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy)
			await tbtPool.connect(investor).mint(amountToBuy)

			const tbtBalance = await tbtPool.balanceOf(investor.address)

			await rtbt.connect(investor).wrap(tbtBalance)
		})

		it("Should be able to unwrap", async () => {
			const sharesAmount = await rtbt.sharesOf(investor.address)

			const unwrapAmount = ethers.utils.parseUnits("100", 18)

			const getSharesByAmount = await rtbt.getSharesByAmount(unwrapAmount)

			await rtbt.connect(investor).unwrap(unwrapAmount)
		})

		it("Should be able to unwrapAll", async () => {
			const userSharesBefore = await rtbt.sharesOf(investor.address)
			await rtbt.connect(investor).unwrapAll()
			const userSharesAfter = await rtbt.sharesOf(investor.address)

			expect(userSharesAfter).to.be.equal(0)

			const tbtBalance = await tbtPool.balanceOf(investor.address)

			expect(userSharesBefore).to.be.equal(tbtBalance)
		})

		it("Should not be able to unwrap zero TBT", async () => {
			await expect(rtbt.connect(investor).unwrap(0)).to.be.reverted
		})

		it("Should not be able to unwrap when pause", async () => {
			const unwrapUnderlying = ethers.utils.parseUnits("100", 18)
			await rtbt.connect(admin).pause()
			await expect(rtbt.connect(investor).unwrap(unwrapUnderlying)).to.be.reverted
		})
	})

	describe("SHARES", async () => {
		beforeEach(async () => {
			await tbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))
			await tbtPool
				.connect(investor2)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))

			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy)
			await tbtPool.connect(investor).mint(amountToBuy)

			await usdcToken.connect(investor2).approve(tbtPool.address, amountToBuy)
			await tbtPool.connect(investor2).mint(amountToBuy)
		})

		it("Should have same shares and TBT amount", async () => {
			const tbtBalance = await tbtPool.balanceOf(investor.address)

			await rtbt.connect(investor).wrap(tbtBalance)

			const userShares = await rtbt.sharesOf(investor.address)

			expect(userShares).to.be.equal(tbtBalance)
		})

		it("Should to be correct shares supply", async () => {
			const tbtBalance = await tbtPool.balanceOf(investor.address)
			await rtbt.connect(investor).wrap(tbtBalance)
			const userShares = await rtbt.sharesOf(investor.address)
			let totalSharesSupply = await rtbt.getTotalShares()
			expect(totalSharesSupply).to.be.equal(userShares)

			const tbtBalance2 = await tbtPool.balanceOf(investor2.address)
			await rtbt.connect(investor2).wrap(tbtBalance2)

			const userShares2 = await rtbt.sharesOf(investor2.address)

			totalSharesSupply = await rtbt.getTotalShares()
			expect(totalSharesSupply).to.be.equal(userShares.add(userShares2))
		})
	})

	describe("Transfer", async () => {
		beforeEach(async () => {
			await tbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))

			const amountToBuy = ethers.utils.parseUnits("100000", 6) // 100 USDC
			await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy)
			await tbtPool.connect(investor).mint(amountToBuy)
			const tbtBalance = await tbtPool.balanceOf(investor.address)
			await rtbt.connect(investor).wrap(tbtBalance)
		})

		it("Should be able to transfer the balance", async () => {
			const targetAPR = ethers.utils.parseUnits("8", 6) // 8%

			await tbtPool.connect(admin).setTargetAPR(targetAPR)
			now = (await ethers.provider.getBlock("latest")).timestamp + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)
			await tbtPool.connect(admin).setTargetAPR(0)

			const TBTBalanceBefore = await rtbt.balanceOf(investor.address)
			const TBTSharesBefore = await rtbt.sharesOf(investor.address)
			await rtbt.connect(investor).transfer(investor2.address, TBTBalanceBefore)

			const TBTBalanceAfter = await rtbt.balanceOf(investor.address)
			const TBTSharesAfter = await rtbt.sharesOf(investor.address)
			expect(TBTBalanceAfter).to.be.equal(0)
			expect(TBTSharesAfter).to.be.equal(0)

			const investor2Balance = await rtbt.balanceOf(investor2.address)
			expect(investor2Balance).to.be.equal(TBTBalanceBefore)

			const investor2Shares = await rtbt.sharesOf(investor2.address)
			expect(investor2Shares).to.be.equal(TBTSharesBefore)
		})

		it("Should be able to transfer some shares", async () => {
			const targetAPR = ethers.utils.parseUnits("8", 6) // 8%

			await tbtPool.connect(admin).setTargetAPR(targetAPR)
			now = (await ethers.provider.getBlock("latest")).timestamp + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)
			await tbtPool.connect(admin).setTargetAPR(0)

			const TBTBalanceBefore = await rtbt.balanceOf(investor.address)
			const TBTSharesBefore = await rtbt.sharesOf(investor.address)

			const transferAmount = (await rtbt.balanceOf(investor.address)).div(2)
			const transferSharesAmount = await rtbt.getSharesByAmount(transferAmount)
			await rtbt.connect(investor).transfer(investor2.address, transferAmount)

			const transferAmountAfter = await rtbt.balanceOf(investor.address)
			const transferSharesAfter = await rtbt.sharesOf(investor.address)

			const receiveShares = await rtbt.sharesOf(investor2.address)
			const receiveAmountBalance = await rtbt.balanceOf(investor2.address)

			expect(receiveShares).to.be.equal(transferSharesAmount)
			expect(receiveAmountBalance).to.be.equal(transferAmount)

			expect(TBTSharesBefore).to.be.equal(receiveShares.add(transferSharesAfter))
			expect(TBTBalanceBefore).to.be.equal(receiveAmountBalance.add(transferAmountAfter))
		})
	})

	describe("Balance", async () => {
		beforeEach(async () => {
			await tbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))

			const amountToBuy = ethers.utils.parseUnits("10000", 6) // 100 USDC
			await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy)
			await tbtPool.connect(investor).mint(amountToBuy)
		})

		it("Should be rebase balance with APR", async () => {
			const tbtBalance = await tbtPool.balanceOf(investor.address)

			await rtbt.connect(investor).wrap(tbtBalance)

			const targetAPR = ethers.utils.parseUnits("8", 6) // 8%

			await tbtPool.connect(admin).setTargetAPR(targetAPR)
			now = (await ethers.provider.getBlock("latest")).timestamp + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)

			const underlyingAmount = await tbtPool.getUnderlyingByCToken(tbtBalance)
			const initalCtokenToUnderlying = await tbtPool.getInitalCtokenToUnderlying()
			const TBTBalanceBefore = await rtbt.balanceOf(investor.address)

			expect(TBTBalanceBefore).to.be.equal(underlyingAmount.mul(initalCtokenToUnderlying))

			now = (await ethers.provider.getBlock("latest")).timestamp + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)

			const TBTBalanceAfter = await rtbt.balanceOf(investor.address)
			expect(TBTBalanceAfter).to.be.gt(TBTBalanceBefore)
		})
	})

	describe("RBAC", async () => {
		it("Should not be able to change pause settings without ADMIN_ROLE", async () => {
			await expect(tbtPool.connect(poolManager).pause()).to.be.reverted
			await expect(tbtPool.connect(poolManager).unpause()).to.be.reverted
		})

		it("Should be able to change pause settings with ADMIN_ROLE", async () => {
			await tbtPool.connect(admin).pause()
			await tbtPool.connect(admin).unpause()
		})
	})

	describe("Upgradeable", async () => {
		it("Should have the same balance after upgrade", async () => {
			const amountToBuy = ethers.utils.parseUnits("1000000", 6)
			await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy)
			await mint(investor, amountToBuy)
			const tbtBalance = await tbtPool.balanceOf(investor.address)
			await tbtPool.connect(investor).approve(rtbt.address, tbtBalance)
			await rtbt.connect(investor).wrap(tbtBalance)

			const targetAPR = ethers.utils.parseUnits("8", 6) // 8%
			await tbtPool.connect(admin).setTargetAPR(targetAPR)
			now = (await ethers.provider.getBlock("latest")).timestamp + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)

			await tbtPool.connect(admin).setTargetAPR(0)
			const oldTBTBalance = await rtbt.balanceOf(investor.address)
			const oldTBTShares = await rtbt.sharesOf(investor.address)

			TBTUpgraded = await ethers.getContractFactory("TBTMock")
			let rtbtUpgraded = await upgrades.upgradeProxy(rtbt.address, TBTUpgraded)
			await rtbtUpgraded.deployed()

			// Make sure the contract is upgraded by calling a fake new function.
			expect(await rtbtUpgraded.mockNewFunction()).to.equal("Hello World!")

			expect(await rtbtUpgraded.balanceOf(investor.address)).to.equal(oldTBTBalance)
			expect(await rtbtUpgraded.sharesOf(investor.address)).to.equal(oldTBTShares)
		})
	})
})
