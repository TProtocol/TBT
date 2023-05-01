# Permissions 
 
> Since the contract is upgradable. And to avoid freezing of funds, the contract has some authority to transfer funds. 
> 
> > Funds could be at risk if private keys are leaked. 
> > 
> > > For this reason, we designed timelock and multisig to avoid. 
 
--- 
 
1.  Upgradeable risk 
 
    > The [wTBT](https://etherscan.io/address/0xD38e031f4529a07996aaB977d2B79f0e00656C56 "0xD38e031f4529a07996aaB977d2B79f0e00656C56") and [TBT](https://etherscan.io/address/0x07Ac55797D4F43f57cA92a49E65ca582cC287c27 "0x07Ac55797D4F43f57cA92a49E65ca582cC287c27") are upgradable contracts. 
 
    - The [proxy admin](https://etherscan.io/address/0xc804e2F150940081ACa000aD0FF730C154Fe82CE "0xc804e2F150940081ACa000aD0FF730C154Fe82CE") is owner by a [timelock](https://etherscan.io/address/0x6D2d493616e9E8407509E77C6F21F5F5f52199D1 "0x6D2d493616e9E8407509E77C6F21F5F5f52199D1") with 2 days delay. 
      - The [timelock](https://etherscan.io/address/0x6D2d493616e9E8407509E77C6F21F5F5f52199D1 "0x6D2d493616e9E8407509E77C6F21F5F5f52199D1") is owner by a [multisig (3 of 5)](https://etherscan.io/address/0xbe5405162EA2284F5890326E83ECb831d88B32f7 "0xbe5405162EA2284F5890326E83ECb831d88B32f7"). 
 
2.  Admin role risk 
 
    > The [wTBT](https://etherscan.io/address/0xD38e031f4529a07996aaB977d2B79f0e00656C56 "0xD38e031f4529a07996aaB977d2B79f0e00656C56") has admin can set treasury and vault address. 
 
    - The ADMIN_ROLE and DEFAULT_ADMIN_ROLE of [wTBT](https://etherscan.io/address/0xD38e031f4529a07996aaB977d2B79f0e00656C56 "0xD38e031f4529a07996aaB977d2B79f0e00656C56") is a [timelock](https://etherscan.io/address/0x6D2d493616e9E8407509E77C6F21F5F5f52199D1 "0x6D2d493616e9E8407509E77C6F21F5F5f52199D1") with 2 days delay. 
 
      - Renounce the deployer role [tx1](https://etherscan.io/tx/0x42bfaa53886c8df1e272ed22f2aa3905f83be14619e4173aa1a5b41a75df548d "https://etherscan.io/tx/0x42bfaa53886c8df1e272ed22f2aa3905f83be14619e4173aa1a5b41a75df548d") and [tx2](https://etherscan.io/tx/0x74d88fe8f05d8e978c7435306e51178b11c22442705a52e2edac2d6cbeecadc7 "https://etherscan.io/tx/0x74d88fe8f05d8e978c7435306e51178b11c22442705a52e2edac2d6cbeecadc7") 
 
3.  Recovery fund risk 
 
    > The recoverERC20 function can transfer any erc20 token to [recover fund address](https://etherscan.io/address/0x7d273212AED9651797701a9dFb8e636F6Ba832b2 "https://etherscan.io/address/0x7d273212AED9651797701a9dFb8e636F6Ba832b2"). 
 
    - The [Treasury](https://etherscan.io/address/0xa01D9bc8343016C7DDD39852e49890a8361B2884 "0xa01D9bc8343016C7DDD39852e49890a8361B2884") and [Vault](https://etherscan.io/address/0x7C92EC6E0b7e1fb3E2bBbCbf5ACE74C2b9bC9407 "0x7C92EC6E0b7e1fb3E2bBbCbf5ACE74C2b9bC9407") is owner by a [timelock](https://etherscan.io/address/0x6D2d493616e9E8407509E77C6F21F5F5f52199D1 "0x6D2d493616e9E8407509E77C6F21F5F5f52199D1") with 2 days delay. 
 
      - The [timelock](https://etherscan.io/address/0x6D2d493616e9E8407509E77C6F21F5F5f52199D1 "0x6D2d493616e9E8407509E77C6F21F5F5f52199D1") is owner by a [multisig (3 of 5)](https://etherscan.io/address/0xbe5405162EA2284F5890326E83ECb831d88B32f7 "0xbe5405162EA2284F5890326E83ECb831d88B32f7"). 
 
    - The [recover fund address](https://etherscan.io/address/0x7d273212AED9651797701a9dFb8e636F6Ba832b2 "https://etherscan.io/address/0x7d273212AED9651797701a9dFb8e636F6Ba832b2") is a multisig (4 of 6) and unchangeable.