const { BigNumber } = require("ethers")

const { ethers, upgrades } = require("hardhat")
const { expect } = require("chai")

const { soliditySha3 } = require("web3-utils")

const Account = require("eth-lib/lib/account")

const ONE_HOUR = 3600
const ONE_DAY = ONE_HOUR * 24
const ONE_WEEK = ONE_DAY * 7
const ONE_MONTH = ONE_DAY * 30
const ONE_YEAR = ONE_DAY * 365

const EMPTY_CERTIFICATE = "0x"
const CERTIFICATE_VALIDITY_PERIOD = 1

const VerificationMode = {
	CERTIFICATE: 0,
	ALLOW_LIST: 1,
	ALLOW_ALL: 2,
	DISABLED: 3,
}

const mineBlockWithTimestamp = async (provider, timestamp) => {
	await provider.send("evm_mine", [timestamp])
	return Promise.resolve()
}

const numberToHexa = (num, pushTo) => {
	const arr1 = []
	const str = num.toString(16)
	if (str.length % 2 === 1) {
		arr1.push("0")
		pushTo -= 1
	}
	for (let m = str.length / 2; m < pushTo; m++) {
		arr1.push("0")
		arr1.push("0")
	}
	for (let n = 0, l = str.length; n < l; n++) {
		const hex = str.charAt(n)
		arr1.push(hex)
	}
	return arr1.join("")
}

const craftNonceBasedCertificate = async (_txPayload, _token, _extension, _clock, _txSender) => {
	const _domain = await _token.generateDomainSeparator()
	// Retrieve current nonce from smart contract
	const nonce = await _extension.usedCertificateNonce(_token.address, _txSender)

	const time = await _clock.getTime()
	//   const time = "" + Math.floor(Date.now() / 1000); // todo: change

	const expirationTime = new Date(
		1000 * (parseInt(time) + CERTIFICATE_VALIDITY_PERIOD * ONE_HOUR)
	)
	const expirationTimeAsNumber = Math.floor(expirationTime.getTime() / 1000)

	let rawTxPayload
	if (_txPayload.length >= 64) {
		rawTxPayload = _txPayload.substring(0, _txPayload.length - 64)
	} else {
		throw new Error(
			`txPayload shall be at least 32 bytes long (${_txPayload.length / 2} instead)`
		)
	}

	const packedAndHashedParameters = soliditySha3(
		{ type: "address", value: _txSender.toString() },
		{ type: "address", value: _token.address.toString() },
		{ type: "bytes", value: rawTxPayload },
		{ type: "uint256", value: expirationTimeAsNumber.toString() },
		{ type: "uint256", value: nonce.toString() }
	)

	const packedAndHashedData = soliditySha3(
		{ type: "bytes32", value: _domain },
		{ type: "bytes32", value: packedAndHashedParameters || "" }
	)

	const signature = Account.sign(packedAndHashedData, CERTIFICATE_SIGNER_PRIVATE_KEY)
	const vrs = Account.decodeSignature(signature)
	const v = vrs[0].substring(2).replace("1b", "00").replace("1c", "01")
	const r = vrs[1].substring(2)
	const s = vrs[2].substring(2)

	const certificate = `0x${numberToHexa(expirationTimeAsNumber, 32)}${r}${s}${v}`

	return certificate
}

