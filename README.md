# TBT Pool V2

## Error Code

- 107: (verifyAccess) `verificationMode` is `DISABLED` but `verifyAccess` function is still called.
- 100: (sell) the amount of cToken to cell is more than how much the sender owns.
- 101: (sell) `totalUnderlying` is less than zero.
- 104: (sell) `cTokenTotalSupply` is less or equan to zero.
- 102: (sell) after selling, the `totalUnderlying` is less than `capitalLowerBound`.
- 105: (withdrawUnderlyingTokenByID) the withdrawal order is not caller.
- 106: (withdrawUnderlyingTokenByID) the withdrawal order is done.
- 107: (withdrawUnderlyingTokenByID) the vault does not have enough underlying token to withdraw.
- 108: (withdrawUnderlyingTokenByID) the withdrawal order is not ready for withdral.

## Development Deoploy & Verify
For Goerli Testnet
``` bash
yarn hardhat deoploy --network goerli
```

### Initalize the contract


## BSC Testnet
### Contract Address
- TBTPoolV2Permission: https://testnet.bscscan.com/address/0x41EED588F071dABAF0A795cE64E647fa0d85140e
- USDC: 0xbcBBB78D1B17A90499F2D4F2CF41f7f71Eb145Ac
