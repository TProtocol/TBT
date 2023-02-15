const { BigNumber } = require("ethers");

const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

const { soliditySha3 } = require("web3-utils");

const Account = require("eth-lib/lib/account");

const ONE_HOUR = 3600;
const ONE_DAY = ONE_HOUR * 24;
const ONE_WEEK = ONE_DAY * 7;
const ONE_MONTH = ONE_DAY * 30;
const ONE_YEAR = ONE_DAY * 365;


const EMPTY_CERTIFICATE = "0x";
const CERTIFICATE_VALIDITY_PERIOD = 1;

const VerificationMode = {
	CERTIFICATE: 0,
	ALLOW_LIST: 1,
	ALLOW_ALL: 2,
	DISABLED: 3
}

const mineBlockWithTimestamp = async (provider, timestamp) => {
  await provider.send("evm_mine", [timestamp]);
  return Promise.resolve();
};

const numberToHexa = (num, pushTo) => {
  const arr1 = [];
  const str = num.toString(16);
  if (str.length % 2 === 1) {
    arr1.push("0");
    pushTo -= 1;
  }
  for (let m = str.length / 2; m < pushTo; m++) {
    arr1.push("0");
    arr1.push("0");
  }
  for (let n = 0, l = str.length; n < l; n++) {
    const hex = str.charAt(n);
    arr1.push(hex);
  }
  return arr1.join("");
};

const craftNonceBasedCertificate = async (_txPayload, _token, _extension, _clock, _txSender) => {
  const _domain = await _token.generateDomainSeparator();
  // Retrieve current nonce from smart contract
  const nonce = await _extension.usedCertificateNonce(_token.address, _txSender);

  const time = await _clock.getTime();
  //   const time = "" + Math.floor(Date.now() / 1000); // todo: change

  const expirationTime = new Date(1000 * (parseInt(time) + CERTIFICATE_VALIDITY_PERIOD * ONE_HOUR));
  const expirationTimeAsNumber = Math.floor(expirationTime.getTime() / 1000);

  let rawTxPayload;
  if (_txPayload.length >= 64) {
    rawTxPayload = _txPayload.substring(0, _txPayload.length - 64);
  } else {
    throw new Error(`txPayload shall be at least 32 bytes long (${_txPayload.length / 2} instead)`);
  }

  const packedAndHashedParameters = soliditySha3(
    { type: "address", value: _txSender.toString() },
    { type: "address", value: _token.address.toString() },
    { type: "bytes", value: rawTxPayload },
    { type: "uint256", value: expirationTimeAsNumber.toString() },
    { type: "uint256", value: nonce.toString() }
  );

  const packedAndHashedData = soliditySha3(
    { type: "bytes32", value: _domain },
    { type: "bytes32", value: packedAndHashedParameters || "" }
  );

  const signature = Account.sign(packedAndHashedData, CERTIFICATE_SIGNER_PRIVATE_KEY);
  const vrs = Account.decodeSignature(signature);
  const v = vrs[0].substring(2).replace("1b", "00").replace("1c", "01");
  const r = vrs[1].substring(2);
  const s = vrs[2].substring(2);

  const certificate = `0x${numberToHexa(expirationTimeAsNumber, 32)}${r}${s}${v}`;

  return certificate;
};