describe("wTBTPool V2 Permission Contract", async () => {
	let wtbtPool
	let usdcToken
	let clockMock

	let investor, investor2, investor3
	let deployer
	let controller
	let treasury, vault, fee_collector, manager_fee_collector

	let admin, poolManager, aprManager

	let now

	const mint = async (account, amount) => {
		await wtbtPool.connect(account).mint(amount)
	}

	const redeem = async (account, amount) => {
		await wtbtPool.connect(account).redeem(amount)
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
			aprManager,
			fee_collector,
			manager_fee_collector,
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
		// wtbtPool = await wTBTPool.connect(deployer).deploy(
		//   "wTBT Pool 1",
		//   "CP1",
		//   extension.address,
		//   admin.address,
		//   CERTIFICATE_SIGNER,
		//   [controller.address],
		//   usdcToken.address,
		//   0,
		//   vault.address,
		//   treasury.address,
		// );
		await usdcToken
			.connect(deployer)
			.mint(vault.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC
		await usdcToken
			.connect(vault)
			.approve(wtbtPool.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC

		const ClockMock = await ethers.getContractFactory("ClockMock")
		clockMock = await ClockMock.deploy()
	})

	describe("Mint", async () => {
		it("Should be able to mint", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToMint = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await wtbtPool.connect(investor).mint(amountToMint)
		})

		it("Should not be able to mint when pause", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToMint = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await wtbtPool.connect(admin).pause()
			await expect(wtbtPool.connect(investor).mint(amountToMint)).to.be.reverted
		})
	})

	describe("Redeem", async () => {
		beforeEach(async () => {
			const amountToMint = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await wtbtPool.connect(investor).mint(amountToMint)
		})

		it("Should be able to redeem", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToRedeem = await wtbtPool.connect(investor).cTokenBalances(investor.address)
			await wtbtPool.connect(investor).redeem(amountToRedeem)
		})

		it("Should not be able to redeem when pause", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToRedeem = await wtbtPool.connect(investor).cTokenBalances(investor.address)
			await wtbtPool.connect(admin).pause()
			await expect(wtbtPool.connect(investor).redeem(amountToRedeem)).to.be.reverted
		})

		it("Should not be able to redeem more than balance", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToRedeem = (
				await wtbtPool.connect(investor).cTokenBalances(investor.address)
			).add(1)
			await expect(wtbtPool.connect(investor).redeem(amountToRedeem)).to.be.revertedWith(
				"100"
			)
		})

		it("Should not be able to redeem all if left capital will be below lower bound", async () => {
			await wtbtPool.connect(admin).setCapitalLowerBound(1)
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToRedeem = await wtbtPool.connect(investor).cTokenBalances(investor.address)
			await expect(wtbtPool.connect(investor).redeem(amountToRedeem)).to.be.revertedWith(
				"102"
			)
		})

		it("Should be able to redeem all if left capital will be equal or more than lower bound", async () => {
			await wtbtPool.connect(admin).setCapitalLowerBound(0)
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToRedeem = await wtbtPool.connect(investor).cTokenBalances(investor.address)
			await wtbtPool.connect(investor).redeem(amountToRedeem)
		})

		it("Should not be able to redeem a half if left capital will be below lower bound", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			// Reward rate is zero, only one user, redeeming a half means taking half of the underlying.
			const amountToRedeem = (
				await wtbtPool.connect(investor).cTokenBalances(investor.address)
			).div(2)
			const totalUnderlying = await wtbtPool.totalUnderlying()
			await wtbtPool.connect(admin).setCapitalLowerBound(totalUnderlying.div(2).add(1))
			await expect(wtbtPool.connect(investor).redeem(amountToRedeem)).to.be.revertedWith(
				"102"
			)
		})

		it("Should be able to redeem a half if left capital will be equal or more than lower bound", async () => {
			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			// Reward rate is zero, only one user, redeeming a half means taking half of the underlying.
			const amountToRedeem = (
				await wtbtPool.connect(investor).cTokenBalances(investor.address)
			).div(2)
			const totalUnderlying = await wtbtPool.totalUnderlying()
			await wtbtPool.connect(admin).setCapitalLowerBound(totalUnderlying.div(2))
			await wtbtPool.connect(investor).redeem(amountToRedeem)
		})
	})

	describe("Reward", async () => {
		it("Should get all reward when only one user exists", async () => {
			const stakedTime = ONE_YEAR
			const targetAPR = ethers.utils.parseUnits("8", 6) // 8%;
			const amountToMint = ethers.utils.parseUnits("1000000", 6)
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await mint(investor, amountToMint)

			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			await wtbtPool.connect(admin).setTargetAPR(targetAPR)

			now = now + stakedTime
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToRedeem = await wtbtPool.connect(investor).cTokenBalances(investor.address)
			await redeem(investor, amountToRedeem)
			const pendingRedeem = await wtbtPool
				.connect(investor)
				.getPendingRedeem(investor.address)

			const expected = amountToMint.mul(108).div(100)
			// with 0.01% tolorence;
			expect(pendingRedeem).to.be.within(
				expected.mul(9999).div(10000),
				expected.mul(10001).div(10000)
			)
		})

		it("Should get half the reward when two users staked the same amount", async () => {
			const stakedTime = ONE_YEAR
			const targetAPR = ethers.utils.parseUnits("8", 6) // 8%;
			const amountToMint = ethers.utils.parseUnits("1000000", 6)
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await mint(investor, amountToMint)
			await usdcToken.connect(investor2).approve(wtbtPool.address, amountToMint)
			await mint(investor2, amountToMint)

			now = now + ONE_DAY
			await mineBlockWithTimestamp(ethers.provider, now)
			await wtbtPool.connect(admin).setTargetAPR(targetAPR)

			now = now + stakedTime
			await mineBlockWithTimestamp(ethers.provider, now)
			const amountToRedeem = await wtbtPool.connect(investor).cTokenBalances(investor.address)
			await redeem(investor, amountToRedeem)
			const amountToRedeem2 = await wtbtPool
				.connect(investor2)
				.cTokenBalances(investor2.address)
			await redeem(investor2, amountToRedeem2)

			const pendingRedeem = await wtbtPool.getPendingRedeem(investor.address)
			const pendingRedeem2 = await wtbtPool.getPendingRedeem(investor2.address)
			expect(pendingRedeem).to.be.within(
				pendingRedeem2.mul(9999).div(10000),
				pendingRedeem2.mul(10001).div(10000)
			)

			const expectedRedeem = amountToMint.mul(108).div(100)
			expect(pendingRedeem).to.be.within(
				expectedRedeem.mul(9999).div(10000),
				expectedRedeem.mul(10001).div(10000)
			)
		})

		it("Should be equal for getCTokenByUnderlying and mint cToken", async () => {
			const timepass = ONE_DAY
			const targetAPR = ethers.utils.parseUnits("8", 6) // 8%;
			const amountToMint = ethers.utils.parseUnits("100000", 6)
			await wtbtPool.connect(admin).setTargetAPR(targetAPR)
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint * 2)
			await mint(investor, amountToMint)
			now = now + timepass
			await mineBlockWithTimestamp(ethers.provider, now)
			await wtbtPool.connect(admin).setTargetAPR(0)
			const beforeCTokenBalance = await wtbtPool.connect(investor).balanceOf(investor.address)
			const getCTokenAmount = await wtbtPool
				.connect(investor)
				.getCTokenByUnderlying(amountToMint)
			await mint(investor, amountToMint)
			const mintCTokenAmount = (
				await wtbtPool.connect(investor).balanceOf(investor.address)
			).sub(beforeCTokenBalance)
			await expect(getCTokenAmount.toString()).to.be.eq(mintCTokenAmount.toString())
		})

		it("Should be equal for getUnderlyingByCToken and redeem cToken", async () => {
			const timepass = ONE_DAY
			const targetAPR = ethers.utils.parseUnits("8", 6) // 8%;
			const amountToMint = ethers.utils.parseUnits("100000", 6)
			await wtbtPool.connect(admin).setTargetAPR(targetAPR)
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await mint(investor, amountToMint)
			now = now + timepass
			await mineBlockWithTimestamp(ethers.provider, now)
			await wtbtPool.connect(admin).setTargetAPR(0)

			const amountToRedeem = (
				await wtbtPool.connect(investor).cTokenBalances(investor.address)
			).div(2)
			const getUnderlyingByCToken = await wtbtPool
				.connect(investor)
				.getUnderlyingByCToken(amountToRedeem)
			await redeem(investor, amountToRedeem)

			const orderId = await wtbtPool.redeemIndex()

			const pendingRedeem = (await wtbtPool.connect(investor).redeemDetails(orderId))
				.underlyingAmount
			await expect(getUnderlyingByCToken.toString()).to.be.eq(pendingRedeem.toString())
		})

		it("Should be token value always > 1", async () => {
			const timepass = ONE_YEAR
			const targetAPR = ethers.utils.parseUnits("8", 6) // 8%;
			const amountToMint = ethers.utils.parseUnits("100000", 6)
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await mint(investor, amountToMint)

			await wtbtPool.connect(admin).setTargetAPR(targetAPR)
			now = (await ethers.provider.getBlock("latest")).timestamp + timepass
			await mineBlockWithTimestamp(ethers.provider, now)

			const pricePerToken = await wtbtPool.pricePerToken()
			expect(pricePerToken).to.be.gt(BigNumber.from(10).pow(6))
		})
	})

	describe("RBAC", async () => {
		it("Should not be able to change pool settings without POOL_MANAGER_ROLE", async () => {
			await expect(wtbtPool.connect(poolManager).setTargetAPR(1000000)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setMintFeeRate(1)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setRedeemFeeRate(1)).to.be.reverted
			await expect(
				wtbtPool.connect(poolManager).setCapitalLowerBound(BigNumber.from(10).pow(12))
			).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setVault(vault.address)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setTreasury(treasury.address)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setFeeCollector(fee_collector.address)).to.be
				.reverted
			await expect(
				wtbtPool.connect(poolManager).setManagerFeeCollector(manager_fee_collector.address)
			).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setProcessPeriod(100)).to.be.reverted
		})

		it("Should not be able to change pool settings without ADMIN_ROLE", async () => {
			await expect(wtbtPool.connect(poolManager).setTargetAPR(1000000)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setMintFeeRate(1)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setRedeemFeeRate(1)).to.be.reverted
			await expect(
				wtbtPool.connect(poolManager).setCapitalLowerBound(BigNumber.from(10).pow(12))
			).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setVault(vault.address)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setTreasury(treasury.address)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setFeeCollector(fee_collector.address)).to.be
				.reverted
			await expect(wtbtPool.connect(poolManager).setProcessPeriod(100)).to.be.reverted
		})

		it("Should not be able to change pool settings with POOL_MANAGER_ROLE", async () => {
			const POOL_MANAGER_ROLE = await wtbtPool.POOL_MANAGER_ROLE()
			await wtbtPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address)

			await expect(wtbtPool.connect(poolManager).setVault(vault.address)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setTreasury(treasury.address)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setFeeCollector(fee_collector.address)).to.be
				.reverted
		})

		it("Should be able to change pool settings with POOL_MANAGER_ROLE", async () => {
			const POOL_MANAGER_ROLE = await wtbtPool.POOL_MANAGER_ROLE()
			await wtbtPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address)
			await wtbtPool.connect(poolManager).setMintFeeRate(1)
			await wtbtPool.connect(poolManager).setRedeemFeeRate(1)
			await wtbtPool.connect(poolManager).setCapitalLowerBound(BigNumber.from(10).pow(12))
			await wtbtPool.connect(poolManager).setProcessPeriod(100)
		})

		it("Should be able to change target apr with APR_MANAGER_ROLE", async () => {
			const APR_MANAGER_ROLE = await wtbtPool.APR_MANAGER_ROLE()
			await wtbtPool.connect(admin).grantRole(APR_MANAGER_ROLE, aprManager.address)
			await wtbtPool.connect(aprManager).setTargetAPR(1000000)
		})

		it("Should be able to change pool settings with ADMIN_ROLE", async () => {
			await wtbtPool.connect(admin).setVault(vault.address)
			await wtbtPool.connect(admin).setTreasury(treasury.address)
			await wtbtPool.connect(admin).setFeeCollector(fee_collector.address)
			await wtbtPool.connect(admin).setManagerFeeCollector(manager_fee_collector.address)
		})

		it("Should not be able to change pause settings without ADMIN_ROLE", async () => {
			await expect(wtbtPool.connect(poolManager).pause()).to.be.reverted
		})

		it("Should be able to change pause settings with ADMIN_ROLE", async () => {
			await wtbtPool.connect(admin).pause()
			await wtbtPool.connect(admin).unpause()
		})
	})

	describe("Redeem", async () => {
		beforeEach(async () => {
			const POOL_MANAGER_ROLE = await wtbtPool.POOL_MANAGER_ROLE()
			await wtbtPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address)
			await wtbtPool.connect(poolManager).setProcessPeriod(ONE_DAY)
			const amountToMint = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await wtbtPool.connect(investor).mint(amountToMint)
			const amountToRedeem = await wtbtPool.connect(investor).cTokenBalances(investor.address)
			await wtbtPool.connect(investor).redeem(amountToRedeem)
		})

		it("Should be able to redeem", async () => {
			now = now + ONE_WEEK
			await mineBlockWithTimestamp(ethers.provider, now)
			const orderId = await wtbtPool.redeemIndex()
			await wtbtPool.connect(investor).redeemUnderlyingTokenById(orderId)
		})

		it("Should be not able to redeem with other account", async () => {
			now = now + ONE_WEEK
			await mineBlockWithTimestamp(ethers.provider, now)
			const orderId = await wtbtPool.redeemIndex()
			await expect(
				wtbtPool.connect(investor2).redeemUnderlyingTokenById(orderId)
			).to.be.revertedWith("105")
		})

		it("Should be not able to redeem when order is done", async () => {
			now = now + ONE_WEEK
			await mineBlockWithTimestamp(ethers.provider, now)
			const orderId = await wtbtPool.redeemIndex()
			await wtbtPool.connect(investor).redeemUnderlyingTokenById(orderId)
			await expect(
				wtbtPool.connect(investor).redeemUnderlyingTokenById(orderId)
			).to.be.revertedWith("106")
		})

		it("Should be not able to redeem when it's not yet been processed", async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			const orderId = await wtbtPool.redeemIndex()
			await expect(
				wtbtPool.connect(investor).redeemUnderlyingTokenById(orderId)
			).to.be.revertedWith("108")
		})
	})

	describe("FEE", async () => {
		beforeEach(async () => {
			const POOL_MANAGER_ROLE = await wtbtPool.POOL_MANAGER_ROLE()
			const APR_MANAGER_ROLE = await wtbtPool.APR_MANAGER_ROLE()
			await wtbtPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address)
			await wtbtPool.connect(admin).grantRole(APR_MANAGER_ROLE, aprManager.address)
			await wtbtPool.connect(poolManager).setProcessPeriod(0)
			// set 1% fee
			await wtbtPool.connect(poolManager).setMintFeeRate(1000000)
			await wtbtPool.connect(poolManager).setRedeemFeeRate(1000000)
			// 100% manager fee
		})

		it("Should not be able to change fee more then 1%", async () => {
			await expect(wtbtPool.connect(poolManager).setMintFeeRate(10000000)).to.be.reverted
			await expect(wtbtPool.connect(poolManager).setRedeemFeeRate(10000000)).to.be.reverted
		})

		it("Should not be able to change manager fee more then 100%", async () => {
			await expect(wtbtPool.connect(poolManager).setManagerFeeRate(100000001)).to.be.reverted
		})

		it("Should be able to mint with fee", async () => {
			const amountToMint = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await wtbtPool.connect(investor).mint(amountToMint)
			// 1% fee -> 99 cToken
			expect(await wtbtPool.balanceOf(investor.address)).to.equal(
				ethers.utils.parseUnits("99", 18)
			)
			// collect fee
			expect(await wtbtPool.balanceOf(fee_collector.address)).to.equal(
				ethers.utils.parseUnits("1", 18)
			)

			expect(await usdcToken.balanceOf(treasury.address)).to.equal(amountToMint)
		})

		it("Should be able to redeem with fee", async () => {
			const amountToMint = ethers.utils.parseUnits("100", 6) // 100 USDC
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await wtbtPool.connect(investor).mint(amountToMint)

			const beforeFeeCollectBalance = await usdcToken.balanceOf(fee_collector.address)
			const beforeInvestorBalance = await usdcToken.balanceOf(investor.address)

			const amountToRedeem = await wtbtPool.connect(investor).cTokenBalances(investor.address)
			await wtbtPool.connect(investor).redeem(amountToRedeem)

			const orderId = await wtbtPool.redeemIndex()

			const pendingRedeem = (await wtbtPool.connect(investor).redeemDetails(orderId))
				.underlyingAmount
			await wtbtPool.connect(investor).redeemUnderlyingTokenById(orderId)
			// equal 99 * 0.99
			const redeemUnderlyingAmount = pendingRedeem.mul(99000000).div(100000000)
			expect(await usdcToken.balanceOf(investor.address)).to.equal(
				beforeInvestorBalance.add(redeemUnderlyingAmount)
			)

			const afterFeeCollectBalance = await usdcToken.balanceOf(fee_collector.address)
			expect(afterFeeCollectBalance).to.equal(
				beforeFeeCollectBalance.add(pendingRedeem.sub(redeemUnderlyingAmount))
			)
		})

		it("Should be able to claim correct 10% manager fee", async () => {
			const timepass = ONE_YEAR
			const targetAPR = ethers.utils.parseUnits("8", 6) // 8%;
			const amountToMint = ethers.utils.parseUnits("1000000", 6)

			const managerFeeRate = ethers.utils.parseUnits("10", 6) // 10% manager fee
			await wtbtPool.connect(admin).setManagerFeeRate(managerFeeRate)
			await wtbtPool.connect(poolManager).setMintFeeRate(0)

			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await mint(investor, amountToMint)

			await wtbtPool.connect(admin).setTargetAPR(targetAPR)

			now = (await ethers.provider.getBlock("latest")).timestamp + timepass
			await mineBlockWithTimestamp(ethers.provider, now)

			const beforeTotalUnderlying = await wtbtPool.getTotalUnderlying()
			await wtbtPool.connect(admin).setTargetAPR(0)
			const unclaimFee = await wtbtPool.totalUnclaimManagerFee()
			const income = beforeTotalUnderlying.sub(amountToMint)
			// ~= 10%
			expect(unclaimFee).to.be.gte(income.mul(99000).div(1000000))
			expect(unclaimFee).to.be.lte(income.mul(100100).div(1000000))
		})
	})

	describe("APR", async () => {
		beforeEach(async () => {
			const APR_MANAGER_ROLE = await wtbtPool.APR_MANAGER_ROLE()
			await wtbtPool.connect(admin).grantRole(APR_MANAGER_ROLE, poolManager.address)
		})

		it("Should not be able to change apr more then 10%", async () => {
			await wtbtPool.connect(poolManager).setTargetAPR(10000000)
			await expect(wtbtPool.connect(poolManager).setTargetAPR(100000000)).to.be.reverted
		})
	})

	describe("ERC20", async () => {
		it("Should be able to approve and see allowence and transferFrom", async () => {
			const amountToMint = ethers.utils.parseUnits("1000000", 6)
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await mint(investor, amountToMint)

			await wtbtPool
				.connect(investor)
				.approve(investor2.address, ethers.utils.parseUnits("1000", 18))

			await expect(await wtbtPool.allowance(investor.address, investor2.address)).to.equal(
				ethers.utils.parseUnits("1000", 18)
			)
			await wtbtPool
				.connect(investor2)
				.transferFrom(
					investor.address,
					investor3.address,
					ethers.utils.parseUnits("100", 18)
				)

			await expect(await wtbtPool.balanceOf(investor3.address)).to.equal(
				ethers.utils.parseUnits("100", 18)
			)
			await expect(await wtbtPool.balanceOf(investor.address)).to.equal(
				ethers.utils.parseUnits("999900", 18)
			)
		})

		it("Should be able to totalSupply", async () => {
			// + 1000000 to 1000000
			const amountToMint = ethers.utils.parseUnits("1000000", 6)
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await mint(investor, amountToMint)
			await expect(await wtbtPool.totalSupply()).to.equal(
				ethers.utils.parseUnits("1000000", 18)
			)

			// - 500000 to 50000
			await redeem(investor, ethers.utils.parseUnits("500000", 18))
			await expect(await wtbtPool.totalSupply()).to.equal(
				ethers.utils.parseUnits("500000", 18)
			)

			// + 1000000 to 1500000
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await mint(investor, amountToMint)
			await expect(await wtbtPool.totalSupply()).to.equal(
				ethers.utils.parseUnits("1500000", 18)
			)
		})

		it("Should be emit event when mint and redeem", async () => {
			// + 100000 to 1000000
			const amountToMint = ethers.utils.parseUnits("1000000", 6)
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)

			await expect(wtbtPool.connect(investor).mint(amountToMint))
				.to.emit(wtbtPool, "Transfer")
				.withArgs(
					ethers.constants.AddressZero,
					investor.address,
					ethers.utils.parseUnits("1000000", 18)
				)

			// - 500000 to 50000
			const amountToRedeem = ethers.utils.parseUnits("500000", 18)
			await expect(wtbtPool.connect(investor).redeem(amountToRedeem))
				.to.emit(wtbtPool, "Transfer")
				.withArgs(
					investor.address,
					ethers.constants.AddressZero,
					ethers.utils.parseUnits("500000", 18)
				)
		})
	})

	describe("Upgradeable", async () => {
		it("Should have the same cTokenBalances after upgrade", async () => {
			const amountToMint = ethers.utils.parseUnits("1000000", 6)
			await usdcToken.connect(investor).approve(wtbtPool.address, amountToMint)
			await mint(investor, amountToMint)
			const cTokenBalanceOld = await wtbtPool.cTokenBalances(investor.address)

			wTBTPoolUpgraded = await ethers.getContractFactory("wTBTPoolV2PermissionUpgradedMock")
			let wtbtPoolUpgraded = await upgrades.upgradeProxy(wtbtPool.address, wTBTPoolUpgraded)
			await wtbtPoolUpgraded.deployed()

			// Make sure the contract is upgraded by calling a fake new function.
			await expect(await wtbtPoolUpgraded.mockNewFunction()).to.equal("Hello World!")

			await expect(await wtbtPoolUpgraded.cTokenBalances(investor.address)).to.equal(
				cTokenBalanceOld
			)
		})
	})
})
