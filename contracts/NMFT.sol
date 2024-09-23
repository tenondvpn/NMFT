// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title NMFT: A Copyright-Preserving Data Trading Protocol
 * @dev This smart contract is associated with the research paper:
 * "NMFT: A Copyright-Preserving Data Trading Protocol based on NFT and Merkle Feature Tree"
 * 
 * The contract implements a novel approach to data trading that preserves copyright
 * and enables secure, verifiable transactions using NFTs and Merkle Feature Trees.
 *
 * Data tokens in this contract, named "Copyrighted Data" (CPRD), represent unique datasets
 * with associated ownership rights, pricing information, and cryptographic proofs.
 *
 * These CPRD tokens enable secure trading of data rights while protecting against
 * unauthorized replication and supporting ownership verification.
 *
 * For more details, please refer to the original research paper.
 */

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract NMFT is ERC721URIStorage, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    
    Counters.Counter private _tokenIds;
    address public admin;
    uint256 public similarityThreshold = 95;
    uint256 public constant CHALLENGE_RESPONSE_WINDOW = 24 hours;
    uint256 public constant TRANSACTION_TIMEOUT = 1 days;
    uint256 public constant COMPRESSED_VECTOR_LENGTH = 256;
    uint256 public constant MAX_VECTOR_LENGTH = 1000;

    // 数据信息结构体
    struct DataInfo {
        uint256 batchPrice;    // 批次价格
        uint256 batchNumber;   // 批次数量
        bytes32 latestMerkleRoot;    // 最新的Merkle树根
        mapping(bytes32 => uint256) merkleRootTimestamps; // Merkle树根的时间戳
    }

    // 定义数据交易类型枚举
    enum TradeType { DataOnly, DataAndNFT }

    // 请求结构体
    struct Request {
        uint256 reqBatchPrice;   // 请求的批次价格
        uint256 reqBatchNumber;  // 请求的批次数量
        TradeType tradeType;     // 数据交易类型
        uint256 challengeSize;   // 挑战大小
        uint256 nftTransferFee;  // NFT转移费用
        uint256 ownerDepositAmount; // 所有者质押金额
        bool confirmed;          // 确认状态
        bool buyerDeposited;     // 购买者质押状态
        bool ownerDeposited;     // 拥有者质押状态
        bool challengeInitiated; // 挑战是否已发起
        bool vectorsVerified;    // 向量是否已验证通过
        bool dataValidated;      // 买家验证状态
        uint256 lastActivityTimestamp; // 最后活动时间戳
    }

    struct Challenge {
        uint256 initiatedTimestamp;
        bool resolved;
        address currentWinner;
        uint256 winnerTokenId;
        uint256 totalTimestampDifference;
        uint256[] compressedChallengeVectors;
        bytes32[] challengeMerkleRoots;
    }

    // Hashchain信息结构体
    struct HashchainInfo {
        bytes32 tip;
        uint256 completedBatches;
        bool isCompleted;
    }

    // 存储每个tokenId对应的数据信息
    mapping(uint256 => DataInfo) private _dataInfo;
    // 存储每个tokenId每个买家请求的价格和批次数
    mapping(uint256 => mapping(address => Request)) private _requests;
    // 存储每个tokenId每个买家对应的挑战信息
    mapping(uint256 => mapping(address => Challenge)) private _challenges;
    // 存储每个tokenId和每个买家对应的Hashchain信息
    mapping(uint256 => mapping(address => HashchainInfo)) private _hashchainInfo;

    // 公开的随机投影矩阵
    int8[MAX_VECTOR_LENGTH][COMPRESSED_VECTOR_LENGTH] public projectionMatrix;

    // 事件：铸造NFT
    event DataNFTMinted(uint256 indexed tokenId, string description, uint256 batchPrice);
    // 事件：请求价格和批次数等
    event RequestMade(
        uint256 indexed tokenId,
        address indexed requester,
        uint256 reqBatchPrice,
        uint256 reqBatchNumber,
        TradeType tradeType,
        string tradeTypeStr,
        uint256 challengeSize,
        uint256 nftTransferFee
    );
    // 事件：记录阈值的更新
    event SimilarityThresholdUpdated(uint256 newThreshold);
    // 事件：确认请求
    event RequestConfirmed(uint256 indexed tokenId, address indexed requester, address indexed confirmer);
    // 事件：购买者质押完成
    event BuyerDepositMade(uint256 indexed tokenId, address indexed requester, uint256 amount);
    // 事件：拥有者质押完成
    event OwnerDepositMade(uint256 indexed tokenId, address indexed owner, uint256 amount);
    // 事件：挑战开始
    event ChallengeInitiated(uint256 indexed tokenId, address indexed challenger, address indexed originalOwner);
    // 事件：向量已验证
    event VectorsVerified(uint256 indexed tokenId, address indexed buyer);
    // 事件：更新Merkle根
    event MerkleRootUpdated(uint256 indexed tokenId, bytes32 newMerkleRoot);
    // 事件：买家验证通过
    event DataValidated(uint256 indexed tokenId, address indexed buyer);
    // 事件：挑战结束
    event ChallengeResolved(uint256 indexed tokenId, address buyer, address indexed winner, uint256 indexed winnerTokenId);
    // 事件：响应挑战
    event ChallengeResponseReceived(uint256 indexed tokenId, address indexed challenger, uint256 indexed challengerTokenId);
    // 事件：设置Hashchain tip
    event HashchainTipSet(uint256 indexed tokenId, address indexed buyer, address indexed winner, bytes32 tip, uint256 totalBatches);
    // 事件：确认最终支付
    event FinalPaymentConfirmed(uint256 indexed tokenId, address indexed buyer, address indexed winner, uint256 completedBatches);
    // 事件：交易已清理
    event TransactionCleanedUp(uint256 indexed tokenId, address indexed buyer, address indexed cleaner);

    constructor(address initialOwner, uint256 _projectionSeed) ERC721("Copyrighted Data", "CPRD") Ownable() {
        admin = initialOwner;
        initializeProjectionMatrix(_projectionSeed);
    }

    // 更新相似度阈值的函数
    function updateSimilarityThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0 && newThreshold <= 100, "Invalid threshold value");
        similarityThreshold = newThreshold;
        emit SimilarityThresholdUpdated(newThreshold);
    }

    // 初始化随机投影矩阵
    function initializeProjectionMatrix(uint256 seed) private {
        for (uint i = 0; i < COMPRESSED_VECTOR_LENGTH; i++) {
            for (uint j = 0; j < MAX_VECTOR_LENGTH; j++) {
                projectionMatrix[i][j] = pseudoRandom(seed, i, j) > 0 ? int8(1) : int8(-1);
            }
        }
    }

    // 压缩向量
    function compressVector(bytes32[] memory vector) public view returns (uint256) {
        require(vector.length <= MAX_VECTOR_LENGTH, "Vector too long");
        uint256 compressed = 0;
        for (uint i = 0; i < COMPRESSED_VECTOR_LENGTH; i++) {
            int256 dot = 0;
            for (uint j = 0; j < vector.length; j++) {
                dot += int256(uint256(vector[j])) * int256(projectionMatrix[i][j]);
            }
            if (dot > 0) {
                compressed |= (1 << i);
            }
        }
        return compressed;
    }

    // 获取压缩的挑战向量数组
    function getCompressedChallengeVectors(uint256 tokenId, address buyer) public view returns (uint256[] memory) {
        return _challenges[tokenId][buyer].compressedChallengeVectors;
    }

    // 计算压缩向量的汉明距离
    function hammingDistance(uint256 a, uint256 b) public pure returns (uint256) {
        uint256 xor = a ^ b;
        return countSetBits(xor);
    }

    // 计算置位数
    function countSetBits(uint256 n) internal pure returns (uint256) {
        uint256 count = 0;
        while (n > 0) {
            count += n & 1;
            n >>= 1;
        }
        return count;
    }

    // 生成伪随机数
    function pseudoRandom(uint256 seed, uint256 i, uint256 j) public pure returns (int256) {
        return int256(uint256(keccak256(abi.encodePacked(seed, i, j))));
    }

    // 铸造数据NFT
    function mintDataNFT(
        address to, 
        string memory tokenURI, 
        uint256 batchPrice, 
        uint256 batchNumber, 
        bytes32 merkleRoot, 
        string memory description
    ) external {
        _tokenIds.increment();
        uint256 tokenId = _tokenIds.current();
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        DataInfo storage newDataInfo = _dataInfo[tokenId];
        newDataInfo.batchPrice = batchPrice;
        newDataInfo.batchNumber = batchNumber;
        newDataInfo.latestMerkleRoot = merkleRoot;
        newDataInfo.merkleRootTimestamps[merkleRoot] = block.timestamp;
        emit DataNFTMinted(tokenId, description, batchPrice);
    }

    // 获取数据信息
    function getDataInfo(uint256 tokenId) public view returns (
        uint256 batchPrice,
        uint256 batchNumber,
        bytes32 latestMerkleRoot
    ) {
        DataInfo storage info = _dataInfo[tokenId];
        return (info.batchPrice, info.batchNumber, info.latestMerkleRoot);
    }
    
    // 转移NFT
    function transferNFT(address from, address to, uint256 tokenId) external {
        require(
            msg.sender == from || 
            isApprovedForAll(from, msg.sender) || 
            getApproved(tokenId) == msg.sender,
            "Not authorized to transfer"
        );
        safeTransferFrom(from, to, tokenId);
    }

    // 更新Merkle根
    function updateMerkleRoot(uint256 tokenId, bytes32 newMerkleRoot) external onlyTokenOwner(tokenId) {
        DataInfo storage dataInfo = _dataInfo[tokenId];
        require(dataInfo.merkleRootTimestamps[newMerkleRoot] == 0, "Merkle root already exists");
        dataInfo.merkleRootTimestamps[newMerkleRoot] = block.timestamp;
        dataInfo.latestMerkleRoot = newMerkleRoot;
        emit MerkleRootUpdated(tokenId, newMerkleRoot);
    }

    // 获取Merkle根的时间戳
    function getMerkleRootTimestamp(uint256 tokenId, bytes32 merkleRoot) public view returns (uint256) {
        return _dataInfo[tokenId].merkleRootTimestamps[merkleRoot];
    }

    // 买家请求数据
    function requestDataPurchase(
        uint256 tokenId, 
        uint256 reqBatchPrice, 
        uint256 reqBatchNumber, 
        TradeType tradeType, 
        uint256 challengeSize, 
        uint256 nftTransferFee
    ) 
        external 
        tokenExists(tokenId) 
    {
        require(_requests[tokenId][msg.sender].reqBatchNumber == 0, "Request already made");
        require(
            tradeType == TradeType.DataOnly || 
            (tradeType == TradeType.DataAndNFT && nftTransferFee > 0),
            "Invalid trade type or missing NFT fee"
        );
        require(reqBatchPrice > 0 && reqBatchNumber > 0, "Invalid batch price or number");
        
        DataInfo storage dataInfo = _dataInfo[tokenId];
        require(reqBatchNumber <= dataInfo.batchNumber, "Requested batch number exceeds available batches");
        
        _requests[tokenId][msg.sender] = Request({
            reqBatchPrice: reqBatchPrice,
            reqBatchNumber: reqBatchNumber,
            tradeType: tradeType,
            challengeSize: challengeSize,
            nftTransferFee: nftTransferFee,
            ownerDepositAmount: 0,
            confirmed: false,
            buyerDeposited: false,
            ownerDeposited: false,
            challengeInitiated: false,
            vectorsVerified: false,
            dataValidated: false,
            lastActivityTimestamp: block.timestamp
        });
        
        // 创建一个可读的字符串表示
        string memory tradeTypeStr = tradeType == TradeType.DataOnly ? "DataOnly" : "DataAndNFT";
        
        emit RequestMade(
            tokenId,
            msg.sender,
            reqBatchPrice,
            reqBatchNumber,
            tradeType,
            tradeTypeStr,
            challengeSize,
            nftTransferFee
        );
    }

    // 所有者确认请求
    function confirmRequest(uint256 tokenId, address requester) 
        external 
        tokenExists(tokenId) 
        onlyTokenOwner(tokenId) 
        validRequest(tokenId, requester) 
        requestNotConfirmed(tokenId, requester)
    {
        _requests[tokenId][requester].confirmed = true;
        _requests[tokenId][requester].lastActivityTimestamp = block.timestamp;
        emit RequestConfirmed(tokenId, requester, msg.sender);
    }

    // 买家质押
    function buyerDeposit(uint256 tokenId) 
        external 
        payable 
        nonReentrant 
        requestConfirmed(tokenId, msg.sender) 
        buyerNotDeposited(tokenId, msg.sender)
    {
        Request storage request = _requests[tokenId][msg.sender];
        uint256 depositAmount = request.tradeType == TradeType.DataOnly 
            ? request.reqBatchPrice * request.reqBatchNumber
            : request.reqBatchPrice * request.reqBatchNumber + request.nftTransferFee;

        require(msg.value == depositAmount, "Incorrect deposit amount");

        request.buyerDeposited = true;
        request.lastActivityTimestamp = block.timestamp;
        emit BuyerDepositMade(tokenId, msg.sender, msg.value);
    }

    // 所有者质押
    function ownerDeposit(uint256 tokenId, address buyer) 
        external 
        payable 
        nonReentrant 
        onlyTokenOwner(tokenId) 
        buyerDeposited(tokenId, buyer) 
        ownerNotDeposited(tokenId, buyer) 
    {
        Request storage request = _requests[tokenId][buyer];
        require(msg.value == request.ownerDepositAmount, "Incorrect deposit amount");

        request.ownerDeposited = true;
        request.lastActivityTimestamp = block.timestamp;
        emit OwnerDepositMade(tokenId, msg.sender, msg.value);
    }

    // 买家发起挑战，线下发送挑战索引列表L_c给所有者
    function initiateChallenge(uint256 tokenId) 
        external 
        ownerDeposited(tokenId, msg.sender)
        challengeNotInitiated(tokenId, msg.sender)
    {
        Request storage request = _requests[tokenId][msg.sender];
        Challenge storage challenge = _challenges[tokenId][msg.sender];
        // 防止买家对获胜的其他所有者重复发起挑战
        require(!challenge.resolved, "Challenge already resolved");

        address originalOwner = ownerOf(tokenId);
        _challenges[tokenId][msg.sender] = Challenge({
            initiatedTimestamp: block.timestamp,
            resolved: false,
            currentWinner: originalOwner,
            winnerTokenId: tokenId,
            totalTimestampDifference: 0,
            compressedChallengeVectors: new uint256[](0),
            challengeMerkleRoots: new bytes32[](0)
        });
        request.challengeInitiated = true;
        request.lastActivityTimestamp = block.timestamp;
        emit ChallengeInitiated(tokenId, msg.sender, originalOwner);
    }

    // 买家验证函数
    function buyerVerifyChallenge(uint256 tokenId)
        external
        challengeInitiated(tokenId, msg.sender)
        dataNotValidated(tokenId, msg.sender)
    {
        Request storage request = _requests[tokenId][msg.sender];
        request.dataValidated = true;
        request.lastActivityTimestamp = block.timestamp;
        emit DataValidated(tokenId, msg.sender);
    }

    // 原始所有者响应挑战
    function ownerResToChallenge(
        uint256 tokenId,
        address buyer,
        bytes32[][] memory vectors,
        bytes32[][] memory merkleProofs,
        bytes32[] memory merkleRoots
    ) 
        external 
        onlyTokenOwner(tokenId)
        challengeInitiated(tokenId, buyer)
        vectorsNotVerified(tokenId, buyer)
    {
        Challenge storage challenge = _challenges[tokenId][buyer];
        Request storage request = _requests[tokenId][buyer];
        uint256 challengeSize = request.challengeSize;
        DataInfo storage dataInfo = _dataInfo[tokenId];
        
        require(
            vectors.length == challengeSize && 
            merkleProofs.length == challengeSize && 
            merkleRoots.length == challengeSize, 
            "Input lengths must equal to challengeSize"
        );

        challenge.compressedChallengeVectors = new uint256[](challengeSize);
        challenge.challengeMerkleRoots = new bytes32[](challengeSize);

        for (uint i = 0; i < vectors.length; i++) {
            // 验证Merkle根是否存在
            require(dataInfo.merkleRootTimestamps[merkleRoots[i]] != 0, "Invalid Merkle root");
            // 验证Merkle证明
            bytes32 vectorHash = keccak256(abi.encodePacked(vectors[i]));
            require(
                MerkleProof.verify(merkleProofs[i], merkleRoots[i], vectorHash),
                "Invalid Merkle proof"
            );

            // 压缩向量
            challenge.compressedChallengeVectors[i] = compressVector(vectors[i]);
            challenge.challengeMerkleRoots[i] = merkleRoots[i];
        }

        // 标记向量已验证
        request.vectorsVerified = true;
        request.lastActivityTimestamp = block.timestamp;

        // 发出向量已验证事件
        emit VectorsVerified(tokenId, buyer);
    }

    // 其他数据所有者响应挑战
    function otherOwnersResToChallenge(
        uint256 tokenId,
        address buyer,
        uint256 challengerTokenId,
        bytes32[][] memory challengerVectors,
        bytes32[][] memory challengerMerkleProofs,
        bytes32[] memory challengerMerkleRoots
    ) 
        external 
        vectorsVerified(tokenId, buyer)
        dataValidated(tokenId, buyer)
    {
        Challenge storage challenge = _challenges[tokenId][buyer];
        require(challenge.initiatedTimestamp != 0, "Challenge does not exist");
        require(!challenge.resolved, "Challenge already resolved");

        if (block.timestamp >= challenge.initiatedTimestamp + CHALLENGE_RESPONSE_WINDOW) {
            _resolveChallenge(tokenId, buyer);
            return;
        }

        uint256[] memory originalCompVectors = challenge.compressedChallengeVectors;
        bytes32[] memory originalMerkleRoots = challenge.challengeMerkleRoots;
        require(
            originalCompVectors.length == challengerVectors.length && 
            originalCompVectors.length == challengerMerkleProofs.length &&
            originalCompVectors.length == challengerMerkleRoots.length,
            "Input lengths mismatch"
        );

        DataInfo storage originalDataInfo = _dataInfo[tokenId];
        DataInfo storage challengerDataInfo = _dataInfo[challengerTokenId];

        uint256 totalTimestampDifference = 0;

        for (uint i = 0; i < challengerVectors.length; i++) {
            // 验证Merkle根是否存在
            require(challengerDataInfo.merkleRootTimestamps[challengerMerkleRoots[i]] != 0, "Invalid Merkle root");
            // 验证Merkle证明
            bytes32 claimedVectorHash = keccak256(abi.encodePacked(challengerVectors[i]));
            require(
                MerkleProof.verify(challengerMerkleProofs[i], challengerMerkleRoots[i], claimedVectorHash),
                "Invalid Merkle proof"
            );

            // 检查Merkle根的时间戳
            uint256 challengerTimestamp = challengerDataInfo.merkleRootTimestamps[challengerMerkleRoots[i]];
            uint256 originalTimestamp = originalDataInfo.merkleRootTimestamps[originalMerkleRoots[i]];
            require(challengerTimestamp < originalTimestamp, "Challenger Merkle root not earlier");

            totalTimestampDifference += originalTimestamp - challengerTimestamp;

            // 计算相似度
            uint256 challengerCompVectors = compressVector(challengerVectors[i]);
            uint256 distance = hammingDistance(originalCompVectors[i], challengerCompVectors);
            uint256 similarity = (COMPRESSED_VECTOR_LENGTH - distance) * 100 / COMPRESSED_VECTOR_LENGTH;
            
            require(similarity >= similarityThreshold, "Similarity below threshold");
        }

        if (totalTimestampDifference > challenge.totalTimestampDifference) {
            challenge.currentWinner = msg.sender;
            challenge.totalTimestampDifference = totalTimestampDifference;
        }

        _requests[tokenId][buyer].lastActivityTimestamp = block.timestamp;
        emit ChallengeResponseReceived(tokenId, msg.sender, challengerTokenId);
    }

    // 买家确认挑战结束
    function buyerConfirmChallengeEnd(uint256 tokenId) 
        external 
        challengeInitiated(tokenId, msg.sender)
    {
        Challenge storage challenge = _challenges[tokenId][msg.sender];
        require(challenge.initiatedTimestamp != 0, "Challenge does not exist");
        require(!challenge.resolved, "Challenge already resolved");
        require(block.timestamp >= challenge.initiatedTimestamp + CHALLENGE_RESPONSE_WINDOW, "Challenge response window not closed yet");

        _resolveChallenge(tokenId, msg.sender);
    }

    // 内部函数：解决挑战
    function _resolveChallenge(uint256 tokenId, address buyer) internal nonReentrant {
        Challenge storage challenge = _challenges[tokenId][buyer];
        Request storage request = _requests[tokenId][buyer];
        
        if (challenge.winnerTokenId != tokenId) {
            // 原始所有者被证明是数据盗用者
            uint256 ownerDepositAmount = request.ownerDepositAmount;
            uint256 buyerDepositAmount = request.reqBatchPrice * request.reqBatchNumber;
            if (request.tradeType == TradeType.DataAndNFT) {
                buyerDepositAmount += request.nftTransferFee;
            }

            uint256 halfOwnerDepositAmount = ownerDepositAmount / 2;
            // 买家得到全额退款加上一半的所有者押金
            payable(buyer).transfer(buyerDepositAmount + halfOwnerDepositAmount);
            // 挑战成功的所有者得到另一半的所有者押金
            payable(challenge.currentWinner).transfer(halfOwnerDepositAmount);

            // 对获胜者新建一个challenge，且已经resolved，保证获胜者不会被重复挑战
            Challenge storage newChallenge = _challenges[challenge.winnerTokenId][challenge.currentWinner];
            newChallenge.resolved = true;
            newChallenge.currentWinner = challenge.currentWinner;
            newChallenge.winnerTokenId = challenge.winnerTokenId;
        }
        challenge.resolved = true;
        request.lastActivityTimestamp = block.timestamp;
        emit ChallengeResolved(tokenId, buyer, challenge.currentWinner, challenge.winnerTokenId);
    }

    // 买家设置Hashchain tip的函数
    function setHashchainTip(uint256 tokenId, bytes32 tip) 
        external 
    {
        Challenge storage challenge = _challenges[tokenId][msg.sender];
        require(challenge.resolved, "Challenge not resolved yet");
        require(tip != bytes32(0), "Invalid tip: cannot be zero");
        require(_hashchainInfo[tokenId][msg.sender].tip == bytes32(0), "Hashchain tip already set");
        
        Request storage request = _requests[tokenId][msg.sender];
        // 防止买家输错tokenId
        require(request.reqBatchNumber > 0, "Invalid batch number");
        // 防止挑战获胜的是其他所有者，他们自动跳过了挑战相关步骤，只通过挑战已经resolved不能保证买家已经质押了，所以显示要求买家必须先质押
        require(request.buyerDeposited, "Buyer has not deposited yet");

        _hashchainInfo[tokenId][msg.sender] = HashchainInfo({
            tip: tip,
            completedBatches: 0,
            isCompleted: false
        });

        request.lastActivityTimestamp = block.timestamp;
        emit HashchainTipSet(tokenId, msg.sender, challenge.currentWinner, tip, request.reqBatchNumber);
    }

    function confirmFinalPayment(uint256 tokenId, address buyer, bytes32 finalHash, uint256 newCompletedBatches) 
        external 
        nonReentrant
    {
        HashchainInfo storage hashchainInfo = _hashchainInfo[tokenId][buyer];
        require(hashchainInfo.tip != bytes32(0), "Hashchain not initialized");
        require(!hashchainInfo.isCompleted, "Payment already completed");

        Challenge storage challenge = _challenges[tokenId][buyer];
        require(challenge.currentWinner == msg.sender, "Only the challenge winner can confirm final payment");
        require(challenge.winnerTokenId == tokenId, "TokenId mismatch");

        Request storage request = _requests[tokenId][buyer];
        DataInfo storage dataInfo = _dataInfo[tokenId];
        uint256 totalCompletedBatches = hashchainInfo.completedBatches + newCompletedBatches;
        require(totalCompletedBatches <= request.reqBatchNumber, "Completed batches exceed requested batches");

        bytes32 computedTip = finalHash;
        for (uint256 i = 0; i < newCompletedBatches; i++) {
            computedTip = keccak256(abi.encodePacked(computedTip));
        }

        require(computedTip == hashchainInfo.tip, "Invalid final hash");

        // 计算本次确认的支付金额
        uint256 paymentAmount = request.reqBatchPrice * newCompletedBatches;

        // 更新HashchainInfo
        hashchainInfo.tip = finalHash;
        hashchainInfo.completedBatches = totalCompletedBatches;

        // 检查是否完成所有批次
        if (totalCompletedBatches == request.reqBatchNumber) {
            hashchainInfo.isCompleted = true;
            _cleanupTransaction(tokenId, buyer);
        }
        if (totalCompletedBatches == dataInfo.batchNumber) {
            if (request.tradeType == TradeType.DataAndNFT) {
                paymentAmount += request.nftTransferFee;
                // 转移NFT
                _transfer(msg.sender, buyer, challenge.winnerTokenId);
            }
        }

        // 将资金转移给挑战胜利者
        payable(msg.sender).transfer(paymentAmount);

        request.lastActivityTimestamp = block.timestamp;
        emit FinalPaymentConfirmed(tokenId, buyer, msg.sender, totalCompletedBatches);
    }

    // 所有者清理函数
    function ownerCleanupTransaction(uint256 tokenId, address buyer) external onlyTokenOwner(tokenId) nonReentrant {
        Request storage request = _requests[tokenId][buyer];
        require(request.reqBatchPrice > 0, "No valid request found");
        require(
            block.timestamp > request.lastActivityTimestamp + TRANSACTION_TIMEOUT,
            "Transaction has not timed out yet"
        );
        _cleanupTransaction(tokenId, buyer);

        emit TransactionCleanedUp(tokenId, buyer, msg.sender);
    }

    // 内部清理函数
    function _cleanupTransaction(uint256 tokenId, address buyer) internal {
        // 删除请求、挑战和Hashchain信息
        delete _requests[tokenId][buyer];
        delete _challenges[tokenId][buyer];
        delete _hashchainInfo[tokenId][buyer];
    }

    // 检查token是否存在
    modifier tokenExists(uint256 tokenId) {
        require(_exists(tokenId), "Token does not exist");
        _;
    }

    // 检查请求是否存在
    modifier validRequest(uint256 tokenId, address requester) {
        Request storage request = _requests[tokenId][requester];
        require(request.reqBatchPrice > 0 && request.reqBatchNumber > 0, "No valid request found");
        _;
    }

    // 检查是否为token所有者
    modifier onlyTokenOwner(uint256 tokenId) {
        require(ownerOf(tokenId) == msg.sender, "Only the token owner can perform this action");
        _;
    }

    // 检查请求是否已确认
    modifier requestConfirmed(uint256 tokenId, address requester) {
        require(_requests[tokenId][requester].confirmed, "Request not confirmed yet");
        _;
    }

    // 检查请求是否未确认
    modifier requestNotConfirmed(uint256 tokenId, address requester) {
        require(!_requests[tokenId][requester].confirmed, "Request already confirmed");
        _;
    }

    // 检查买家是否已质押
    modifier buyerDeposited(uint256 tokenId, address requester) {
        require(_requests[tokenId][requester].buyerDeposited, "Buyer has not deposited yet");
        _;
    }

    // 检查买家是否未质押
    modifier buyerNotDeposited(uint256 tokenId, address requester) {
        require(!_requests[tokenId][requester].buyerDeposited, "Buyer already deposited");
        _;
    }

    // 检查所有者是否未质押
    modifier ownerNotDeposited(uint256 tokenId, address requester) {
        require(!_requests[tokenId][requester].ownerDeposited, "Owner already deposited");
        _;
    }

    // 检查所有者是否已质押
    modifier ownerDeposited(uint256 tokenId, address requester) {
        require(_requests[tokenId][requester].ownerDeposited, "Owner has not deposited yet");
        _;
    }

    // 检查挑战是否已发起
    modifier challengeInitiated(uint256 tokenId, address requester) {
        require(_requests[tokenId][requester].challengeInitiated, "Challenge not initiated yet");
        _;
    }

    // 检查挑战是否未发起
    modifier challengeNotInitiated(uint256 tokenId, address requester) {
        require(!_requests[tokenId][requester].challengeInitiated, "Challenge already initiated");
        _;
    }

    // 检查向量是否已验证
    modifier vectorsVerified(uint256 tokenId, address requester) {
        require(_requests[tokenId][requester].vectorsVerified, "Vectors not verified yet");
        _;
    }

    // 检查向量是否未验证
    modifier vectorsNotVerified(uint256 tokenId, address requester) {
        require(!_requests[tokenId][requester].vectorsVerified, "Vectors already verified");
        _;
    }

    // 检查买家是否已验证
    modifier dataValidated(uint256 tokenId, address requester) {
        require(_requests[tokenId][requester].dataValidated, "Buyer has not verified yet");
        _;
    }

    // 检查买家是否未验证
    modifier dataNotValidated(uint256 tokenId, address requester) {
        require(!_requests[tokenId][requester].dataValidated, "Buyer already verified");
        _;
    }
}