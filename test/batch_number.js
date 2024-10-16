const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');
const hre = require("hardhat");

const network = hre.network.name;
const csvFileName = `${network}_batch_number.csv`;
const batchNumber = 1000;
const reqBatchNumber = 1000;
const challengeSize = 10;
const reqBatchPrice = ethers.parseEther("0.1");
const tradeType = 1; // 1 代表 TradeType.DataAndNFT
const nftTransferFee = ethers.parseEther("1");
const ownerDepositAmount = ethers.parseEther("1");
let contractAddress;
let globalVectors = [];
let globalMerkleRoot = '';

// 创建测试参数数组
const testParams = Array.from({ length: 10 }, (_, index) => ({
  tokenIdOffset: index + 1,
  newCompletedBatches: (index + 1) * 100
}));

function appendToCSV(data) {
  const csvFilePath = path.join(__dirname, `../results/${csvFileName}`);
  const csvLine = `${data.method},${data.batchNumber},${data.latency},${data.gas},${data.contractAddress},${data.time},${data.receipt}\n`;

  if (!fs.existsSync(csvFilePath)) {
    fs.writeFileSync(csvFilePath, 'method,batchNumber,latency,gas,contractAddress,time,receipt\n');
  }

  fs.appendFileSync(csvFilePath, csvLine);
}

