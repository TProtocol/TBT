const { BigNumber } = require("ethers")

const { ethers, upgrades } = require("hardhat")
const { expect } = require("chai")

const ONE_HOUR = 3600
const ONE_DAY = ONE_HOUR * 24

const mineBlockWithTimestamp = async (provider, timestamp) => {
	await provider.send("evm_mine", [timestamp])
	return Promise.resolve()
}

describe("redeem by Curve", async () => {
	let coins
	let wtbtPool, _3Crv, _3CrvPool, stbtSwapPool
	let usdtToken, daiToken, usdcToken, stbtToken

	let investor
	let deployer
	let mpMintPool, mpRedeemPool
	let treasury, vault, fee_collector, manager_fee_collector

	let admin, poolManager, aprManager

	let now

	beforeEach(async () => {
		;[
			investor,
			deployer,
			admin,
			poolManager,
			aprManager,
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

		coins = [daiToken, usdcToken, usdtToken, stbtToken]
		for (let coin of coins) {
			await coin.deployed()
			await coin
				.connect(deployer)
				.mint(investor.address, ethers.utils.parseUnits("1000000000", 18))
			await coin
				.connect(deployer)
				.mint(deployer.address, ethers.utils.parseUnits("1000000000", 18))
		}
		const _3CrvFactory = await ethers.getContractFactory("3Crv")

		_3Crv = await _3CrvFactory.connect(deployer).deploy("Curve.fi DAI/USDC/USDT", "3Crv", 18, 0)
		await _3Crv.deployed()
		const _3CrvPoolFactory = await ethers.getContractFactory("3CrvPool")
		_3CrvPool = await _3CrvPoolFactory
			.connect(deployer)
			.deploy(
				deployer.address,
				[daiToken.address, usdcToken.address, usdtToken.address],
				_3Crv.address,
				100,
				4000000,
				0
			)
		await _3CrvPool.deployed()

		await _3Crv.connect(deployer).set_minter(_3CrvPool.address)
		for (let coin of coins) {
			await coin
				.connect(deployer)
				.approve(_3CrvPool.address, ethers.utils.parseUnits("1000000000", 18))
		}

		await _3CrvPool.connect(deployer).add_liquidity(
			[
				ethers.utils.parseUnits("1000000", 18), // 1M dai
				ethers.utils.parseUnits("1000000", 6), // 1M usdc
				ethers.utils.parseUnits("1000000", 6), // 1M usdt
			],
			0
		)
		const stbtSwapPoolFactory = await ethers.getContractFactory("StableSwap")

		stbtSwapPool = await stbtSwapPoolFactory.connect(deployer).deploy()
		await stbtSwapPool.deployed()
		await stbtSwapPool.initialize(
			"STBT/3CRV",
			"STBT/3CRV",
			stbtToken.address,
			_3Crv.address,
			_3CrvPool.address,
			[daiToken.address, usdcToken.address, usdtToken.address],
			ethers.utils.parseUnits("1", 18), // 10**18
			200,
			4000000
		)

		// approve token for StableSwap
		await _3Crv
			.connect(deployer)
			.approve(stbtSwapPool.address, ethers.utils.parseUnits("1000000000", 18))
		await stbtToken
			.connect(deployer)
			.approve(stbtSwapPool.address, ethers.utils.parseUnits("1000000000", 18))

		await stbtSwapPool.connect(deployer)["add_liquidity(uint256[2],uint256)"](
			[
				ethers.utils.parseUnits("1000000", 18), // 1M stbt
				ethers.utils.parseUnits("1000000", 18), // 1M 3Crv
			],
			0
		)
		const TreasuryFactory = await ethers.getContractFactory("Treasury")
		const VaultFactory = await ethers.getContractFactory("Vault")

		treasury = await TreasuryFactory.deploy(
			admin.address,
			mpMintPool.address,
			mpRedeemPool.address,
			stbtToken.address,
			usdcToken.address
		)
		await treasury.deployed()

		vault = await VaultFactory.deploy(admin.address, usdcToken.address)
		await vault.deployed()

		wTBTPool = await ethers.getContractFactory("wTBTPoolV2Permission")
		wtbtPool = await upgrades.deployProxy(wTBTPool, [
			"wTBT Pool",
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
			.mint(vault.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC

		// SET ROLE
		let WTBTPOOL_ROLE = await treasury.WTBTPOOL_ROLE()
		await treasury.connect(admin).grantRole(WTBTPOOL_ROLE, wtbtPool.address)
		WTBTPOOL_ROLE = await vault.WTBTPOOL_ROLE()
		await vault.connect(admin).grantRole(WTBTPOOL_ROLE, wtbtPool.address)

		let MANAGER_ROLE = await treasury.MANAGER_ROLE()
		await treasury.connect(admin).grantRole(MANAGER_ROLE, poolManager.address)

		await stbtToken
			.connect(deployer)
			.mint(treasury.address, ethers.utils.parseUnits("1000000000", 18)) // 1 billion stbt for distribution

		// set curve pool
		await treasury.connect(admin).setCurvePool(stbtSwapPool.address)
	})

	describe("Redeem", async () => {
		beforeEach(async () => {
			const amountToMint = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await wtbtPool.connect(investor).mint(amountToMint)
			const POOL_MANAGER_ROLE = await wtbtPool.POOL_MANAGER_ROLE()
			await wtbtPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address)
			// 1%
			await wtbtPool.connect(poolManager).setRedeemFeeRate(1000000)
		})

		it("Should be able to flash redeem for 3Crv with fee", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)

			const amountToRedeem = await wtbtPool.connect(investor).cTokenBalances(investor.address)
			const underlyingAmount = await wtbtPool.getUnderlyingByCToken(amountToRedeem)
			const stbtAmount = await treasury.getSTBTbyUnderlyingAmount(underlyingAmount)
			const dy = await stbtSwapPool.get_dy(0, 1, stbtAmount)

			const fee = dy.mul(1000000).div(100000000)
			const amountAfterFee = dy.sub(fee)
			await wtbtPool.connect(investor).flashRedeem(amountToRedeem, 1, 0)

			const user3Crvalance = await _3Crv.balanceOf(investor.address)
			expect(user3Crvalance).to.be.equal(amountAfterFee)

			const feeCollector3CrvBalance = await _3Crv.balanceOf(fee_collector.address)
			expect(feeCollector3CrvBalance).to.be.equal(fee)
		})
	})
})
