pragma solidity ^0.8.0;

interface ITreasury {
	function setRedeemPool(address) external;

	function setMintPool(address) external;

	function setMintThreshold(uint256) external;

	function setRedeemThreshold(uint256) external;

	function mintSTBT() external;

	function redeemSTBT(uint256) external;

	function redeemAllSTBT() external;

	function recoverERC20(address, uint256) external;
}
