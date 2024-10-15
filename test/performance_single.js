const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');
const hre = require("hardhat");

// 获取当前网络
const network = hre.network.name;

// 根据网络设置 CSV 文件名
const csvFileName = `${network}_performance.csv`;

function appendToCSV(data) {
  const csvFilePath = path.join(__dirname, `../results/${csvFileName}`);
  const csvLine = `${data.method},${data.latency},${data.gas},${data.contractAddress},${data.time},${data.receipt}\n`;

  if (!fs.existsSync(csvFilePath)) {
    fs.writeFileSync(csvFilePath, 'method,latency,gas,contract_address,time,receipt\n');
  }

  fs.appendFileSync(csvFilePath, csvLine);
}


describe(`NMFT Contract on ${network} - Gas and Time Analysis`, function() {
  let contractAddress;
  let nmft;
  let owner;
  let buyer;
  let otherOwner;
  const TEST_COUNT = parseInt(process.env.TEST_COUNT || "1", 10);

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

    const NMFT = await ethers.getContractFactory("NMFT");
    nmft = NMFT.attach(contractAddress);

    [owner, buyer, otherOwner] = await ethers.getSigners();
  });

  it(`should measure gas and time for mintDataNFT (${TEST_COUNT} times)`, async function() {
    const [owner] = await ethers.getSigners();
    const to = owner.address;
    const tokenURI = "https://example.com/token/";
    const batchPrice = ethers.parseEther("0.1");
    const batchNumber = 100;
    const nftTransferFee = ethers.parseEther("1");

    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes(`test merkle root ${i}`));
        const description = `Test Data NFT ${i}`;

        const startTime = Date.now();
        
        const tx = await nmft.mintDataNFT(
          to,
          tokenURI + i,
          batchPrice,
          batchNumber,
          nftTransferFee,
          merkleRoot,
          description
        );
              
        const receipt = await tx.wait();
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

        appendToCSV({
          method: 'mintDataNFT',
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 mintDataNFT 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure time for getDataInfo (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1; // 假设 tokenId 从 1 开始

        const startTime = Date.now();
        const result = await nmft.getDataInfo(tokenId);
        console.log('DataInfo:', result);
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        appendToCSV({
          method: 'getDataInfo',
          latency: executionTime,
          gas: 0, // view 函数不消耗 gas
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: '' // 对于 view 函数，我们存储空字符串
        });

        console.log(`getDataInfo 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`getDataInfo 测试 #${i + 1} 失败:`, error.message);
      }
    }
  });

  it(`should measure gas and time for requestDataPurchase (${TEST_COUNT} times)`, async function() {    
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1; // 假设 tokenId 从 1 开始
        const reqBatchPrice = ethers.parseEther("0.1"); // 每批次0.1 ETH
        const reqBatchNumber = 5; // 请求5个批次
        const tradeType = 0; // 假设 0 代表 TradeType.DataOnly
        const challengeSize = 10; // 挑战大小为10
        const nftTransferFee = ethers.parseEther("1"); // NFT转移费为1 ETH
        const ownerDepositAmount = ethers.parseEther("1"); // 所有者存款为1 ETH

        const startTime = Date.now();
        
        const tx = await nmft.requestDataPurchase(
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
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`requestDataPurchase 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`requestDataPurchase 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 requestDataPurchase 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure gas and time for confirmRequest (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1;

        const startTime = Date.now();
        
        const tx = await nmft.connect(owner).confirmRequest(tokenId, buyer.address);
              
        const receipt = await tx.wait();
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

        appendToCSV({
          method: 'confirmRequest',
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`confirmRequest 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`confirmRequest 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 confirmRequest 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure gas and time for buyerDeposit (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1;
        const depositAmount = ethers.parseEther("0.5"); // 假设存款金额为0.5 ETH

        const startTime = Date.now();
        
        const tx = await nmft.connect(buyer).buyerDeposit(tokenId, { value: depositAmount });
              
        const receipt = await tx.wait();
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

        appendToCSV({
          method: 'buyerDeposit',
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`buyerDeposit 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`buyerDeposit 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 buyerDeposit 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure gas and time for ownerDeposit (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1;
        const depositAmount = ethers.parseEther("1"); // 假设存款金额为1 ETH

        const startTime = Date.now();
        
        const tx = await nmft.connect(owner).ownerDeposit(tokenId, buyer.address, { value: depositAmount });
              
        const receipt = await tx.wait();
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

        appendToCSV({
          method: 'ownerDeposit',
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`ownerDeposit 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`ownerDeposit 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 ownerDeposit 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure gas and time for initiateChallenge (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1;

        const startTime = Date.now();
        
        const tx = await nmft.connect(buyer).initiateChallenge(tokenId);
              
        const receipt = await tx.wait();
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

        appendToCSV({
          method: 'initiateChallenge',
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`initiateChallenge 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`initiateChallenge 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 initiateChallenge 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure gas and time for ownerResToChallenge (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1;
        const vectors = Array(10).fill().map((_, index) => index + 1); // 创建长度为10的向量
        const merkleProofs = Array(10).fill().map((_, index) => [ethers.keccak256(ethers.toUtf8Bytes(`proof${index}`))]);
        const merkleRoots = Array(10).fill().map((_, index) => ethers.keccak256(ethers.toUtf8Bytes(`root${index}`)));

        const startTime = Date.now();
        
        const tx = await nmft.connect(owner).ownerResToChallenge(tokenId, buyer.address, vectors, merkleProofs, merkleRoots);
              
        const receipt = await tx.wait();
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

        appendToCSV({
          method: 'ownerResToChallenge',
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`ownerResToChallenge 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`ownerResToChallenge 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 ownerResToChallenge 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure gas and time for buyerVerifyChallenge (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1;

        const startTime = Date.now();
        
        const tx = await nmft.connect(buyer).buyerVerifyChallenge(tokenId);
              
        const receipt = await tx.wait();
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

        appendToCSV({
          method: 'buyerVerifyChallenge',
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`buyerVerifyChallenge 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`buyerVerifyChallenge 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 buyerVerifyChallenge 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure gas and time for otherOwnersResToChallenge (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1;
        const challengerTokenId = i + 100; // 假设挑战者的tokenId
        const originalVectors = Array(10).fill().map((_, index) => index + 1);
        const originalMerkleRoots = Array(10).fill().map((_, index) => ethers.keccak256(ethers.toUtf8Bytes(`root${index}`)));
        const challengerVectors = Array(10).fill().map((_, index) => index + 11);
        const challengerMerkleProofs = Array(10).fill().map((_, index) => [ethers.keccak256(ethers.toUtf8Bytes(`challengerProof${index}`))]);
        const challengerMerkleRoots = Array(10).fill().map((_, index) => ethers.keccak256(ethers.toUtf8Bytes(`challengerRoot${index}`)));

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
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`otherOwnersResToChallenge 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`otherOwnersResToChallenge 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 otherOwnersResToChallenge 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure gas and time for buyerConfirmChallengeEnd (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1;

        const startTime = Date.now();
        
        const tx = await nmft.connect(buyer).buyerConfirmChallengeEnd(tokenId);
              
        const receipt = await tx.wait();
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

        appendToCSV({
          method: 'buyerConfirmChallengeEnd',
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`buyerConfirmChallengeEnd 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`buyerConfirmChallengeEnd 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 buyerConfirmChallengeEnd 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure gas and time for setHashchainTip (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1;
        const tip = ethers.keccak256(ethers.toUtf8Bytes(`tip${i}`));

        const startTime = Date.now();
        
        const tx = await nmft.connect(buyer).setHashchainTip(tokenId, tip);
              
        const receipt = await tx.wait();
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

        appendToCSV({
          method: 'setHashchainTip',
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`setHashchainTip 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`setHashchainTip 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 setHashchainTip 完成，结果已追加到 CSV 文件`);
  });

  it(`should measure gas and time for confirmFinalPayment (${TEST_COUNT} times)`, async function() {
    for (let i = 0; i < TEST_COUNT; i++) {
      try {
        const tokenId = i + 1;
        const finalHash = ethers.keccak256(ethers.toUtf8Bytes(`finalHash${i}`));
        const newCompletedBatches = 5; // 假设完成了5个批次

        const startTime = Date.now();
        
        const tx = await nmft.connect(owner).confirmFinalPayment(tokenId, buyer.address, finalHash, newCompletedBatches);
              
        const receipt = await tx.wait();
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        const receiptJson = JSON.stringify(receipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

        appendToCSV({
          method: 'confirmFinalPayment',
          latency: executionTime,
          gas: parseInt(receipt.gasUsed.toString(), 10),
          contractAddress: contractAddress,
          time: new Date().toISOString(),
          receipt: receiptJson
        });

        console.log(`confirmFinalPayment 测试 #${i + 1} 完成`);
      } catch (error) {
        console.error(`confirmFinalPayment 测试 #${i + 1} 失败:`, error.message);
      }
    }
    console.log(`\n执行 ${TEST_COUNT} 次 confirmFinalPayment 完成，结果已追加到 CSV 文件`);
  });
});