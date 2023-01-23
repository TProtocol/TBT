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


describe("CytusPool V2 Permission Contract", async () => {
  let cytusPool;
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
    await cytusPool.connect(account).buy(amount);
  }

  const sell = async (account, amount) => {
    await cytusPool.connect(account).sell(amount);
  }

  beforeEach(async () => {
    [controller, treasury, vault, investor, investor2, investor3, deployer, admin, poolManager, fee_collection] = await ethers.getSigners();
    now = (await ethers.provider.getBlock("latest")).timestamp;
    const ERC20Token = await ethers.getContractFactory("ERC20Token");
    usdcToken = await ERC20Token.connect(deployer).deploy("USDC", "USDC", 6);
    await usdcToken.connect(deployer).mint(investor.address, ethers.utils.parseUnits("1000000000", 6)); // 1 billion USDC
    await usdcToken.connect(deployer).mint(investor2.address, ethers.utils.parseUnits("1000000000", 6)); // 1 billion USDC

    CytusPool = await ethers.getContractFactory("CytusPoolV2Permission");
    cytusPool = await upgrades.deployProxy(CytusPool, [
      "Cytus Pool 1",
      "CP1",
      admin.address,
      usdcToken.address,
      0,
      vault.address,
      treasury.address,
      fee_collection.address
    ]);
    await cytusPool.deployed();
    // cytusPool = await CytusPool.connect(deployer).deploy(
    //   "Cytus Pool 1",
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
    await usdcToken.connect(treasury).approve(cytusPool.address, ethers.utils.parseUnits("1000000000", 6)); // 1 billion USDC

    const ClockMock = await ethers.getContractFactory("ClockMock");
    clockMock = await ClockMock.deploy();


  });

  describe("Buy", async () => {
    it("Should be able to buy", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await cytusPool.connect(investor).buy(amountToBuy);
    });

    it("Should not be able to buy when pause", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await cytusPool.connect(admin).pause();
      await expect(cytusPool.connect(investor).buy(amountToBuy)).to.be.reverted;
    });

  });

  describe("Sell", async () => {
    beforeEach(async () => {
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await cytusPool.connect(investor).buy(amountToBuy);
    });

    it("Should be able to sell", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await cytusPool.connect(investor).cTokenBalances(investor.address);
      await cytusPool.connect(investor).sell(amountToSell);
    });

    it("Should not be able to sell when pause", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await cytusPool.connect(investor).cTokenBalances(investor.address);
      await cytusPool.connect(admin).pause();
      await expect(cytusPool.connect(investor).sell(amountToSell)).to.be.reverted;
    });

    it("Should not be able to sell more than balance", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = (await cytusPool.connect(investor).cTokenBalances(investor.address)).add(1);
      await expect(cytusPool.connect(investor).sell(amountToSell)).to.be.revertedWith("100");
    });


    it("Should not be able to sell all if left capital will be below lower bound", async () => {
      await cytusPool.connect(admin).setCapitalLowerBound(1);
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await cytusPool.connect(investor).cTokenBalances(investor.address);
      await expect(cytusPool.connect(investor).sell(amountToSell)).to.be.revertedWith("102");
    });

    it("Should be able to sell all if left capital will be equal or more than lower bound", async () => {
      await cytusPool.connect(admin).setCapitalLowerBound(0);
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await cytusPool.connect(investor).cTokenBalances(investor.address);
      await cytusPool.connect(investor).sell(amountToSell);
    });


    it("Should not be able to sell a half if left capital will be below lower bound", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      // Reward rate is zero, only one user, selling a half means taking half of the underlying.
      const amountToSell = (await cytusPool.connect(investor).cTokenBalances(investor.address)).div(2);
      const totalUnderlying = await cytusPool.totalUnderlying();
      await cytusPool.connect(admin).setCapitalLowerBound(totalUnderlying.div(2).add(1));
      await expect(cytusPool.connect(investor).sell(amountToSell)).to.be.revertedWith("102");
    });

    it("Should be able to sell a half if left capital will be equal or more than lower bound", async () => {
      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      // Reward rate is zero, only one user, selling a half means taking half of the underlying.
      const amountToSell = (await cytusPool.connect(investor).cTokenBalances(investor.address)).div(2);
      const totalUnderlying = await cytusPool.totalUnderlying();
      await cytusPool.connect(admin).setCapitalLowerBound(totalUnderlying.div(2));
      await cytusPool.connect(investor).sell(amountToSell);
    });
  });

  describe("Reward", async () => {

    it("Should get all reward when only one user exists", async () => {
      const stakedTime = ONE_YEAR;
      const targetAPR = ethers.utils.parseUnits("8", 6); // 8%;
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await buy(investor, amountToBuy);

      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      await cytusPool.connect(admin).setTargetAPR(targetAPR);

      now = now + stakedTime;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await cytusPool.connect(investor).cTokenBalances(investor.address);
      await sell(investor, amountToSell);
      const pendingWithdrawal = await cytusPool.connect(investor).getPendingWithdrawal(investor.address);

      const expected = amountToBuy.mul(108).div(100);
      // with 0.01% tolorence;
      expect(pendingWithdrawal).to.be.within(expected.mul(9999).div(10000), expected.mul(10001).div(10000));
    })

    it("Should get half the reward when two users staked the same amount", async () => {
      const stakedTime = ONE_YEAR;
      const targetAPR = ethers.utils.parseUnits("8", 6); // 8%;
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await buy(investor, amountToBuy);
      await usdcToken.connect(investor2).approve(cytusPool.address, amountToBuy);
      await buy(investor2, amountToBuy);

      now = now + ONE_DAY;
      await mineBlockWithTimestamp(ethers.provider, now);
      await cytusPool.connect(admin).setTargetAPR(targetAPR);

      now = now + stakedTime;
      await mineBlockWithTimestamp(ethers.provider, now);
      const amountToSell = await cytusPool.connect(investor).cTokenBalances(investor.address);
      await sell(investor, amountToSell);
      const amountToSell2 = await cytusPool.connect(investor2).cTokenBalances(investor2.address);
      await sell(investor2, amountToSell2);
      
      const pendingWithdrawal = await cytusPool.getPendingWithdrawal(investor.address);
      const pendingWithdrawal2 = await cytusPool.getPendingWithdrawal(investor2.address);
      expect(pendingWithdrawal).to.be.within(pendingWithdrawal2.mul(9999).div(10000), pendingWithdrawal2.mul(10001).div(10000));

      const expectedWithdrawal = amountToBuy.mul(108).div(100);
      expect(pendingWithdrawal).to.be.within(expectedWithdrawal.mul(9999).div(10000), expectedWithdrawal.mul(10001).div(10000));
    })
  });


  describe("RBAC", async () => {
    it("Should not be able to change pool settings without POOL_MANAGER_ROLE", async () => {
      await expect(cytusPool.connect(poolManager).setTargetAPR(1000000)).to.be.reverted;
      await expect(cytusPool.connect(poolManager).setMintFeeRate(1)).to.be.reverted;
      await expect(cytusPool.connect(poolManager).setWithdrawFeeRate(1)).to.be.reverted;
      await expect(cytusPool.connect(poolManager).setCapitalLowerBound(BigNumber.from(10).pow(12))).to.be.reverted;
      await expect(cytusPool.connect(poolManager).setVault(vault.address)).to.be.reverted;
      await expect(cytusPool.connect(poolManager).setTreasury(treasury.address)).to.be.reverted;
      await expect(cytusPool.connect(poolManager).setFeeCollection(fee_collection.address)).to.be.reverted;
      await expect(cytusPool.connect(poolManager).setProcessPeriod(100)).to.be.reverted;
    })

    it("Should be able to change pool settings with POOL_MANAGER_ROLE", async () => {
      const POOL_MANAGER_ROLE = await cytusPool.POOL_MANAGER_ROLE();
      await cytusPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address);
      await cytusPool.connect(poolManager).setTargetAPR(1000000);
      await cytusPool.connect(poolManager).setMintFeeRate(1);
      await cytusPool.connect(poolManager).setWithdrawFeeRate(1);
      await cytusPool.connect(poolManager).setCapitalLowerBound(BigNumber.from(10).pow(12))
      await cytusPool.connect(poolManager).setVault(vault.address);
      await cytusPool.connect(poolManager).setTreasury(treasury.address);
      await cytusPool.connect(poolManager).setFeeCollection(fee_collection.address);
      await cytusPool.connect(poolManager).setProcessPeriod(100);
    })

    it("Should not be able to change pause settings without ADMIN_ROLE", async () => {
      await expect(cytusPool.connect(poolManager).pause()).to.be.reverted;
    })

    it("Should be able to change pause settings with ADMIN_ROLE", async () => {
      await cytusPool.connect(admin).pause();
      await cytusPool.connect(admin).unpause();
    })
  })

  describe("Withdrawal", async() => {
    beforeEach(async () => {
      const POOL_MANAGER_ROLE = await cytusPool.POOL_MANAGER_ROLE();
      await cytusPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address);
      await cytusPool.connect(poolManager).setProcessPeriod(ONE_DAY);
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await cytusPool.connect(investor).buy(amountToBuy);
      const amountToSell = await cytusPool.connect(investor).cTokenBalances(investor.address);
      await cytusPool.connect(investor).sell(amountToSell);
    });

    it("Should be able to withdrawal", async () => {
      now = now + ONE_WEEK;
      await mineBlockWithTimestamp(ethers.provider, now);
      const orderId = await cytusPool.withdrawalIndex();
      await cytusPool.connect(investor).withdrawUnderlyingTokenById(orderId);
    })

    it("Should be not able to withdrawal with other account", async () => {
      now = now + ONE_WEEK;
      await mineBlockWithTimestamp(ethers.provider, now);
      const orderId = await cytusPool.withdrawalIndex();
      await expect(cytusPool.connect(investor2).withdrawUnderlyingTokenById(orderId)).to.be.revertedWith("105");
    })

    it("Should be not able to withdrawal when order is done", async () => {
      now = now + ONE_WEEK;
      await mineBlockWithTimestamp(ethers.provider, now);
      const orderId = await cytusPool.withdrawalIndex();
      await cytusPool.connect(investor).withdrawUnderlyingTokenById(orderId);
      await expect(cytusPool.connect(investor).withdrawUnderlyingTokenById(orderId)).to.be.revertedWith("106");
    })

    it("Should be not able to withdrawal when it's not yet processed", async () => {
      now = now + ONE_HOUR;
      await mineBlockWithTimestamp(ethers.provider, now);
      const orderId = await cytusPool.withdrawalIndex();
      await expect(cytusPool.connect(investor).withdrawUnderlyingTokenById(orderId)).to.be.revertedWith("108");
    })
  })

  describe("FEE", async() => {
    beforeEach(async ()=> {
      const POOL_MANAGER_ROLE = await cytusPool.POOL_MANAGER_ROLE();
      await cytusPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address);
      await cytusPool.connect(poolManager).setProcessPeriod(0);
      // set 1% fee
      await cytusPool.connect(poolManager).setMintFeeRate(1000000);
      await cytusPool.connect(poolManager).setWithdrawFeeRate(1000000);
    })

    it("Should not be able to change fee more then 1%", async () => {
      await expect(cytusPool.connect(poolManager).setMintFeeRate(10000000)).to.be.reverted;
      await expect(cytusPool.connect(poolManager).setWithdrawFeeRate(10000000)).to.be.reverted;
    })

    it("Should be able to buy with fee", async () => {
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await cytusPool.connect(investor).buy(amountToBuy);
      // 1% fee -> 99 cToken
      expect(await cytusPool.balanceOf(investor.address)).to.equal(ethers.utils.parseUnits("99", 18));
      // collect fee 
      expect(await usdcToken.balanceOf(fee_collection.address)).to.equal(ethers.utils.parseUnits("1", 6));
    })

    it("Should be able to sell with fee", async () => {
      const amountToBuy = ethers.utils.parseUnits("100", 6); // 100 USDC
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await cytusPool.connect(investor).buy(amountToBuy);

      const beforeFeeCollectBalance = await usdcToken.balanceOf(fee_collection.address);
      const beforeInvestorBalance = await usdcToken.balanceOf(investor.address);

      const amountToSell = await cytusPool.connect(investor).cTokenBalances(investor.address);
      await cytusPool.connect(investor).sell(amountToSell);

      const orderId = await cytusPool.withdrawalIndex();

      const pendingWithdrawal = (await cytusPool.connect(investor).withdrawalDetails(orderId)).underlyingAmount;
      await cytusPool.connect(investor).withdrawUnderlyingTokenById(orderId);
      // equal 99 * 0.99
      const withdrawUnderlyingAmount = pendingWithdrawal.mul(99000000).div(100000000);
      expect(await usdcToken.balanceOf(investor.address)).to.equal(beforeInvestorBalance.add(withdrawUnderlyingAmount));

      const afterFeeCollectBalance = await usdcToken.balanceOf(fee_collection.address); 
      expect(afterFeeCollectBalance).to.equal(beforeFeeCollectBalance.add(pendingWithdrawal.sub(withdrawUnderlyingAmount)));

    })
  })

  describe("APR", async() => {
    beforeEach(async ()=> {
      const POOL_MANAGER_ROLE = await cytusPool.POOL_MANAGER_ROLE();
      await cytusPool.connect(admin).grantRole(POOL_MANAGER_ROLE, poolManager.address);
    })

    it("Should not be able to change apr more then 10%", async () =>{
      await cytusPool.connect(poolManager).setTargetAPR(10000000);
      await expect(cytusPool.connect(poolManager).setTargetAPR(100000000)).to.be.reverted;
    })
  })

  describe("ERC20", async () => {
    
    it("Should be able to approve and see allowence and transferFrom", async () => {
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await buy(investor, amountToBuy);

      await cytusPool.connect(investor).approve(investor2.address, ethers.utils.parseUnits("1000", 18));

      await expect(await cytusPool.allowance(investor.address, investor2.address)).to.equal(ethers.utils.parseUnits("1000", 18));
      await cytusPool.connect(investor2).transferFrom(investor.address, investor3.address, ethers.utils.parseUnits("100", 18));

      await expect(await cytusPool.balanceOf(investor3.address)).to.equal(ethers.utils.parseUnits("100", 18));
      await expect(await cytusPool.balanceOf(investor.address)).to.equal(ethers.utils.parseUnits("999900", 18));
    });

    it("Should be able to totalSupply", async () => {
      // + 1000000 to 1000000
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await buy(investor, amountToBuy);
      await expect(await cytusPool.totalSupply()).to.equal(ethers.utils.parseUnits("1000000", 18));

      // - 500000 to 50000
      await sell(investor, ethers.utils.parseUnits("500000", 18));
      await expect(await cytusPool.totalSupply()).to.equal(ethers.utils.parseUnits("500000", 18));

      // + 1000000 to 1500000
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await buy(investor, amountToBuy);
      await expect(await cytusPool.totalSupply()).to.equal(ethers.utils.parseUnits("1500000", 18));
    });

    it("Should be emit event when buy and sell", async () => {
      // + 100000 to 1000000
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);

      await expect(cytusPool.connect(investor).buy(amountToBuy)).to.emit(cytusPool, 'Transfer').withArgs(ethers.constants.AddressZero, investor.address, ethers.utils.parseUnits("1000000", 18));

      // - 500000 to 50000
      const amountToSell = ethers.utils.parseUnits("500000", 18);
      await expect(cytusPool.connect(investor).sell(amountToSell)).to.emit(cytusPool, 'Transfer').withArgs(investor.address, ethers.constants.AddressZero, ethers.utils.parseUnits("500000", 18));
    })
  });

  describe("Upgradeable", async () => {
    it ("Should have the same cTokenBalances after upgrade", async () => {
      const amountToBuy = ethers.utils.parseUnits("1000000", 6);
      await usdcToken.connect(investor).approve(cytusPool.address, amountToBuy);
      await buy(investor, amountToBuy);
      const cTokenBalanceOld = await cytusPool.cTokenBalances(investor.address);

      CytusPoolUpgraded = await ethers.getContractFactory("CytusPoolV2PermissionUpgradedMock");
      let cytusPoolUpgraded = await upgrades.upgradeProxy(cytusPool.address, CytusPoolUpgraded );
      await cytusPoolUpgraded.deployed();

      // Make sure the contract is upgraded by calling a fake new function.
      await expect(await cytusPoolUpgraded.mockNewFunction()).to.equal("Hello World!");
      
      await expect(await cytusPoolUpgraded.cTokenBalances(investor.address)).to.equal(cTokenBalanceOld);
    })
  })
});