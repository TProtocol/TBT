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