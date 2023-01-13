# Cytus Pool V2

## Error Code

- 107: (verifyAccess) `verificationMode` is `DISABLED` but `verifyAccess` function is still called.
- 100: (sell) the amount of cToken to cell is more than how much the sender owns.
- 101: (sell) `totalUnderlying` is less than zero.
- 104: (sell) `cTokenTotalSupply` is less or equan to zero.
- 102: (sell) after selling, the `totalUnderlying` is less than `capitalLowerBound`.
- 105: (withdrawUnderlyingToken) the amount to withdraw is more than pending withdrawals of the sender.
- 106: (withdrawUnderlyingToken) the vault does not have enough underlying token to withdraw.
- 108: 