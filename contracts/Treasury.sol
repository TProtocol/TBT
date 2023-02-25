pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Treasury is AccessControl {
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
	bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
	bytes32 public constant WTBTPOOL_ROLE = keccak256("WTBTPOOL_ROLE");

	// used to mint stbt
	address public mpMintPool;
	// used to redeem stbt
	address public mpRedeemPool;
	// stbt address
	IERC20 public stbt;
	// underlying token address
	IERC20 public underlying;

	// mint threshold for underlying token
	uint256 mintThreshold;
	// redeem threshold for STBT
	uint256 redeemThreshold;
	// convert a amount from underlying token to stbt
	uint256 basis;

	// recover is using to receive recovery of fund
	address public recover;

	constructor(
		address _admin,
		address _recover,
		address _mpMintPool,
		address _mpRedeemPool,
		address _stbt,
		address _underlying
	) {
		require(_admin != address(0), "!_admin");
		_setupRole(DEFAULT_ADMIN_ROLE, _admin);
		_setRoleAdmin(MANAGER_ROLE, ADMIN_ROLE);

		_setupRole(ADMIN_ROLE, _admin);
		_setupRole(MANAGER_ROLE, _admin);

		require(_mpMintPool != address(0), "!_mpMintPool");
		require(_mpRedeemPool != address(0), "!_mpRedeemPool");
		require(_stbt != address(0), "!_stbt");
		require(_underlying != address(0), "!_underlying");
		require(_recover != address(0), "!_recover");
		mpMintPool = _mpMintPool;
		mpRedeemPool = _mpRedeemPool;
		stbt = IERC20(_stbt);
		underlying = IERC20(_underlying);
		recover = _recover;

		uint256 underlyingDecimals = ERC20(_underlying).decimals();

		basis = 10 ** (uint256(ERC20(_stbt).decimals() - underlyingDecimals));
	}

	/**
	 * @dev to set the mint pool
	 * @param _mintPool the address of mint pool
	 */
	function setMintPool(address _mintPool) external onlyRole(MANAGER_ROLE) {
		require(_mintPool != address(0), "!_mintPool");
		mpMintPool = _mintPool;
	}

	/**
	 * @dev to set the redeem pool
	 * @param _redeemPool the address of redeem pool
	 */
	function setRedeemPool(address _redeemPool) external onlyRole(MANAGER_ROLE) {
		require(_redeemPool != address(0), "!_redeemPool");
		mpRedeemPool = _redeemPool;
	}

	/**
	 * @dev to set the mint threshold
	 * @param amount the amount of mint threshold
	 */
	function setMintThreshold(uint256 amount) external onlyRole(MANAGER_ROLE) {
		mintThreshold = amount;
	}

	/**
	 * @dev to set the redeem threshold
	 * @param amount the amount of redeem threshold
	 */
	function setRedeemThreshold(uint256 amount) external onlyRole(MANAGER_ROLE) {
		redeemThreshold = amount;
	}

	/**
	 * @dev Transfer a give amout of underlying to mpMintPool
	 * @param amount the amout of underlying
	 */
	function mintSTBT(uint256 amount) external onlyRole(WTBTPOOL_ROLE) {
		require(amount >= mintThreshold, "less than mintThreshold");
		underlying.transfer(mpMintPool, amount);
	}

	/**
	 * @dev Transfer all balance of underlying to mpMintPool
	 */
	function mintAllToSTBT() external onlyRole(WTBTPOOL_ROLE) {
		uint256 balance = underlying.balanceOf(address(this));
		require(balance >= mintThreshold, "less than mintThreshold");
		underlying.safeTransfer(mpMintPool, balance);
	}

	/**
	 * @dev Transfer a give amout of stbt to matrix port's mint pool
	 * @param amount the amout of underlying token
	 */
	function redeemSTBT(uint256 amount) external onlyRole(WTBTPOOL_ROLE) {
		// convert to stbt amount
		uint256 stbtAmount = amount.mul(basis);
		require(stbtAmount >= redeemThreshold, "less than redeemThreshold");
		stbt.safeTransfer(mpRedeemPool, stbtAmount);
	}

	/**
	 * @dev Transfer all balance of stbt to matrix port's redeem pool
	 */
	function redeemAllSTBT() external onlyRole(WTBTPOOL_ROLE) {
		uint256 balance = stbt.balanceOf(address(this));
		require(balance >= redeemThreshold, "less than redeemThreshold");
		stbt.safeTransfer(mpRedeemPool, balance);
	}

	/**
	 * @dev Allows to recover any ERC20 token
	 * @param tokenAddress Address of the token to recover
	 * @param amountToRecover Amount of collateral to transfer
	 */
	function recoverERC20(
		address tokenAddress,
		uint256 amountToRecover
	) external onlyRole(ADMIN_ROLE) {
		IERC20(tokenAddress).safeTransfer(recover, amountToRecover);
	}
}