describe(`NMFT Contract on ${network} - Scalability Analysis`, function() {
  let nmft;
  let owner;
  let buyer;
  let otherOwner;
  let startTokenId;

  before(async function() {
    if (network === 'localhost') {
      contractAddress = process.env.LOCALHOST_NMFT_CONTRACT_ADDRESS;
    } else if (network === 'sepolia') {
      contractAddress = process.env.SEPOLIA_NMFT_CONTRACT_ADDRESS;
    } else {
      throw new Error(`Unsupported network: ${network}`);
    }

    if (!contractAddress) {
      throw new Error(`请在.env文件中设置${network.toUpperCase()}_NMFT_CONTRACT_ADDRESS`);
    }
    
    console.log("Contract address:", contractAddress);

    [owner] = await ethers.getSigners();
    buyer = owner;
    otherOwner = owner;

    const NMFT = await ethers.getContractFactory("NMFT");

    const abi = await NMFT.interface.format('json');
    nmft = new ethers.Contract(contractAddress, abi, owner);

    const totalSupply = await nmft.totalSupply();
    console.log("NFT总供应量:", Number(totalSupply));
    startTokenId = Number(totalSupply);
    console.log(`从 tokenId = ${startTokenId + 1} 开始`);

    // 设置大额余额
    const largeBalance = ethers.parseEther("1000000"); // 1,000,000 ETH
    await ethers.provider.send("hardhat_setBalance", [
      owner.address,
      ethers.toBeHex(largeBalance) // 转换为十六进制
    ]);
    console.log(`已为账户 ${owner.address} 设置 1,000,000 ETH 的余额`);

    // 检查余额
    const balance = await ethers.provider.getBalance(owner.address);
    console.log(`账户 ${owner.address} 的当前余额: ${ethers.formatEther(balance)} ETH`);
  });

  it("should test all functions with different newCompletedBatches", async function() {
    for (const { tokenIdOffset, newCompletedBatches } of testParams) {
      const currentTokenId = startTokenId + tokenIdOffset;
      console.log(`\n开始测试 newCompletedBatches = ${newCompletedBatches}, tokenId: ${currentTokenId}`);

      try {
        await mintDataNFT(currentTokenId, newCompletedBatches);
        await requestDataPurchase(currentTokenId, newCompletedBatches);
        await confirmRequest(currentTokenId, newCompletedBatches);
        await buyerDeposit(currentTokenId, newCompletedBatches);
        await ownerDeposit(currentTokenId, newCompletedBatches);
        await initiateChallenge(currentTokenId, newCompletedBatches);
        await ownerResToChallenge(currentTokenId, newCompletedBatches);
        await buyerVerifyChallenge(currentTokenId, newCompletedBatches);
        await otherOwnersResToChallenge(currentTokenId, newCompletedBatches);
        await buyerConfirmChallengeEnd(currentTokenId, newCompletedBatches);
        await setHashchainTip(currentTokenId, newCompletedBatches);
        await confirmFinalPayment(currentTokenId, newCompletedBatches);

        console.log(`测试完成 newCompletedBatches = ${newCompletedBatches}`);
      } catch (error) {
        console.error(`测试失败 newCompletedBatches = ${newCompletedBatches}:`, error.message);
        throw error;
      }
    }
  });

  async function mintDataNFT(i, newCompletedBatches) {
    const to = owner.address;
    const tokenURI = `https://example.com/token/${i}`;
    const batchPrice = ethers.parseEther("0.1");
    const nftTransferFee = ethers.parseEther("1");
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes(`test merkle root ${i}`));
    const description = `Test Data NFT ${i}`;

    const startTime = Date.now();
    const tx = await nmft.mintDataNFT(to, tokenURI, batchPrice, batchNumber, nftTransferFee, merkleRoot, description);
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'mintDataNFT',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`mintDataNFT 测试完成`);
  }

  async function requestDataPurchase(i, newCompletedBatches) {
    const tokenId = i;

    const startTime = Date.now();
    const tx = await nmft.connect(buyer).requestDataPurchase(
      tokenId,
      reqBatchPrice,
      reqBatchNumber,
      tradeType,
      challengeSize,
      nftTransferFee,
      ownerDepositAmount
    );
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'requestDataPurchase',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`requestDataPurchase 测试完成`);
  }

  async function confirmRequest(i, newCompletedBatches) {
    const tokenId = i;

    const startTime = Date.now();
    const tx = await nmft.connect(owner).confirmRequest(tokenId, buyer.address);
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'confirmRequest',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`confirmRequest 测试完成`);
  }

  async function buyerDeposit(i, newCompletedBatches) {
    const tokenId = i;
    depositAmount = tradeType === 1 
      ? reqBatchPrice * BigInt(reqBatchNumber) + nftTransferFee 
      : reqBatchPrice * BigInt(reqBatchNumber);
    
    const startTime = Date.now();
    const tx = await nmft.connect(buyer).buyerDeposit(tokenId, { value: depositAmount });
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'buyerDeposit',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`buyerDeposit 测试完成`);
  }

  async function ownerDeposit(i, newCompletedBatches) {
    const tokenId = i;
    const depositAmount = ethers.parseEther("1");

    const startTime = Date.now();
    const tx = await nmft.connect(owner).ownerDeposit(tokenId, buyer.address, { value: depositAmount });
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'ownerDeposit',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`ownerDeposit 测试完成`);
  }

  async function initiateChallenge(i, newCompletedBatches) {
    const tokenId = i;

    const startTime = Date.now();
    const tx = await nmft.connect(buyer).initiateChallenge(tokenId);
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'initiateChallenge',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`initiateChallenge 测试完成`);
  }

  async function ownerResToChallenge(i, newCompletedBatches) {
    const tokenId = i;
  
    // 创建 challengeSize 个 uint256 向量
    const vectors = Array(challengeSize).fill().map(() => ethers.toBigInt(ethers.randomBytes(32)));
    globalVectors = vectors;
    // 创建 Merkle tree
    const leaves = vectors.map(v => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v])));
    const tree = new MerkleTree(leaves, keccak256, { sort: true });
    const root = tree.getHexRoot();
    globalMerkleRoot = root;
  
    // 生成 Merkle proofs
    const merkleProofs = vectors.map(v => {
      const leaf = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v]));
      return tree.getHexProof(leaf);
    });
  
    // 假设所有 Merkle roots 都是相同的
    const merkleRoots = Array(challengeSize).fill(root);
  
    // 更新合约中的 Merkle root
    await nmft.connect(owner).updateMerkleRoot(tokenId, root);
  
    const startTime = Date.now();
    const tx = await nmft.connect(owner).ownerResToChallenge(tokenId, buyer.address, vectors, merkleProofs, merkleRoots);
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'ownerResToChallenge',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`ownerResToChallenge 测试完成`);
  }

  async function buyerVerifyChallenge(i, newCompletedBatches) {
    const tokenId = i;

    const startTime = Date.now();
    const tx = await nmft.connect(buyer).buyerVerifyChallenge(tokenId);
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'buyerVerifyChallenge',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`buyerVerifyChallenge 测试完成`);
  }

  async function otherOwnersResToChallenge(i, newCompletedBatches) {
    const tokenId = i;
    const challengerTokenId = 1;

    const originalVectors = globalVectors;
    const originalMerkleRoots = Array(challengeSize).fill(globalMerkleRoot);;

    const challengerVectors = Array(challengeSize).fill().map(() => ethers.toBigInt(ethers.randomBytes(32)));

    const leaves = challengerVectors.map(v => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v])));
    const tree = new MerkleTree(leaves, keccak256, { sort: true });
    const challengerMerkleRoot = tree.getHexRoot();

    const challengerMerkleProofs = challengerVectors.map(v => {
      const leaf = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v]));
      return tree.getHexProof(leaf);
    });

    // 假设所有 Merkle roots 都是相同的
    const challengerMerkleRoots = Array(challengeSize).fill(challengerMerkleRoot);
  
    // 更新合约中的 Merkle root
    await nmft.connect(otherOwner).updateMerkleRoot(challengerTokenId, challengerMerkleRoot);

    const startTime = Date.now();
    const tx = await nmft.connect(otherOwner).otherOwnersResToChallenge(
      tokenId,
      buyer.address,
      challengerTokenId,
      originalVectors,
      originalMerkleRoots,
      challengerVectors,
      challengerMerkleProofs,
      challengerMerkleRoots
    );
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'otherOwnersResToChallenge',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`otherOwnersResToChallenge 测试完成`);
  }

  async function buyerConfirmChallengeEnd(i, newCompletedBatches) {
    const tokenId = i;

    // 模拟时间经过
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]); // 增加超过24小时
    await ethers.provider.send("evm_mine"); // 挖一个新块

    const startTime = Date.now();
    const tx = await nmft.connect(buyer).buyerConfirmChallengeEnd(tokenId);
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'buyerConfirmChallengeEnd',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`buyerConfirmChallengeEnd 测试完成`);
  }

  async function setHashchainTip(tokenId, newCompletedBatches) {
    // 模拟哈希链
    let finalHash = ethers.keccak256(ethers.toUtf8Bytes(`finalHash${tokenId}`));
    let tip = finalHash;
    for (let i = 0; i < newCompletedBatches; i++) {
      tip = ethers.keccak256(tip);
    }

    const startTime = Date.now();
    const tx = await nmft.connect(buyer).setHashchainTip(tokenId, tip);
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'setHashchainTip',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`setHashchainTip 测试完成，newCompletedBatches: ${newCompletedBatches}`);
  }

  async function confirmFinalPayment(tokenId, newCompletedBatches) {
    const finalHash = ethers.keccak256(ethers.toUtf8Bytes(`finalHash${tokenId}`));

    const startTime = Date.now();
    const tx = await nmft.connect(owner).confirmFinalPayment(tokenId, buyer.address, finalHash, newCompletedBatches);
    const receipt = await tx.wait();
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    appendToCSV({
      method: 'confirmFinalPayment',
      batchNumber: newCompletedBatches,
      latency: executionTime,
      gas: parseInt(receipt.gasUsed.toString(), 10),
      contractAddress: contractAddress,
      time: new Date().toISOString(),
      receipt: receiptJson
    });

    console.log(`confirmFinalPayment 测试完成，newCompletedBatches: ${newCompletedBatches}`);
  }
});
