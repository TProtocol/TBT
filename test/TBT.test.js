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

describe("TBT Contract", async () => {
	let wtbtPool
	let usdtToken, daiToken, usdcToken, stbtToken

	let investor
	let investor2
	let investor3
	let deployer
	let controller, mpMintPool, mpRedeemPool
	let treasury
	let vault
	let fee_collector
	let manager_fee_collector

	let admin
	let poolManager

	let now

	let rtbt

	const mint = async (account, amount) => {
		await wtbtPool.connect(account).mint(amount)
	}

	const redeem = async (account, amount) => {
		await wtbtPool.connect(account).redeem(amount)
	}

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

		const TreasuryFactory = await ethers.getContractFactory("Treasury")

		treasury = await TreasuryFactory.connect(deployer).deploy(
			admin.address,
			mpMintPool.address,
			mpRedeemPool.address,
			stbtToken.address,
			usdcToken.address,
			[daiToken.address, usdcToken.address, usdtToken.address]
		)
		await treasury.deployed()

		const VaultFactory = await ethers.getContractFactory("Vault")

		vault = await VaultFactory.connect(deployer).deploy(admin.address, usdcToken.address)
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
	})

	describe("Wrap", async () => {
		beforeEach(async () => {
			await wtbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))
			await wtbtPool
				.connect(investor2)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))
		})
		it("Should be able to wrap TBT from TBT", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToBuy)
			await wtbtPool.connect(investor).mint(amountToBuy)

			const wtbtBalance = await wtbtPool.balanceOf(investor.address)

			await rtbt.connect(investor).wrap(wtbtBalance)
			// because 0% apr. the balance of wtbw should be equal tbt.
			expect(await rtbt.balanceOf(investor.address)).to.be.equal(wtbtBalance)
		})

		it("Should be able to wrapFor TBT from TBT", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToBuy)
			await wtbtPool.connect(investor).mint(amountToBuy)

			const wtbtBalance = await wtbtPool.balanceOf(investor.address)

			await rtbt.connect(investor).wrapFor(wtbtBalance, investor2.address)
			// because 0% apr. the balance of wtbw should be equal tbt.
			expect(await rtbt.balanceOf(investor.address)).to.be.equal(0)
			expect(await rtbt.balanceOf(investor2.address)).to.be.equal(wtbtBalance)
		})

		it("Should not be able to wrap zero TBT", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToBuy)

			await wtbtPool.connect(investor).mint(amountToBuy)

			await expect(rtbt.connect(investor).wrap(0)).to.be.reverted
		})

		it("Should not be able to wrap when pause", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToBuy)

			await wtbtPool.connect(investor).mint(amountToBuy)

			await rtbt.connect(admin).pause()

			const wtbtBalance = await wtbtPool.balanceOf(investor.address)

			await expect(rtbt.connect(investor).wrap(wtbtBalance)).to.be.reverted
		})
	})

	describe("Unwrap", async () => {
		beforeEach(async () => {
			await wtbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))

			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToBuy)
			await wtbtPool.connect(investor).mint(amountToBuy)

			const wtbtBalance = await wtbtPool.balanceOf(investor.address)

			await rtbt.connect(investor).wrap(wtbtBalance)
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

			const wtbtBalance = await wtbtPool.balanceOf(investor.address)

			expect(userSharesBefore).to.be.equal(wtbtBalance)
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
			await wtbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))
			await wtbtPool
				.connect(investor2)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))

			const amountToBuy = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToBuy)
			await wtbtPool.connect(investor).mint(amountToBuy)

			await usdcToken.connect(investor2).approve(wtbtPool.address, amountToBuy)
			await wtbtPool.connect(investor2).mint(amountToBuy)
		})

		it("Should have same shares and TBT amount", async () => {
			const wtbtBalance = await wtbtPool.balanceOf(investor.address)

			await rtbt.connect(investor).wrap(wtbtBalance)

			const userShares = await rtbt.sharesOf(investor.address)

			expect(userShares).to.be.equal(wtbtBalance)
		})

		it("Should to be correct shares supply", async () => {
			const wtbtBalance = await wtbtPool.balanceOf(investor.address)
			await rtbt.connect(investor).wrap(wtbtBalance)
			const userShares = await rtbt.sharesOf(investor.address)
			let totalSharesSupply = await rtbt.getTotalShares()
			expect(totalSharesSupply).to.be.equal(userShares)

			const wtbtBalance2 = await wtbtPool.balanceOf(investor2.address)
			await rtbt.connect(investor2).wrap(wtbtBalance2)

			const userShares2 = await rtbt.sharesOf(investor2.address)

			totalSharesSupply = await rtbt.getTotalShares()
			expect(totalSharesSupply).to.be.equal(userShares.add(userShares2))
		})
	})

	describe("Transfer", async () => {
		beforeEach(async () => {
			await wtbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))

			const amountToBuy = ethers.utils.parseUnits("100000", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToBuy)
			await wtbtPool.connect(investor).mint(amountToBuy)
			const wtbtBalance = await wtbtPool.balanceOf(investor.address)
			await rtbt.connect(investor).wrap(wtbtBalance)
		})

		it("Should be able to transfer the balance", async () => {
			const targetAPR = ethers.utils.parseUnits("6", 6) // 6%

			await wtbtPool.connect(admin).setTargetAPR(targetAPR)
			now = (await ethers.provider.getBlock("latest")).timestamp + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)
			await wtbtPool.connect(admin).setTargetAPR(0)

			const rTBTBalanceBefore = await rtbt.balanceOf(investor.address)
			const rTBTSharesBefore = await rtbt.sharesOf(investor.address)
			await rtbt.connect(investor).transfer(investor2.address, rTBTBalanceBefore)

			const rTBTBalanceAfter = await rtbt.balanceOf(investor.address)
			const rTBTSharesAfter = await rtbt.sharesOf(investor.address)
			expect(rTBTBalanceAfter).to.be.equal(0)
			expect(rTBTSharesAfter).to.be.equal(0)

			const investor2Balance = await rtbt.balanceOf(investor2.address)
			expect(investor2Balance).to.be.equal(rTBTBalanceBefore)

			const investor2Shares = await rtbt.sharesOf(investor2.address)
			expect(investor2Shares).to.be.equal(rTBTSharesBefore)
		})

		it("Should be able to transfer some shares", async () => {
			const targetAPR = ethers.utils.parseUnits("6", 6) // 6%

			await wtbtPool.connect(admin).setTargetAPR(targetAPR)
			now = (await ethers.provider.getBlock("latest")).timestamp + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)
			await wtbtPool.connect(admin).setTargetAPR(0)

			const rTBTBalanceBefore = await rtbt.balanceOf(investor.address)
			const rTBTSharesBefore = await rtbt.sharesOf(investor.address)

			const transferAmount = (await rtbt.balanceOf(investor.address)).div(2)
			const transferSharesAmount = await rtbt.getSharesByAmount(transferAmount)
			await rtbt.connect(investor).transfer(investor2.address, transferAmount)

			const transferAmountAfter = await rtbt.balanceOf(investor.address)
			const transferSharesAfter = await rtbt.sharesOf(investor.address)

			const receiveShares = await rtbt.sharesOf(investor2.address)
			const receiveAmountBalance = await rtbt.balanceOf(investor2.address)

			expect(receiveShares).to.be.equal(transferSharesAmount)
			expect(receiveAmountBalance).to.be.equal(transferAmount)

			expect(rTBTSharesBefore).to.be.equal(receiveShares.add(transferSharesAfter))
			expect(rTBTBalanceBefore).to.be.equal(receiveAmountBalance.add(transferAmountAfter))
		})
	})

	describe("Balance", async () => {
		beforeEach(async () => {
			await wtbtPool
				.connect(investor)
				.approve(rtbt.address, ethers.utils.parseUnits("100000000", 18))

			const amountToBuy = ethers.utils.parseUnits("10000", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToBuy)
			await wtbtPool.connect(investor).mint(amountToBuy)
		})

		it("Should be rebase balance with APR", async () => {
			const wtbtBalance = await wtbtPool.balanceOf(investor.address)

			await rtbt.connect(investor).wrap(wtbtBalance)
			const rTBTBalanceBefore = await rtbt.balanceOf(investor.address)

			const targetAPR = ethers.utils.parseUnits("6", 6) // 6%

			await wtbtPool.connect(admin).setTargetAPR(targetAPR)
			now = (await ethers.provider.getBlock("latest")).timestamp + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)

			const underlyingAmount = await wtbtPool.getUnderlyingByCToken(wtbtBalance)
			const initalCtokenToUnderlying = await wtbtPool.getInitalCtokenToUnderlying()

			const rTBTBalanceAfter = await rtbt.balanceOf(investor.address)

			expect(rTBTBalanceAfter).to.be.equal(underlyingAmount.mul(initalCtokenToUnderlying))

			// ~= 6%. difference 0.1%
			expect(rTBTBalanceAfter).to.be.gt(rTBTBalanceBefore.mul(105900).div(100000))
			expect(rTBTBalanceAfter).to.be.lt(rTBTBalanceBefore.mul(106100).div(100000))
		})

		it("Should be rebase balance with APR and manager fee", async () => {
			const wtbtBalance = await wtbtPool.balanceOf(investor.address)

			await rtbt.connect(investor).wrap(wtbtBalance)
			const rTBTBalanceBefore = await rtbt.balanceOf(investor.address)

			const managerFeeRate = ethers.utils.parseUnits("10", 6) // 10% manager fee
			const targetAPR = ethers.utils.parseUnits("6", 6) // 6%

			await wtbtPool.connect(admin).setManagerFeeRate(managerFeeRate)
			await wtbtPool.connect(admin).setTargetAPR(targetAPR)
			now = (await ethers.provider.getBlock("latest")).timestamp + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)

			const underlyingAmount = await wtbtPool.getUnderlyingByCToken(wtbtBalance)
			const initalCtokenToUnderlying = await wtbtPool.getInitalCtokenToUnderlying()

			const rTBTBalanceAfter = await rtbt.balanceOf(investor.address)

			expect(rTBTBalanceAfter).to.be.equal(underlyingAmount.mul(initalCtokenToUnderlying))

			// ~= 5.4%. difference 0.1%
			expect(rTBTBalanceAfter).to.be.gt(rTBTBalanceBefore.mul(105300).div(100000))
			expect(rTBTBalanceAfter).to.be.lt(rTBTBalanceBefore.mul(105600).div(100000))
		})
	})

	describe("RBAC", async () => {
		it("Should not be able to change pause settings without ADMIN_ROLE", async () => {
			await expect(wtbtPool.connect(poolManager).pause()).to.be.reverted
			await expect(wtbtPool.connect(poolManager).unpause()).to.be.reverted
		})

		it("Should be able to change pause settings with ADMIN_ROLE", async () => {
			await wtbtPool.connect(admin).pause()
			await wtbtPool.connect(admin).unpause()
		})
	})

	describe("Upgradeable", async () => {
		it("Should have the same balance after upgrade", async () => {
			const amountToBuy = ethers.utils.parseUnits("1000000", 6)
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToBuy)
			await mint(investor, amountToBuy)
			const wtbtBalance = await wtbtPool.balanceOf(investor.address)
			await wtbtPool.connect(investor).approve(rtbt.address, wtbtBalance)
			await rtbt.connect(investor).wrap(wtbtBalance)

			const targetAPR = ethers.utils.parseUnits("6", 6) // 6%
			await wtbtPool.connect(admin).setTargetAPR(targetAPR)
			now = (await ethers.provider.getBlock("latest")).timestamp + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)

			await wtbtPool.connect(admin).setTargetAPR(0)
			const oldrTBTBalance = await rtbt.balanceOf(investor.address)
			const oldrTBTShares = await rtbt.sharesOf(investor.address)

			TBTUpgraded = await ethers.getContractFactory("TBTMock")
			let rtbtUpgraded = await upgrades.upgradeProxy(rtbt.address, TBTUpgraded)
			await rtbtUpgraded.deployed()

			// Make sure the contract is upgraded by calling a fake new function.
			expect(await rtbtUpgraded.mockNewFunction()).to.equal("Hello World!")

			expect(await rtbtUpgraded.balanceOf(investor.address)).to.equal(oldrTBTBalance)
			expect(await rtbtUpgraded.sharesOf(investor.address)).to.equal(oldrTBTShares)
		})
	})
})
