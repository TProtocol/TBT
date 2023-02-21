pragma solidity ^0.8.0;

interface ITBTPoolV2Permission {
	function getUnderlyingByCToken(uint256) external view returns (uint256);

	function getInitalCtokenToUnderlying() external view returns (uint256);
}
