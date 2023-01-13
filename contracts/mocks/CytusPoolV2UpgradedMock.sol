pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../tools/ERC1820Client.sol";
import "../tools/DomainAware.sol";
import "../interface/ERC1820Implementer.sol";
import "../roles/MinterRole.sol";
import "../extensions/tokenExtensions/IERC1400TokensValidator.sol";

import "hardhat/console.sol";

interface IExtensionTypes {
    enum CertificateValidation {
        None,
        NonceBased,
        SaltBased
    }
}

abstract contract Extension is IExtensionTypes {
    function registerTokenSetup(
        address token,
        CertificateValidation certificateActivated,
        bool allowlistActivated,
        bool blocklistActivated,
        bool granularityByPartitionActivated,
        bool holdsActivated,
        address[] calldata operators
    ) external virtual;

    function addCertificateSigner(address token, address account)
        external
        virtual;
}

contract CytusPoolV2UpgradedMock is
    ERC1820Client,
    ERC1820Implementer,
    IExtensionTypes,
    DomainAware,
    AccessControlUpgradeable,
    ERC20Upgradeable
{
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    string internal constant ERC1400_TOKENS_VALIDATOR =
        "ERC1400TokensValidator";
    string internal constant ERC1400_INTERFACE_NAME = "ERC1400Token";
    string internal constant ERC20_INTERFACE_NAME = "ERC20Token";
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant KYC_MANAGER_ROLE = keccak256("KYC_MANAGER_ROLE");
    bytes32 public constant POOL_MANAGER_ROLE = keccak256("POOL_MANAGER_ROLE");

    // This token's decimals is 18, USDC's decimals is 6, so the INITIAL_CTOKEN_TO_UNDERLYING is 10**(18-6)
    uint256 public constant INITIAL_CTOKEN_TO_UNDERLYING = 10**12;

    // verificationMode: 0 => no verification, 1 => allowlist, 2 => allow all
    enum VerificationMode {
        CERTIFICATE,
        ALLOW_LIST,
        ALLOW_ALL,
        DISABLED
    }

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

    VerificationMode public verificationMode;

    mapping(address => bool) public allowList;

    // withdrawFeeRate: 0.1% => 100000 (10 ** 5)
    // withdrawFeeRate: 10% => 10000000 (10 ** 7)
    // withdrawFeeRate: 100% => 100000000 (10 ** 8)
    // It's used when call withdrawUnderlyingToken method.
    uint256 public withdrawFeeRate;

    // Pending withdrawals, value is the USDC amount, user can claim whenever the vault has enough USDC.
    mapping(address => uint256) public pendingWithdrawals;

    // TODO: Can omit this, and calculate it from event.
    uint256 public totalPendingWithdrawals;

    // targetAPR: 0.1% => 100000 (10 ** 5)
    // targetAPR: 10% => 10000000 (10 ** 7)
    // targetAPR: 100% => 100000000 (10 ** 8)
    uint256 public targetAPR;

    uint256 public minAPR;
    uint256 public maxAPR;

    event WithdrawUnderlyingToken(
        address indexed user,
        uint256 amount,
        uint256 fee
    );


    // Treasury: When user buy cToken, treasury will receive USDC.
    // Vault: When user redeem cToken, vault will pay USDC.
    // So should transfer money from treasury to vault, and let vault approve 10**70 to CytusPoolV2 Contract.
    function initialize(
        string memory name,
        string memory symbol,
        address extension,
        address admin,
        address certificateSigner,
        address[] memory controllers,
        IERC20Upgradeable _underlyingToken,
        uint256 _capitalLowerBound,
        address _treasury,
        address _vault
    ) public initializer {
        require(
            extension != address(0),
            "CytusPoolV2: extension is zero address"
        );

        AccessControlUpgradeable.__AccessControl_init();
        ERC20Upgradeable.__ERC20_init(name, symbol);
        DomainAware.__DomainAware_init();

        Extension(extension).registerTokenSetup(
            address(this), // token
            CertificateValidation.NonceBased, // certificateActivated
            true, // allowlistActivated
            true, // blocklistActivated
            true, // granularityByPartitionActivated
            true, // holdsActivated
            controllers // token controllers
        );

        if (certificateSigner != address(0)) {
            Extension(extension).addCertificateSigner(
                address(this),
                certificateSigner
            );
        }

        // Register contract in ERC1820 registry
        ERC1820Client.setInterfaceImplementation(
            ERC1400_INTERFACE_NAME,
            address(this)
        );
        ERC1820Client.setInterfaceImplementation(
            ERC20_INTERFACE_NAME,
            address(this)
        );
        ERC1820Client.setInterfaceImplementation(
            ERC1400_TOKENS_VALIDATOR,
            extension
        );

        // Indicate token verifies ERC1400 and ERC20 interfaces
        ERC1820Implementer._setInterface(ERC1400_INTERFACE_NAME); // For migration
        ERC1820Implementer._setInterface(ERC20_INTERFACE_NAME); // For migration

        // TODO: revisit.
        _setRoleAdmin(KYC_MANAGER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(POOL_MANAGER_ROLE, ADMIN_ROLE);

        require(admin != address(0), "103");
        _setupRole(ADMIN_ROLE, admin);
        _setupRole(KYC_MANAGER_ROLE, admin);
        _setupRole(POOL_MANAGER_ROLE, admin);

        underlyingToken = _underlyingToken;
        lastCheckpoint = block.timestamp;
        capitalLowerBound = _capitalLowerBound;
        vault = _vault;
        treasury = _treasury;

        verificationMode = VerificationMode.CERTIFICATE;
        minAPR = 0;
        maxAPR = 10**7;
    }


    /* -------------------------------------------------------------------------- */
    /*                                Pool Settings                               */
    /* -------------------------------------------------------------------------- */

    function setTargetAPR(uint256 _targetAPR)
        external
        onlyRole(POOL_MANAGER_ROLE)
        realizeReward
    {
        targetAPR = _targetAPR;
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


    // TOOD: revisit the ACL. Currently is not elegant. (can't set global admin)
    function setWithdrawFeeRate(uint256 _withdrawFeeRate)
        external
        onlyRole(POOL_MANAGER_ROLE)
    {
        require(
            _withdrawFeeRate <= 10**8,
            "withdraw fee rate should be less than 100%"
        );
        withdrawFeeRate = _withdrawFeeRate;
    }


    function setVerificationMode(VerificationMode _verificationMode)
        external
        onlyRole(POOL_MANAGER_ROLE)
    {
        verificationMode = _verificationMode;
    }


    function setAprRange(uint256 _minAPR, uint256 _maxAPR)
        external
        onlyRole(POOL_MANAGER_ROLE)
    {
        require(_minAPR <= _maxAPR, "min apr should be less than max apr");
        minAPR = _minAPR;
        maxAPR = _maxAPR;
    }

    /* -------------------------- End of Pool Settings -------------------------- */




    /* -------------------------------------------------------------------------- */
    /*                                KYC Settings                                */
    /* -------------------------------------------------------------------------- */

    function updateAllowList(address[] calldata _allowList, bool _allow)
        external
        onlyRole(KYC_MANAGER_ROLE)
    {
        for (uint256 i = 0; i < _allowList.length; i++) {
            allowList[_allowList[i]] = _allow;
        }
    }

    /* --------------------------- End of KYC Settings -------------------------- */




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
        return targetAPR.mul(totalUnderlying).div(365 days).div(10**8);
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

    function validateBuyCertificate(uint256 amount, bytes calldata data)
        internal
    {
        address validatorImplementation = interfaceAddr(
            address(this),
            ERC1400_TOKENS_VALIDATOR
        );

        IERC1400TokensValidator(validatorImplementation).tokensToValidate(
            msg.data,
            "partition",
            msg.sender,
            address(0),
            msg.sender,
            amount,
            data,
            ""
        );
    }

    modifier verifyAccess(uint256 amount, bytes calldata data) {
        require(verificationMode != VerificationMode.DISABLED, "107");
        if (
            verificationMode == VerificationMode.ALLOW_ALL ||
            (verificationMode == VerificationMode.ALLOW_LIST &&
                allowList[msg.sender])
        ) {
            _;
        } else {
            validateBuyCertificate(amount, data);
            _;
        }
    }

    // @param amount: the amount of underlying token, 1 USDC = 10**6
    // @param data: certificate data
    function buy(uint256 amount, bytes calldata data)
        external
        verifyAccess(amount, data)
        realizeReward
    {
        underlyingToken.safeTransferFrom(msg.sender, treasury, amount);

        uint256 cTokenAmount;
        if (cTokenTotalSupply == 0 || totalUnderlying == 0) {
            cTokenAmount = amount.mul(INITIAL_CTOKEN_TO_UNDERLYING);
        } else {
            cTokenAmount = amount.mul(cTokenTotalSupply).div(totalUnderlying);
        }

        cTokenBalances[msg.sender] = cTokenBalances[msg.sender].add(
            cTokenAmount
        );
        cTokenTotalSupply = cTokenTotalSupply.add(cTokenAmount);
        totalUnderlying = totalUnderlying.add(amount);
    }

    // @param amount: the amount of cToken, 1 cToken = 10**18, which eaquals to 1 USDC (if not interest).
    // @param data: certificate data
    function sell(uint256 amount, bytes calldata data)
        external
        verifyAccess(amount, data)
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

        cTokenBalances[msg.sender] = cTokenBalances[msg.sender].sub(amount);
        cTokenTotalSupply = cTokenTotalSupply.sub(amount);
        totalUnderlying = totalUnderlying.sub(underlyingAmount);

        // Instead of transferring underlying token to user, we record the pending withdrawal amount.
        pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].add(
            underlyingAmount
        );
        totalPendingWithdrawals = totalPendingWithdrawals.add(underlyingAmount);
    }

    function withdrawUnderlyingToken(uint256 amount, bytes calldata data)
        external
        verifyAccess(amount, data)
    {
        require(pendingWithdrawals[msg.sender] >= amount, "105");
        require(underlyingToken.balanceOf(vault) >= amount, "106");
        pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].sub(
            amount
        );
        totalPendingWithdrawals = totalPendingWithdrawals.sub(amount);
        uint256 amountAfterFee = amount.mul(10**8 - withdrawFeeRate).div(10**8);
        underlyingToken.safeTransferFrom(vault, msg.sender, amountAfterFee);
        emit WithdrawUnderlyingToken(
            msg.sender,
            amount,
            amount.sub(amountAfterFee)
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

    /* ---------------- Below are only enabled in allowlist mode ---------------- */
    modifier verifyERC20Access(address from, address to) {
        require(verificationMode != VerificationMode.DISABLED, "108");
        if (verificationMode == VerificationMode.ALLOW_ALL) {
            _;
        } else if (verificationMode == VerificationMode.ALLOW_LIST) {
            require(
                allowList[from] && allowList[to],
                "sender or receiver not in allow list"
            );
            _;
        } else {
            revert("not allowed in this verification mode");
        }
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
        verifyERC20Access(msg.sender, to)
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
        verifyERC20Access(owner, spender)
        returns (uint256)
    {
        return super.allowance(owner, spender);
    }

    function approve(address spender, uint256 amount)
        public
        override
        verifyERC20Access(msg.sender, spender)
        returns (bool)
    {
        return super.approve(spender, amount);
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override verifyERC20Access(from, to) returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
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
