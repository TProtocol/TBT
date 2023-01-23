pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "../tools/DomainAware.sol";
import "../roles/MinterRole.sol";

import "hardhat/console.sol";


contract TBTPoolV2PermissionUpgradedMock is
    DomainAware,
    AccessControlUpgradeable,
    ERC20Upgradeable,
    PausableUpgradeable
{
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant POOL_MANAGER_ROLE = keccak256("POOL_MANAGER_ROLE");

    // It's used to calculate the interest base.
    uint256 public constant APR_COEFFICIENT = 10 ** 8;
    // Used to calculate the fee base.
    uint256 public constant FEE_COEFFICIENT = 10 ** 8;

    // This token's decimals is 18, USDC's decimals is 6, so the INITIAL_CTOKEN_TO_UNDERLYING is 10**(18-6)
    uint256 public constant INITIAL_CTOKEN_TO_UNDERLYING = 10**12;

    mapping(address => uint256) public cTokenBalances;

    uint256 public cTokenTotalSupply;
    uint256 public totalUnderlying;
    uint256 public lastCheckpoint;
    uint256 public capitalLowerBound;
    IERC20Upgradeable public underlyingToken;
    // Vault, used to pay USDC to user when redeem cToken.
    address public vault;
    // Treasury, used to receive USDC from user when buy cToken.
    address public treasury;
    // Fee Collection, used to receive fee when mint or redeem.
    address public fee_collection;

    // withdrawFeeRate: 0.1% => 100000 (10 ** 5)
    // withdrawFeeRate: 10% => 10000000 (10 ** 7)
    // withdrawFeeRate: 100% => 100000000 (10 ** 8)
    // It's used when call withdrawUnderlyingToken method.
    uint256 public withdrawFeeRate;

    // mintFeeRate: 0.1% => 100000 (10 ** 5)
    // mintFeeRate: 10% => 10000000 (10 ** 7)
    // mintFeeRate: 100% => 100000000 (10 ** 8)
    // It's used when call buy method.
    uint256 public mintFeeRate;

    // Pending withdrawals, value is the USDC amount, user can claim whenever the vault has enough USDC.
    mapping(address => uint256) public pendingWithdrawals;

    // TODO: Can omit this, and calculate it from event.
    uint256 public totalPendingWithdrawals;

    // targetAPR: 0.1% => 100000 (10 ** 5)
    // targetAPR: 10% => 10000000 (10 ** 7)
    // targetAPR: 100% => 100000000 (10 ** 8)
    uint256 public targetAPR;

    uint256 public maxAPR;

    // Max fee rates can't over then 1%
    uint256 public constant maxMintFeeRate = 10 ** 6;
    uint256 public constant maxWithdrawFeeRate = 10 ** 6;

    // withdrawal index.
    uint256 public withdrawalIndex;
    // the time for redeem from bill.
    uint256 public processPeriod;

    struct WithdrawalDetail{
        uint256 id;
        uint256 timestamp;
        address user;
        uint256 underlyingAmount;
        // False not withdrawal, or True.
        bool isDone;
    }

    // Mapping from withdrawal index to WithdrawalDetail.
    mapping(uint256 => WithdrawalDetail) public withdrawalDetails;

    event WithdrawRequested(
        uint256 id,
        uint256 timestamp,
        address indexed user,
        uint256 cTokenAmount,
        uint256 underlyingAmount
    );

    event WithdrawUnderlyingToken(
        address indexed user,
        uint256 amount,
        uint256 fee
    );


    // Treasury: When user buy cToken, treasury will receive USDC.
    // Vault: When user redeem cToken, vault will pay USDC.
    // So should transfer money from treasury to vault, and let vault approve 10**70 to TBTPoolV2 Contract.
    function initialize(
        string memory name,
        string memory symbol,
        address admin,
        IERC20Upgradeable _underlyingToken,
        uint256 _capitalLowerBound,
        address _treasury,
        address _vault,
        address _fee_colletion
    ) public initializer {

        AccessControlUpgradeable.__AccessControl_init();
        ERC20Upgradeable.__ERC20_init(name, symbol);
        PausableUpgradeable.__Pausable_init();
        DomainAware.__DomainAware_init();

        // TODO: revisit.
        _setRoleAdmin(POOL_MANAGER_ROLE, ADMIN_ROLE);

        require(admin != address(0), "103");
        _setupRole(ADMIN_ROLE, admin);
        _setupRole(POOL_MANAGER_ROLE, admin);

        underlyingToken = _underlyingToken;
        
        lastCheckpoint = block.timestamp;
        capitalLowerBound = _capitalLowerBound;
        vault = _vault;
        treasury = _treasury;
        fee_collection = _fee_colletion;

        // const, reduce risk for now.
        // It's 10%.
        maxAPR = 10**7;

        // default 3 days
        processPeriod = 3 days;
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


    /* -------------------------------------------------------------------------- */
    /*                                Pool Settings                               */
    /* -------------------------------------------------------------------------- */

    function setTargetAPR(uint256 _targetAPR)
        external
        onlyRole(POOL_MANAGER_ROLE)
        realizeReward
    {
        require(_targetAPR <= maxAPR, "target apr should be less than max apr");
        targetAPR = _targetAPR;
    }

    function setProcessPeriod(uint256 _processPeriod)
        external
        onlyRole(POOL_MANAGER_ROLE)
    {
        processPeriod = _processPeriod;
    }

    // If lower bound is $1m USDC, the value should be 1,000,000 * 10**6
    function setCapitalLowerBound(uint256 _capitalLowerBound)
        external
        onlyRole(POOL_MANAGER_ROLE)
    {
        capitalLowerBound = _capitalLowerBound;
    }


    function setVault(address _vault) external onlyRole(POOL_MANAGER_ROLE) {
        vault = _vault;
    }


    function setTreasury(address _treasury)
        external
        onlyRole(POOL_MANAGER_ROLE)
    {
        treasury = _treasury;
    }

    function setFeeCollection(address _fee_collection) external onlyRole(POOL_MANAGER_ROLE) {
        fee_collection = _fee_collection;
    }


    function setMintFeeRate(uint256 _mintFeeRate)
        external
        onlyRole(POOL_MANAGER_ROLE)
    {
        require(
            _mintFeeRate <= maxMintFeeRate,
            "Mint fee rate should be less than 1%"
        );
        mintFeeRate = _mintFeeRate;
    }

    // TOOD: revisit the ACL. Currently is not elegant. (can't set global admin)
    function setWithdrawFeeRate(uint256 _withdrawFeeRate)
        external
        onlyRole(POOL_MANAGER_ROLE)
    {
        require(
            _withdrawFeeRate <= maxWithdrawFeeRate,
            "withdraw fee rate should be less than 1%"
        );
        withdrawFeeRate = _withdrawFeeRate;
    }


    /* -------------------------- End of Pool Settings -------------------------- */





    /* -------------------------------------------------------------------------- */
    /*                                   Getters                                  */
    /* -------------------------------------------------------------------------- */

    function getCTokenToUnderlying() external view returns (uint256) {
        if (cTokenTotalSupply == 0) {
            return cTokenTotalSupply;
        } else {
            return
                cTokenTotalSupply.div(
                    totalUnderlying.add(
                        getRPS().mul(block.timestamp.sub(lastCheckpoint))
                    )
                );
        }
    }

    function getRPS() public view returns (uint256) {
        // TODO: If use totalUnderlying, then the interest also incurs interest, do we want to switch to principal?
        // TODO: remove 10**8, and use constant.
        return targetAPR.mul(totalUnderlying).div(365 days).div(APR_COEFFICIENT);
    }

    function getPendingWithdrawal(address account) public view returns (uint256) {
        return pendingWithdrawals[account];
    }

    /* ----------------------------- End of Getters ----------------------------- */




    /* -------------------------------------------------------------------------- */
    /*                                 Core Logic                                 */
    /* -------------------------------------------------------------------------- */

    modifier realizeReward() {
        if (cTokenTotalSupply != 0) {
            totalUnderlying = totalUnderlying.add(
                getRPS().mul(block.timestamp.sub(lastCheckpoint))
            );
        }
        lastCheckpoint = block.timestamp;
        _;
    }

    // @param amount: the amount of underlying token, 1 USDC = 10**6
    // @param data: certificate data
    function buy(uint256 amount)
        external
        whenNotPaused
        realizeReward
    {
        // calculate fee
        uint256 feeAmount = amount.mul(mintFeeRate).div(FEE_COEFFICIENT);
        uint256 amountAfterFee = amount.sub(feeAmount);
        underlyingToken.safeTransferFrom(msg.sender, treasury, amountAfterFee);
        // collect fee
        if (feeAmount != 0){
            underlyingToken.safeTransferFrom(msg.sender, fee_collection, feeAmount);
        }

        amount = amountAfterFee;

        uint256 cTokenAmount;
        if (cTokenTotalSupply == 0 || totalUnderlying == 0) {
            cTokenAmount = amount.mul(INITIAL_CTOKEN_TO_UNDERLYING);
        } else {
            cTokenAmount = amount.mul(cTokenTotalSupply).div(totalUnderlying);
        }

        _mint(msg.sender, cTokenAmount);
        totalUnderlying = totalUnderlying.add(amount);
    }

    // @param amount: the amount of cToken, 1 cToken = 10**18, which eaquals to 1 USDC (if not interest).
    function sell(uint256 amount)
        external
        whenNotPaused
        realizeReward
    {
        require(amount <= cTokenBalances[msg.sender], "100");
        require(totalUnderlying >= 0, "101");
        require(cTokenTotalSupply > 0, "104");

        uint256 underlyingAmount = amount.mul(totalUnderlying).div(
            cTokenTotalSupply
        );

        require(
            totalUnderlying.sub(underlyingAmount) >= capitalLowerBound,
            "102"
        );

        _burn(msg.sender, amount);
        totalUnderlying = totalUnderlying.sub(underlyingAmount);

        withdrawalIndex++;
        withdrawalDetails[withdrawalIndex] = WithdrawalDetail({
            id: withdrawalIndex,
            timestamp: block.timestamp,
            user: msg.sender,
            underlyingAmount: underlyingAmount,
            isDone: false
        });

        // Instead of transferring underlying token to user, we record the pending withdrawal amount.
        pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].add(
            underlyingAmount
        );

        totalPendingWithdrawals = totalPendingWithdrawals.add(underlyingAmount);

        emit WithdrawRequested(
            withdrawalIndex,
            block.timestamp,
            msg.sender,
            amount,
            underlyingAmount
        );
    }

    function withdrawUnderlyingTokenById(uint256 _id)
        external
        whenNotPaused
    {
        require(withdrawalDetails[_id].user == msg.sender, "105");
        require(withdrawalDetails[_id].isDone == false, "106");
        require(underlyingToken.balanceOf(vault) >= withdrawalDetails[_id].underlyingAmount, "107");
        require(withdrawalDetails[_id].timestamp + processPeriod <= block.timestamp, "108");

        uint256 amount = withdrawalDetails[_id].underlyingAmount;

        withdrawalDetails[_id].isDone = true;

        pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].sub(
            amount
        );
        totalPendingWithdrawals = totalPendingWithdrawals.sub(amount);
        uint256 feeAmount = amount.mul(withdrawFeeRate).div(FEE_COEFFICIENT);
        uint256 amountAfterFee = amount.sub(feeAmount);
        underlyingToken.safeTransferFrom(vault, msg.sender, amountAfterFee);
        underlyingToken.safeTransferFrom(vault, fee_collection, feeAmount);
        emit WithdrawUnderlyingToken(
            msg.sender,
            amount,
            amountAfterFee
        );
    }

    /* ---------------------------- End of Core Logic --------------------------- */




    /* -------------------------------------------------------------------------- */
    /*                                Partial ERC20                               */
    /* -------------------------------------------------------------------------- */

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function totalSupply() public view override returns (uint256) {
        return cTokenTotalSupply;
    }

    function balanceOf(address _owner)
        public
        view
        override
        returns (uint256 balance)
    {
        return cTokenBalances[_owner];
    }


    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        uint256 fromBalance = cTokenBalances[from];
        require(
            fromBalance >= amount,
            "ERC20: transfer amount exceeds balance"
        );
        unchecked {
            cTokenBalances[from] = fromBalance - amount;
            // Overflow not possible: the sum of all balances is capped by totalSupply,
            // and the sum is preserved by decrementing then incrementing.
            cTokenBalances[to] += amount;
        }

        emit Transfer(from, to, amount);
    }

    function transfer(address to, uint256 amount)
        public
        override
        returns (bool)
    {
        address owner = _msgSender();
        _transfer(owner, to, amount);
        return true;
    }

    function allowance(address owner, address spender)
        public
        view
        override
        returns (uint256)
    {
        return super.allowance(owner, spender);
    }

    function approve(address spender, uint256 amount)
        public
        override
        returns (bool)
    {
        return super.approve(spender, amount);
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }

    function _burn(
        address account,
        uint256 amount
    ) internal override {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), amount);

        uint256 accountBalance = cTokenBalances[account];
        require(accountBalance >= amount, "ERC20: burn amount exceeds balance");
        unchecked {
            cTokenBalances[account] = accountBalance - amount;
            // Overflow not possible: amount <= accountBalance <= totalSupply.
            cTokenTotalSupply -= amount;
        }

        emit Transfer(account, address(0), amount);

        _afterTokenTransfer(account, address(0), amount);

    }

    function _mint(
        address account,
        uint256 amount
    ) internal override {
        require(account != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), account, amount);

        cTokenTotalSupply += amount;
        unchecked {
            // Overflow not possible: balance + amount is at most totalSupply + amount, which is checked above.
            cTokenBalances[account] += amount;
        }
        emit Transfer(address(0), account, amount);

        _afterTokenTransfer(address(0), account, amount);
    }

    /* -------------------------- End of Partial ERC20 -------------------------- */




    /* -------------------------------------------------------------------------- */
    /*                                Domain Aware                                */
    /* -------------------------------------------------------------------------- */

    function domainName() public view override returns (string memory) {
        return name();
    }

    function domainVersion() public view override returns (string memory) {
        return "1";
    }

    /* --------------------------- End of Domain Aware -------------------------- */
    function mockNewFunction() public pure returns (string memory) {
        return "Hello World!";
    }
}
