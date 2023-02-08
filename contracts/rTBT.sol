pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StorageSlotUpgradeable.sol";

import "./interface/ITBTPoolV2Permission.sol";


contract rTBT is ERC20Upgradeable, PausableUpgradeable, AccessControlUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;


    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    /**
     * @dev rTBT balances are calculated based on the accounts' shares and 
     * the value of TBT locked at this contract.
     * 
     * user balance = user shares * value for per TBT
     * 
     * shares is equal to TBT with 1:1
     */ 
    mapping (address => uint256) private shares;

    IERC20Upgradeable public TBT;

    // equal to amount of tbt that locked contract.
    bytes32 internal constant TOTAL_SHARES_POSITION = keccak256("TProtocol.rTPT.totalShares");

    function initialize(
        string memory name,
        string memory symbol,
        address admin,
        IERC20Upgradeable _tbt
    ) public initializer {
        AccessControlUpgradeable.__AccessControl_init();

        ERC20Upgradeable.__ERC20_init(name, symbol);
        PausableUpgradeable.__Pausable_init();

        TBT = _tbt;

        require(admin != address(0), "103");
        _setupRole(ADMIN_ROLE, admin);
    }
    /* -------------------------------------------------------------------------- */
    /*                                Admin Settings                               */
    /* -------------------------------------------------------------------------- */

    // Pause the contract. Revert if already paused.
    function pause() external onlyRole(ADMIN_ROLE) {
        PausableUpgradeable._pause();
    }

    // Unpause the contract. Revert if already unpaused.
    function unpause() external onlyRole(ADMIN_ROLE) {
        PausableUpgradeable._unpause();
    }

    /**
     * @return the amount of shares that corresponds to `_amount` underlying token.
     */
    function getSharesByUnderlying(uint256 _amount) public view returns (uint256) {
        uint256 totalShares = _getTotalShares();
        if (totalShares == 0) {
            return 0;
        } else {
            return _amount
                .mul(totalShares)
                .div(_getTotalLockUnderlying());
        }
    }

    /**
     * @return the amount of Underlying that corresponds to `_sharesAmount` token shares.
     */
    function getUnderlyByShares(uint256 _sharesAmount) public view returns (uint256) {
        uint256 totalShares = _getTotalShares();
        if (totalShares == 0) {
            return 0;
        } else {
            return _sharesAmount
                .mul(_getTotalLockUnderlying())
                .div(totalShares);
        }
    }

    /**
     * @return the total amount of Underlying that controlled in contract .
     */
    function _getTotalLockUnderlying() internal view returns (uint256) {
        uint256 totalShares = _getTotalShares();
        if (totalShares == 0) {
            return 0;
        } else {
            uint256 CTOKEN_TO_UNDERLYING = ITBTPoolV2Permission(address(TBT)).getInitalCtokenToUnderlying();
            // normalize to 10**18
            return ITBTPoolV2Permission(address(TBT)).getUnderlyingByCToken(totalShares).mul(CTOKEN_TO_UNDERLYING);
        }
    }


    /**
     * @return the amount of tokens owned by the `_account`.
     *
     * @dev Balances are dynamic and equal the `_account`'s share in the amount of the
     * total Underlying token in contract.
     */
    function balanceOf(address _account) public override view returns (uint256) {
        return getUnderlyByShares(_sharesOf(_account));
    }

    /**
     * @dev override `transfer`
     */
    function transfer(address _recipient, uint256 _amount) public override returns (bool) {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    /**
     * @notice Transfers `_sharesAmount` shares from `_sender` to `_recipient`.
     *
     */
    function _transferShares(address _sender, address _recipient, uint256 _sharesAmount) internal whenNotPaused {
        require(_sender != address(0), "TRANSFER_FROM_THE_ZERO_ADDRESS");
        require(_recipient != address(0), "TRANSFER_TO_THE_ZERO_ADDRESS");

        shares[_sender] = shares[_sender].sub(_sharesAmount);
        shares[_recipient] = shares[_recipient].add(_sharesAmount);
    }

    function _transfer(address _sender, address _recipient, uint256 _amount) internal override {
        uint256 _sharesToTransfer = getSharesByUnderlying(_amount);
        _transferShares(_sender, _recipient, _sharesToTransfer);
        emit Transfer(_sender, _recipient, _amount);
    }

    /**
     * @return the amount of shares owned by `_account`.
     */
    function sharesOf(address _account) public view returns (uint256) {
        return _sharesOf(_account);
    }

    /**
     * @return the amount of shares owned by `_account`.
     */
    function _sharesOf(address _account) internal view returns (uint256) {
        return shares[_account];
    }

    /**
     * @return the total amount of shares.
     */
    function _getTotalShares() internal view returns (uint256) {
        return StorageSlotUpgradeable.getUint256Slot(TOTAL_SHARES_POSITION).value;
    }

    /**
     * @return the total amount of shares in existence.
     */
    function getTotalShares() public view returns (uint256) {
        return _getTotalShares();
    }

    function _mintShares(address _recipient, uint256 _sharesAmount) internal whenNotPaused {
        require(_recipient != address(0), "mint to ZERO");

        StorageSlotUpgradeable.getUint256Slot(TOTAL_SHARES_POSITION).value = _getTotalShares().add(_sharesAmount);

        shares[_recipient] = shares[_recipient].add(_sharesAmount);
    }

    function _burnShares(address _account, uint256 _sharesAmount) internal whenNotPaused {
        require(_account != address(0), "burn from ZERO");
        uint256 accountShares = shares[_account];
        require(_sharesAmount <= accountShares, "burn amount exceeds balance");
        shares[_account] = accountShares.sub(_sharesAmount);
        StorageSlotUpgradeable.getUint256Slot(TOTAL_SHARES_POSITION).value = _getTotalShares().sub(_sharesAmount);
    }


    /**
     * @return the amount of tokens in existence.
     *
     * @dev Always equals to `_getTotalLockUnderlying()` since token amount
     * is pegged to the total amount of underlying token controlled by the protocol.
     */
    function totalSupply() public view override returns (uint256) {
        return _getTotalLockUnderlying();
    }

    // TBT -> rTBT
    function wrap(uint256 _tbtAmount) external {
        require(_tbtAmount > 0, "can't wrap zero TBT");
        TBT.safeTransferFrom(msg.sender, address(this), _tbtAmount);
        _mintShares(msg.sender, _tbtAmount);

        emit Transfer(address(0), msg.sender, getUnderlyByShares(_tbtAmount));
    }

    // wrap rTBT -> TBT
    function unwrap(uint256 _underlyingAmount) public {
        // equal shares
        uint256 tbtAmount =  getSharesByUnderlying(_underlyingAmount);
        require(tbtAmount > 0 , "can't wrap zero rTBT");
        _burnShares(msg.sender, tbtAmount);
        TBT.safeTransfer(msg.sender, tbtAmount);

        emit Transfer(msg.sender, address(0), _underlyingAmount);
    }

    // wrap all rTBT -> TBT
    function unwrapAll() external {
        uint256 userBalance = balanceOf(msg.sender);
        uint256 shareAmount = sharesOf(msg.sender);

        require(shareAmount > 0 , "can't wrap zero rTBT");
        _burnShares(msg.sender, shareAmount);

        TBT.safeTransfer(msg.sender, shareAmount);
        emit Transfer(msg.sender, address(0), userBalance);
    }
}