describe("TBTPool V2 Permission Contract", async () => {
  let tbtPool;
  let usdcToken;
  let clockMock;

  let investor;
  let investor2;
  let investor3;
  let deployer;
  let controller;
  let treasury;
  let vault;
  let fee_collection;

  let admin;
  let poolManager;

  let now;

  const buy = async (account, amount) => {
    await tbtPool.connect(account).buy(amount);
  }

  const sell = async (account, amount) => {
    await tbtPool.connect(account).sell(amount);
  }

  beforeEach(async () => {
    [controller, treasury, vault, investor, investor2, investor3, deployer, admin, poolManager, fee_collection, protocol_fee_collection] = await ethers.getSigners();
    now = (await ethers.provider.getBlock("latest")).timestamp;
    const ERC20Token = await ethers.getContractFactory("ERC20Token");
    usdcToken = await ERC20Token.connect(deployer).deploy("USDC", "USDC", 6);
    await usdcToken.connect(deployer).mint(investor.address, ethers.utils.parseUnits("1000000000", 6)); // 1 billion USDC
    await usdcToken.connect(deployer).mint(investor2.address, ethers.utils.parseUnits("1000000000", 6)); // 1 billion USDC

    TBTPool = await ethers.getContractFactory("TBTPoolV2Permission");
    tbtPool = await upgrades.deployProxy(TBTPool, [
      "TBT Pool 1",
      "CP1",
      admin.address,
      usdcToken.address,
      0,
      vault.address,
      treasury.address,
      fee_collection.address,
      protocol_fee_collection.address
    ]);
    await tbtPool.deployed();
    // tbtPool = await TBTPool.connect(deployer).deploy(
    //   "TBT Pool 1",
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
    await usdcToken.connect(deployer).mint(treasury.address, ethers.utils.parseUnits("1000000000", 6)); // 1 billion USDC
    await usdcToken.connect(treasury).approve(tbtPool.address, ethers.utils.parseUnits("1000000000", 6)); // 1 billion USDC

    const ClockMock = await ethers.getContractFactory("ClockMock");
    clockMock = await ClockMock.deploy();


  });

  describe("Buy", async () => {
    it("Should be able to buy", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await tbtPool.connect(investor).buy(amountToBuy);
    });

    it("Should not be able to buy when pause", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await tbtPool.connect(admin).pause();
      await expect(tbtPool.connect(investor).buy(amountToBuy)).to.be.reverted;
    });

  });

  describe("Sell", async () => {
    beforeEach(async () => {
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await tbtPool.connect(investor).buy(amountToBuy);
    });

    it("Should be able to sell", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await tbtPool.connect(investor).cTokenBalances(investor.address);
      await tbtPool.connect(investor).sell(amountToSell);
    });

    it("Should not be able to sell when pause", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await tbtPool.connect(investor).cTokenBalances(investor.address);
      await tbtPool.connect(admin).pause();
      await expect(tbtPool.connect(investor).sell(amountToSell)).to.be.reverted;
    });

    it("Should not be able to sell more than balance", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = (await tbtPool.connect(investor).cTokenBalances(investor.address)).add(1);
      await expect(tbtPool.connect(investor).sell(amountToSell)).to.be.revertedWith("100");
    });


    it("Should not be able to sell all if left capital will be below lower bound", async () => {
      await tbtPool.connect(admin).setCapitalLowerBound(1);
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await tbtPool.connect(investor).cTokenBalances(investor.address);
      await expect(tbtPool.connect(investor).sell(amountToSell)).to.be.revertedWith("102");
    });

    it("Should be able to sell all if left capital will be equal or more than lower bound", async () => {
      await tbtPool.connect(admin).setCapitalLowerBound(0);
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await tbtPool.connect(investor).cTokenBalances(investor.address);
      await tbtPool.connect(investor).sell(amountToSell);
    });


    it("Should not be able to sell a half if left capital will be below lower bound", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      // Reward rate is zero, only one user, selling a half means taking half of the underlying.
      const amountToSell = (await tbtPool.connect(investor).cTokenBalances(investor.address)).div(2);
      const totalUnderlying = await tbtPool.totalUnderlying();
      await tbtPool.connect(admin).setCapitalLowerBound(totalUnderlying.div(2).add(1));
      await expect(tbtPool.connect(investor).sell(amountToSell)).to.be.revertedWith("102");
    });

    it("Should be able to sell a half if left capital will be equal or more than lower bound", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      // Reward rate is zero, only one user, selling a half means taking half of the underlying.
      const amountToSell = (await tbtPool.connect(investor).cTokenBalances(investor.address)).div(2);
      const totalUnderlying = await tbtPool.totalUnderlying();
      await tbtPool.connect(admin).setCapitalLowerBound(totalUnderlying.div(2));
      await tbtPool.connect(investor).sell(amountToSell);
    });
  });

  describe("Reward", async () => {

    it("Should get all reward when only one user exists", async () => {
      const stakedTime = ONE_YEAR;
      const targetAPR = ethers.utils.parseUnits("8", 6); // 8%;
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await buy(investor, amountToBuy);

      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      await tbtPool.connect(admin).setTargetAPR(targetAPR);

      now = now + stakedTime;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await tbtPool.connect(investor).cTokenBalances(investor.address);
      await sell(investor, amountToSell);
      const pendingWithdrawal = await tbtPool.connect(investor).getPendingWithdrawal(investor.address);

      const expected = amountToBuy.mul(108).div(100);
      // with 0.01% tolorence;
      expect(pendingWithdrawal).to.be.within(expected.mul(9999).div(10000), expected.mul(10001).div(10000));
    })

    it("Should get half the reward when two users staked the same amount", async () => {
      const stakedTime = ONE_YEAR;
      const targetAPR = ethers.utils.parseUnits("8", 6); // 8%;
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await buy(investor, amountToBuy);
      await usdcToken.connect(investor2).approve(tbtPool.address, amountToBuy);
      await buy(investor2, amountToBuy);

      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      await tbtPool.connect(admin).setTargetAPR(targetAPR);

      now = now + stakedTime;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await tbtPool.connect(investor).cTokenBalances(investor.address);
      await sell(investor, amountToSell);
      const amountToSell2 = await tbtPool.connect(investor2).cTokenBalances(investor2.address);
      await sell(investor2, amountToSell2);
      
      const pendingWithdrawal = await tbtPool.getPendingWithdrawal(investor.address);
      const pendingWithdrawal2 = await tbtPool.getPendingWithdrawal(investor2.address);
      expect(pendingWithdrawal).to.be.within(pendingWithdrawal2.mul(9999).div(10000), pendingWithdrawal2.mul(10001).div(10000));

      const expectedWithdrawal = amountToBuy.mul(108).div(100);
      expect(pendingWithdrawal).to.be.within(expectedWithdrawal.mul(9999).div(10000), expectedWithdrawal.mul(10001).div(10000));
    })

    it("Should be equal for getCTokenByUnderlying and buy cToken", async () => {
      const timepass = ONE_DAY;
      const targetAPR = ethers.utils.parseUnits("8", 6); // 8%;
      const amountToBuy = ethers.utils.parseUnits("100000", 6);
      await tbtPool.connect(admin).setTargetAPR(targetAPR);
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy * 2);
      await buy(investor, amountToBuy);
      now = now + timepass;
      await mineBlockWithTimestamp(ethers.provider, now);
      await tbtPool.connect(admin).setTargetAPR(0);
      const beforeCTokenBalance = await tbtPool.connect(investor).balanceOf(investor.address);
      const getCTokenAmount = await tbtPool.connect(investor).getCTokenByUnderlying(amountToBuy);
      await buy(investor, amountToBuy);
      const buyCTokenAmount = (await tbtPool.connect(investor).balanceOf(investor.address)).sub(beforeCTokenBalance);
      await expect(getCTokenAmount.toString()).to.be.eq(buyCTokenAmount.toString());
    })

    it("Should be equal for getUnderlyingByCToken and sell cToken", async () => {
      const timepass = ONE_DAY;
      const targetAPR = ethers.utils.parseUnits("8", 6); // 8%;
      const amountToBuy = ethers.utils.parseUnits("100000", 6);
      await tbtPool.connect(admin).setTargetAPR(targetAPR);
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await buy(investor, amountToBuy);
      now = now + timepass;
      await mineBlockWithTimestamp(ethers.provider, now);
      await tbtPool.connect(admin).setTargetAPR(0);

      const amountToSell = (await tbtPool.connect(investor).cTokenBalances(investor.address)).div(2);
      const getUnderlyingByCToken = await tbtPool.connect(investor).getUnderlyingByCToken(amountToSell);
      await sell(investor, amountToSell);

      const orderId = await tbtPool.withdrawalIndex();

      const pendingWithdrawal = (await tbtPool.connect(investor).withdrawalDetails(orderId)).underlyingAmount;
      await expect(getUnderlyingByCToken.toString()).to.be.eq(pendingWithdrawal.toString());
    })

    it("Should be token value always > 1", async () => {
      const timepass = ONE_YEAR;
      const targetAPR = ethers.utils.parseUnits("8", 6); // 8%;
      const amountToBuy = ethers.utils.parseUnits("100000", 6);
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await buy(investor, amountToBuy);
      
      await tbtPool.connect(admin).setTargetAPR(targetAPR);
      now = (await ethers.provider.getBlock("latest")).timestamp + timepass;
      await mineBlockWithTimestamp(ethers.provider, now);

      const pricePerToken = await tbtPool.pricePerToken();
      expect(pricePerToken).to.be.gt(BigNumber.from(10).pow(6));
    })
  });


  describe("RBAC", async () => {
    it("Should not be able to change pool settings without POOL_MANAGER_ROLE", async () => {
      await expect(tbtPool.connect(poolManager).setTargetAPR(1000000)).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setMintFeeRate(1)).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setWithdrawFeeRate(1)).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setCapitalLowerBound(BigNumber.from(10).pow(12))).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setVault(vault.address)).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setTreasury(treasury.address)).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setFeeCollection(fee_collection.address)).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setProtocolFeeCollection(protocol_fee_collection.address)).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setProcessPeriod(100)).to.be.reverted;
    })

    it("Should be able to change pool settings with POOL_MANAGER_ROLE", async () => {
      const POOL_MANAGER_ROLE = await tbtPool.POOL_MANAGER_ROLE();
      await tbtPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address);
      await tbtPool.connect(poolManager).setTargetAPR(1000000);
      await tbtPool.connect(poolManager).setMintFeeRate(1);
      await tbtPool.connect(poolManager).setWithdrawFeeRate(1);
      await tbtPool.connect(poolManager).setCapitalLowerBound(BigNumber.from(10).pow(12))
      await tbtPool.connect(poolManager).setVault(vault.address);
      await tbtPool.connect(poolManager).setTreasury(treasury.address);
      await tbtPool.connect(poolManager).setFeeCollection(fee_collection.address);
      await tbtPool.connect(poolManager).setProtocolFeeCollection(protocol_fee_collection.address);
      await tbtPool.connect(poolManager).setProcessPeriod(100);
    })

    it("Should not be able to change pause settings without ADMIN_ROLE", async () => {
      await expect(tbtPool.connect(poolManager).pause()).to.be.reverted;
    })

    it("Should be able to change pause settings with ADMIN_ROLE", async () => {
      await tbtPool.connect(admin).pause();
      await tbtPool.connect(admin).unpause();
    })
  })

  describe("Withdrawal", async() => {
    beforeEach(async () => {
      const POOL_MANAGER_ROLE = await tbtPool.POOL_MANAGER_ROLE();
      await tbtPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address);
      await tbtPool.connect(poolManager).setProcessPeriod(ONE_DAY);
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await tbtPool.connect(investor).buy(amountToBuy);
      const amountToSell = await tbtPool.connect(investor).cTokenBalances(investor.address);
      await tbtPool.connect(investor).sell(amountToSell);
    });

    it("Should be able to withdrawal", async () => {
      now = now + ONE_WEEK;
      await mineBlockWithTimestamp(ethers.provider, now);
      const orderId = await tbtPool.withdrawalIndex();
      await tbtPool.connect(investor).withdrawUnderlyingTokenById(orderId);
    })

    it("Should be not able to withdrawal with other account", async () => {
      now = now + ONE_WEEK;
      await mineBlockWithTimestamp(ethers.provider, now);
      const orderId = await tbtPool.withdrawalIndex();
      await expect(tbtPool.connect(investor2).withdrawUnderlyingTokenById(orderId)).to.be.revertedWith("105");
    })

    it("Should be not able to withdrawal when order is done", async () => {
      now = now + ONE_WEEK;
      await mineBlockWithTimestamp(ethers.provider, now);
      const orderId = await tbtPool.withdrawalIndex();
      await tbtPool.connect(investor).withdrawUnderlyingTokenById(orderId);
      await expect(tbtPool.connect(investor).withdrawUnderlyingTokenById(orderId)).to.be.revertedWith("106");
    })

    it("Should be not able to withdrawal when it's not yet been processed", async () => {
      now = now + ONE_HOUR;
      await mineBlockWithTimestamp(ethers.provider, now);
      const orderId = await tbtPool.withdrawalIndex();
      await expect(tbtPool.connect(investor).withdrawUnderlyingTokenById(orderId)).to.be.revertedWith("108");
    })
  })

  describe("FEE", async() => {
    beforeEach(async ()=> {
      const POOL_MANAGER_ROLE = await tbtPool.POOL_MANAGER_ROLE();
      await tbtPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address);
      await tbtPool.connect(poolManager).setProcessPeriod(0);
      // set 0.5% fee
      await tbtPool.connect(poolManager).setMintFeeRate(500000);
      await tbtPool.connect(poolManager).setWithdrawFeeRate(500000);
      // set 0.3% fee for protocol
      await tbtPool.connect(poolManager).setMintProtocolFeeRate(300000);
      await tbtPool.connect(poolManager).setWithdrawProtocolFeeRate(300000);
    })

    it("Should not be able to change fee more then 1%", async () => {
      await expect(tbtPool.connect(poolManager).setMintFeeRate(10000000)).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setWithdrawFeeRate(10000000)).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setMintProtocolFeeRate(10000000)).to.be.reverted;
      await expect(tbtPool.connect(poolManager).setWithdrawProtocolFeeRate(10000000)).to.be.reverted;
    })

    it("Should be able to buy with fee", async () => {
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await tbtPool.connect(investor).buy(amountToBuy);
      // 1% fee -> 99 cToken

      const FEE_COEFFICIENT = await tbtPool.FEE_COEFFICIENT();
      const mintFeeRate = await tbtPool.mintFeeRate();
      const mintProtocolFeeRate = await tbtPool.mintProtocolFeeRate();
      
      const totalFee = mintFeeRate.add(mintProtocolFeeRate);

      const INITIAL_CTOKEN_TO_UNDERLYING = await tbtPool.INITIAL_CTOKEN_TO_UNDERLYING();


      // underlying amount * INITIAL_CTOKEN_TO_UNDERLYING * ( 1 - fee )
      expect(await tbtPool.balanceOf(investor.address)).to.equal(amountToBuy.mul(INITIAL_CTOKEN_TO_UNDERLYING).mul(FEE_COEFFICIENT.sub(totalFee)).div(FEE_COEFFICIENT));
      // collect fee 
      expect(await usdcToken.balanceOf(fee_collection.address)).to.equal(amountToBuy.mul(mintFeeRate).div(FEE_COEFFICIENT));
      expect(await usdcToken.balanceOf(protocol_fee_collection.address)).to.equal(amountToBuy.mul(mintProtocolFeeRate).div(FEE_COEFFICIENT));
    })

    it("Should be able to sell with fee", async () => {
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await tbtPool.connect(investor).buy(amountToBuy);

      const beforeFeeCollectBalance = await usdcToken.balanceOf(fee_collection.address);
      const beforeProtocolFeeCollectBalance = await usdcToken.balanceOf(protocol_fee_collection.address);
      const beforeInvestorBalance = await usdcToken.balanceOf(investor.address);

      const amountToSell = await tbtPool.connect(investor).cTokenBalances(investor.address);
      await tbtPool.connect(investor).sell(amountToSell);

      const orderId = await tbtPool.withdrawalIndex();

      const pendingWithdrawal = (await tbtPool.connect(investor).withdrawalDetails(orderId)).underlyingAmount;
      await tbtPool.connect(investor).withdrawUnderlyingTokenById(orderId);
      // equal 99 * 0.99

      const FEE_COEFFICIENT = await tbtPool.FEE_COEFFICIENT();
      const withdrawFeeRate = await tbtPool.withdrawFeeRate();
      const withdrawProtocolFeeRate = await tbtPool.withdrawProtocolFeeRate();

      const withdrawUnderlyingAmount = pendingWithdrawal.sub(pendingWithdrawal.mul(withdrawFeeRate.add(withdrawProtocolFeeRate)).div(FEE_COEFFICIENT));
      expect(await usdcToken.balanceOf(investor.address)).to.equal(beforeInvestorBalance.add(withdrawUnderlyingAmount));

      const afterFeeCollectBalance = await usdcToken.balanceOf(fee_collection.address); 
      const afterProtocolFeeCollectBalance = await usdcToken.balanceOf(protocol_fee_collection.address); 
      
      expect(afterFeeCollectBalance).to.equal(beforeFeeCollectBalance.add(pendingWithdrawal.mul(withdrawFeeRate).div(FEE_COEFFICIENT)));
      expect(afterProtocolFeeCollectBalance).to.equal(beforeProtocolFeeCollectBalance.add(pendingWithdrawal.mul(withdrawProtocolFeeRate).div(FEE_COEFFICIENT)));
    })
  })

  describe("APR", async() => {
    beforeEach(async ()=> {
      const POOL_MANAGER_ROLE = await tbtPool.POOL_MANAGER_ROLE();
      await tbtPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address);
    })

    it("Should not be able to change apr more then 10%", async () =>{
      await tbtPool.connect(poolManager).setTargetAPR(10000000);
      await expect(tbtPool.connect(poolManager).setTargetAPR(100000000)).to.be.reverted;
    })
  })

  describe("ERC20", async () => {
    
    it("Should be able to approve and see allowence and transferFrom", async () => {
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await buy(investor, amountToBuy);

      await tbtPool.connect(investor).approve(investor2.address, ethers.utils.parseUnits("1000", 18));

      await expect(await tbtPool.allowance(investor.address, investor2.address)).to.equal(ethers.utils.parseUnits("1000", 18));
      await tbtPool.connect(investor2).transferFrom(investor.address, investor3.address, ethers.utils.parseUnits("100", 18));

      await expect(await tbtPool.balanceOf(investor3.address)).to.equal(ethers.utils.parseUnits("100", 18));
      await expect(await tbtPool.balanceOf(investor.address)).to.equal(ethers.utils.parseUnits("999900", 18));
    });

    it("Should be able to totalSupply", async () => {
      // + 1000000 to 1000000
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await buy(investor, amountToBuy);
      await expect(await tbtPool.totalSupply()).to.equal(ethers.utils.parseUnits("1000000", 18));

      // - 500000 to 50000
      await sell(investor, ethers.utils.parseUnits("500000", 18));
      await expect(await tbtPool.totalSupply()).to.equal(ethers.utils.parseUnits("500000", 18));

      // + 1000000 to 1500000
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await buy(investor, amountToBuy);
      await expect(await tbtPool.totalSupply()).to.equal(ethers.utils.parseUnits("1500000", 18));
    });

    it("Should be emit event when buy and sell", async () => {
      // + 100000 to 1000000
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);

      await expect(tbtPool.connect(investor).buy(amountToBuy)).to.emit(tbtPool, 'Transfer').withArgs(ethers.constants.AddressZero, investor.address, ethers.utils.parseUnits("1000000", 18));

      // - 500000 to 50000
      const amountToSell = ethers.utils.parseUnits("500000", 18);
      await expect(tbtPool.connect(investor).sell(amountToSell)).to.emit(tbtPool, 'Transfer').withArgs(investor.address, ethers.constants.AddressZero, ethers.utils.parseUnits("500000", 18));
    })
  });

  describe("Upgradeable", async () => {
    it ("Should have the same cTokenBalances after upgrade", async () => {
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(tbtPool.address, amountToBuy);
      await buy(investor, amountToBuy);
      const cTokenBalanceOld = await tbtPool.cTokenBalances(investor.address);

      TBTPoolUpgraded = await ethers.getContractFactory("TBTPoolV2PermissionUpgradedMock");
      let tbtPoolUpgraded = await upgrades.upgradeProxy(tbtPool.address, TBTPoolUpgraded );
      await tbtPoolUpgraded.deployed();

      // Make sure the contract is upgraded by calling a fake new function.
      await expect(await tbtPoolUpgraded.mockNewFunction()).to.equal("Hello World!");
      
      await expect(await tbtPoolUpgraded.cTokenBalances(investor.address)).to.equal(cTokenBalanceOld);
    })
  })
});