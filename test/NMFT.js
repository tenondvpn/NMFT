const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

describe("NMFT", function () {
  let NMFT, nmft, owner, addr1, addr2, addr3;

  // 定义共用的测试参数
  const batchPrice = ethers.parseEther("0.1");
  const tokenURI = "https://example.com/token/1";
  const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("merkle root"));
  const description = "Test NFT";

  const reqBatchPrice = ethers.parseEther("0.1");
  const NFT_TRANSFER_FEE = ethers.parseEther("0.05");
  const challengeSize = parseInt(process.env.CHALLENGE_SIZE || "10");
  const newCompletedBatches = parseInt(process.env.NEW_COMPLETED_BATCHES || "2");
  const batchNumber = parseInt(process.env.BATCH_NUMBER || "10");

  let originalVectors, originalTree, originalRoot, originalMerkleProofs, originalMerkleRoots;
  let challengerVectors, challengerTree, challengerRoot, challengerMerkleProofs, challengerMerkleRoots;

  // 初始化原始向量和 Merkle 树
  originalVectors = Array(challengeSize).fill().map(() => ethers.toBigInt(ethers.randomBytes(32)));
  originalTree = new MerkleTree(originalVectors.map(v => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v]))), keccak256, { sort: true });
  originalRoot = originalTree.getHexRoot();
  originalMerkleProofs = originalVectors.map(v => originalTree.getHexProof(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v]))));
  originalMerkleRoots = Array(challengeSize).fill(originalRoot);

  // 初始化挑战者的向量和 Merkle 树
  challengerVectors = originalVectors; // 保证相似度超过阈值
  challengerTree = new MerkleTree(challengerVectors.map(v => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v]))), keccak256, { sort: true });
  challengerRoot = challengerTree.getHexRoot();
  challengerMerkleProofs = challengerVectors.map(v => challengerTree.getHexProof(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v]))));
  challengerMerkleRoots = Array(challengeSize).fill(challengerRoot);

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    NMFT = await ethers.getContractFactory("NMFT");
    nmft = await NMFT.deploy(owner.address, "0x6e0c627900b24bd432fe7b2f239ed3c1e1c1d21aed740e80d1e805fc1dfe9a2a");
    await nmft.waitForDeployment();
  });

  // 辅助函数：铸造NFT
  async function mintNFT(to, tokenId) {
    const tx = await nmft.connect(owner).mintDataNFT(
      to.address,
      tokenURI,
      batchPrice,
      batchNumber,
      merkleRoot,
      description
    );
    const receipt = await tx.wait();
    return receipt.events?.find(e => e.event === "DataNFTMinted")?.args?.tokenId || tokenId;
  }

  // 辅助函数：创建数据购买请求
  async function createDataPurchaseRequest(buyer, tokenId, reqBatchNumber = 5, tradeType = 0, ownerDepositAmount = ethers.parseEther("0.01")) {
    const nftTransferFee = tradeType === 1 ? NFT_TRANSFER_FEE : 0;
    const tx = await nmft.connect(buyer).requestDataPurchase(
      tokenId,
      reqBatchPrice,
      reqBatchNumber,
      tradeType,
      challengeSize,
      nftTransferFee,
      ownerDepositAmount
    );
    return tx;
  }

  // 辅助函数：计算买家存款金额
  async function calculateBuyerDepositAmount(tokenId, buyer) {
    const request = await nmft.getRequest(tokenId, buyer);
    if (!request || !request.reqBatchPrice || !request.reqBatchNumber) {
      throw new Error("Invalid request data");
    }
    const depositAmount = request.reqBatchPrice * BigInt(request.reqBatchNumber);
    return request.tradeType === 1n 
      ? depositAmount + NFT_TRANSFER_FEE 
      : depositAmount;
  }

  describe("mintDataNFT", function () {
    it("应该能成功铸造多个新的数据NFT", async function () {
        const mintCount = 5;
      
        for (let i = 0; i < mintCount; i++) {
          const tokenId = await mintNFT(addr1, i + 1);
          await expect(nmft.ownerOf(tokenId)).to.eventually.equal(addr1.address);
      
          const dataInfo = await nmft.getDataInfo(tokenId);
          expect(dataInfo.batchPrice).to.equal(batchPrice);
          expect(dataInfo.batchNumber).to.equal(batchNumber);
          expect(dataInfo.latestMerkleRoot).to.equal(merkleRoot);
        }
      });

    it("非所有者应该能够铸造NFT", async function () {
      const tokenId = await mintNFT(addr2, 1);

      expect(await nmft.ownerOf(tokenId)).to.equal(addr2.address);

      const dataInfo = await nmft.getDataInfo(tokenId);
      expect(dataInfo.batchPrice).to.equal(batchPrice);
      expect(dataInfo.batchNumber).to.equal(batchNumber);
      expect(dataInfo.latestMerkleRoot).to.equal(merkleRoot);

      expect(await nmft.tokenURI(tokenId)).to.equal(tokenURI);
    });
  });

  describe("getDataInfo", function () {
    it("应该能正确返回NFT的数据信息", async function () {
      const tokenId = await mintNFT(addr1, 1);

      const dataInfo = await nmft.getDataInfo(tokenId);
      expect(dataInfo.batchPrice).to.equal(batchPrice);
      expect(dataInfo.batchNumber).to.equal(batchNumber);
      expect(dataInfo.latestMerkleRoot).to.equal(merkleRoot);
    });

    it("对不存在的tokenId应该返回默认值", async function () {
      const nonExistentTokenId = 999;
      const dataInfo = await nmft.getDataInfo(nonExistentTokenId);
      
      expect(dataInfo.batchPrice).to.equal(0);
      expect(dataInfo.batchNumber).to.equal(0);
      expect(dataInfo.latestMerkleRoot).to.equal('0x0000000000000000000000000000000000000000000000000000000000000000');
    });
  });

  describe("transferNFT", function () {
    it("所有者应该能成功转移NFT", async function () {
      const tokenId = await mintNFT(addr1, 1);

      await expect(nmft.connect(addr1).transferNFT(addr1.address, addr2.address, tokenId))
        .to.emit(nmft, "Transfer")
        .withArgs(addr1.address, addr2.address, tokenId);

      expect(await nmft.ownerOf(tokenId)).to.equal(addr2.address);
    });

    it("授权地址应该能转移NFT", async function () {
      const tokenId = await mintNFT(addr1, 1);

      await nmft.connect(addr1).approve(addr2.address, tokenId);

      await expect(nmft.connect(addr2).transferNFT(addr1.address, addr3.address, tokenId))
        .to.emit(nmft, "Transfer")
        .withArgs(addr1.address, addr3.address, tokenId);

      expect(await nmft.ownerOf(tokenId)).to.equal(addr3.address);
    });

    it("非授权地址不应该能转移NFT", async function () {
      const tokenId = await mintNFT(addr1, 1);

      await expect(nmft.connect(addr2).transferNFT(addr1.address, addr3.address, tokenId))
        .to.be.revertedWith("Not authorized to transfer");
    });
  });

  describe("updateMerkleRoot", function () {
    it("所有者应该能成功更新Merkle根", async function () {
      const tokenId = await mintNFT(addr1, 1);

      const newMerkleRoot = ethers.keccak256(ethers.toUtf8Bytes("new merkle root"));
      await expect(nmft.connect(addr1).updateMerkleRoot(tokenId, newMerkleRoot))
        .to.emit(nmft, "MerkleRootUpdated")
        .withArgs(tokenId, newMerkleRoot);

      const dataInfo = await nmft.getDataInfo(tokenId);
      expect(dataInfo.latestMerkleRoot).to.equal(newMerkleRoot);
    });

    it("非所有者不应该能更新Merkle根", async function () {
      const tokenId = await mintNFT(addr1, 1);

      const newMerkleRoot = ethers.keccak256(ethers.toUtf8Bytes("new merkle root"));
      await expect(nmft.connect(addr2).updateMerkleRoot(tokenId, newMerkleRoot))
        .to.be.revertedWith("Only the token owner can perform this action");
    });

    it("不应该允许使用已存在的Merkle根", async function () {
      const tokenId = await mintNFT(addr1, 1);

      await expect(nmft.connect(addr1).updateMerkleRoot(tokenId, merkleRoot))
        .to.be.revertedWith("Merkle root already exists");

      const newMerkleRoot = ethers.keccak256(ethers.toUtf8Bytes("new merkle root"));
      await expect(nmft.connect(addr1).updateMerkleRoot(tokenId, newMerkleRoot))
        .to.not.be.reverted;

      await expect(nmft.connect(addr1).updateMerkleRoot(tokenId, newMerkleRoot))
        .to.be.revertedWith("Merkle root already exists");
    });
  });

  describe("getMerkleRootTimestamp", function () {
    it("应该能正确返回Merkle根的时间戳", async function () {
      const tokenId = await mintNFT(addr1, 1);
      const txResponse = await nmft.connect(addr1).mintDataNFT(
        addr1.address,
        tokenURI,
        batchPrice,
        batchNumber,
        merkleRoot,
        description
      );
      const txReceipt = await txResponse.wait();
      const blockTimestamp = (await ethers.provider.getBlock(txReceipt.blockNumber)).timestamp;

      const timestamp = await nmft.getMerkleRootTimestamp(tokenId, merkleRoot);
      expect(timestamp).to.be.closeTo(blockTimestamp, 1); // 允许1秒的误差
    });

    it("对不存在的Merkle根应该返回0", async function () {
      const tokenId = await mintNFT(addr1, 1);

      const nonExistentMerkleRoot = ethers.keccak256(ethers.toUtf8Bytes("non-existent merkle root"));
      const timestamp = await nmft.getMerkleRootTimestamp(tokenId, nonExistentMerkleRoot);
      expect(timestamp).to.equal(0);
    });
  });

  describe("requestDataPurchase", function () {
    it("应该能成功创建数据购买请求", async function () {
      const tokenId = await mintNFT(addr1, 1);

      await expect(createDataPurchaseRequest(addr2, tokenId))
        .to.emit(nmft, "RequestMade")
        .withArgs(
          tokenId,
          addr2.address,
          reqBatchPrice,
          5,
          0,
          "DataOnly",
          challengeSize,
          0
        );
    });

    it("不应该允许为不存在的tokenId创建请求", async function () {
      const nonExistentTokenId = 999;
      await expect(nmft.connect(addr2).requestDataPurchase(
        nonExistentTokenId,
        ethers.parseEther("0.1"),
        5,
        0,
        10,
        0,
        ethers.parseEther("0.01")
      )).to.be.revertedWith("Token does not exist");
    });

    it("不应该允许创建重复的请求", async function () {
      const tokenId = await mintNFT(addr1, 1);

      await nmft.connect(addr2).requestDataPurchase(
        tokenId,
        ethers.parseEther("0.1"),
        5,
        0,
        10,
        0,
        ethers.parseEther("0.01")
      );

      await expect(nmft.connect(addr2).requestDataPurchase(
        tokenId,
        ethers.parseEther("0.1"),
        5,
        0,
        10,
        0,
        ethers.parseEther("0.01")
      )).to.be.revertedWith("Request already made");
    });

    it("应该正确处理DataAndNFT类型的请求", async function () {
      const tokenId = await mintNFT(addr1, 1);

      await expect(createDataPurchaseRequest(addr2, tokenId, 5, 1))
        .to.emit(nmft, "RequestMade")
        .withArgs(
          tokenId,
          addr2.address,
          reqBatchPrice,
          5,
          1,
          "DataAndNFT",
          challengeSize,
          ethers.parseEther("0.05")
        );
    });

    it("不应该允许请求的批次数量超过可用批次", async function () {
      const tokenId = await mintNFT(addr1, 1);

      await expect(nmft.connect(addr2).requestDataPurchase(
        tokenId,
        ethers.parseEther("0.1"),
        batchNumber + 1,
        0,
        10,
        0,
        ethers.parseEther("0.01")
      )).to.be.revertedWith("Requested batch number exceeds available batches");
    });
  });

  describe("confirmRequest", function () {
    it("数据所有者应该能成功确认请求", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);

      await expect(nmft.connect(addr1).confirmRequest(tokenId, addr2.address))
        .to.emit(nmft, "RequestConfirmed")
        .withArgs(tokenId, addr2.address, addr1.address);
    });

    it("非数据所有者不应该能确认请求", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);

      await expect(nmft.connect(addr3).confirmRequest(tokenId, addr2.address))
        .to.be.revertedWith("Only the token owner can perform this action");
    });

    it("不应该能确认不存在的请求", async function () {
      const tokenId = await mintNFT(addr1, 1);

      await expect(nmft.connect(addr1).confirmRequest(tokenId, addr1.address))
        .to.be.revertedWith("No valid request found");
    });

    it("不应该能重复确认请求", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);

      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);

      await expect(nmft.connect(addr1).confirmRequest(tokenId, addr2.address))
        .to.be.revertedWith("Request already confirmed");
    });
  });

  describe("buyerDeposit", function () {
    it("买家应该能成功质押正确的金额", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);

      const depositAmount = ethers.parseEther("0.5"); // 5 batches * 0.1 ETH
      await expect(nmft.connect(addr2).buyerDeposit(tokenId, { value: depositAmount }))
        .to.emit(nmft, "BuyerDepositMade")
        .withArgs(tokenId, addr2.address, depositAmount);
    });

    it("买家不应该能质押错误的金额", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);

      const incorrectAmount = ethers.parseEther("0.4");
      await expect(nmft.connect(addr2).buyerDeposit(tokenId, { value: incorrectAmount }))
        .to.be.revertedWith("Incorrect buyer deposit amount");
    });

    it("买家不应该能在请求未确认时质押", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);

      const depositAmount = ethers.parseEther("0.5");
      await expect(nmft.connect(addr2).buyerDeposit(tokenId, { value: depositAmount }))
        .to.be.revertedWith("Request not confirmed yet");
    });

    it("买家不应该能重复质押", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);

      const depositAmount = ethers.parseEther("0.5");
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: depositAmount });

      await expect(nmft.connect(addr2).buyerDeposit(tokenId, { value: depositAmount }))
        .to.be.revertedWith("Buyer already deposited");
    });
  });

  describe("ownerDeposit", function () {
    it("所有者应该能成功质押正确的金额", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });

      const ownerDepositAmount = ethers.parseEther("0.01");
      await expect(nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ownerDepositAmount }))
        .to.emit(nmft, "OwnerDepositMade")
        .withArgs(tokenId, addr1.address, ownerDepositAmount);
    });

    it("非所有者不应该能质押", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });

      const ownerDepositAmount = ethers.parseEther("0.01");
      await expect(nmft.connect(addr3).ownerDeposit(tokenId, addr2.address, { value: ownerDepositAmount }))
        .to.be.revertedWith("Only the token owner can perform this action");
    });

    it("所有者不应该能在买家未质押时质押", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);

      const ownerDepositAmount = ethers.parseEther("0.01");
      await expect(nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ownerDepositAmount }))
        .to.be.revertedWith("Buyer has not deposited yet");
    });
  });

  describe("initiateChallenge", function () {
    it("买家应该能成功发起挑战", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });

      await expect(nmft.connect(addr2).initiateChallenge(tokenId))
        .to.emit(nmft, "ChallengeInitiated")
        .withArgs(tokenId, addr2.address, addr1.address);
    });

    it("买家不应该能在所有者未质押时发起挑战", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });

      await expect(nmft.connect(addr2).initiateChallenge(tokenId))
        .to.be.revertedWith("Owner has not deposited yet");
    });

    it("买家不应该能重复发起挑战", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });

      await nmft.connect(addr2).initiateChallenge(tokenId);

      await expect(nmft.connect(addr2).initiateChallenge(tokenId))
        .to.be.revertedWith("Challenge already initiated");
    });
  });

  describe("buyerVerifyChallenge", function () {
    it("买家应该能成功验证挑战", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr2).initiateChallenge(tokenId);

      await expect(nmft.connect(addr2).buyerVerifyChallenge(tokenId))
        .to.emit(nmft, "DataValidated")
        .withArgs(tokenId, addr2.address);
    });

    it("买家不应该能在挑战未发起时验证挑战", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });

      await expect(nmft.connect(addr2).buyerVerifyChallenge(tokenId))
        .to.be.revertedWith("Challenge not initiated yet");
    });
  });

  describe("ownerResToChallenge", function () {
    it("所有者应该能成功响应挑战", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr2).initiateChallenge(tokenId);

      // 创建challengeSize个uint256 向量
      const vectors = Array(challengeSize).fill().map(() => ethers.toBigInt(ethers.randomBytes(32)));
      // 创建 Merkle tree
      const leaves = vectors.map(v => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v])));
      const tree = new MerkleTree(leaves, keccak256, { sort: true });
      const root = tree.getHexRoot();

      const merkleProofs = vectors.map(v => {
      const leaf = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v]));
      const proof = tree.getHexProof(leaf);
        return proof;
      });

      const merkleRoots = Array(challengeSize).fill(root);

      // 更新合约中的 Merkle root
      await nmft.connect(addr1).updateMerkleRoot(tokenId, root);

      // 执行 ownerResToChallenge
      await expect(nmft.connect(addr1).ownerResToChallenge(tokenId, addr2.address, vectors, merkleProofs, merkleRoots))
        .to.emit(nmft, "VectorsVerified")
        .withArgs(tokenId, addr2.address);
    });
  });

  describe("otherOwnersResToChallenge", function () {
    it("其他NFT所有者应该能成功响应挑战", async function () {
      const tokenId1 = await mintNFT(addr1, 1);
      const tokenId2 = await mintNFT(addr2, 2);
      await createDataPurchaseRequest(addr3, tokenId1);
      await nmft.connect(addr1).confirmRequest(tokenId1, addr3.address);
      await nmft.connect(addr3).buyerDeposit(tokenId1, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId1, addr3.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr3).initiateChallenge(tokenId1);

      await nmft.connect(addr2).updateMerkleRoot(tokenId2, challengerRoot);
      await ethers.provider.send("evm_mine"); // 挖一个新块，增加点时间
      await nmft.connect(addr1).updateMerkleRoot(tokenId1, originalRoot);
      await nmft.connect(addr1).ownerResToChallenge(tokenId1, addr3.address, originalVectors, originalMerkleProofs, originalMerkleRoots);
  
      // 模拟买家验证
      await nmft.connect(addr3).buyerVerifyChallenge(tokenId1);
  
      await expect(nmft.connect(addr2).otherOwnersResToChallenge(
        tokenId1,
        addr3.address,
        tokenId2,
        originalVectors,
        originalMerkleRoots,
        challengerVectors,
        challengerMerkleProofs,
        challengerMerkleRoots
      )).to.emit(nmft, "ChallengeResponseReceived")
        .withArgs(tokenId1, addr2.address, tokenId2, addr2.address);
    });
  
    it("不应该能在挑战未发起时响应", async function () {
      const tokenId1 = await mintNFT(addr1, 1);
      const tokenId2 = await mintNFT(addr2, 2);
      await createDataPurchaseRequest(addr3, tokenId1);
      await nmft.connect(addr1).confirmRequest(tokenId1, addr3.address);
      await nmft.connect(addr3).buyerDeposit(tokenId1, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId1, addr3.address, { value: ethers.parseEther("0.01") });
  
      await expect(nmft.connect(addr2).otherOwnersResToChallenge(
        tokenId1,
        addr3.address,
        tokenId2,
        originalVectors,
        originalMerkleRoots,
        challengerVectors,
        challengerMerkleProofs,
        challengerMerkleRoots
      )).to.be.revertedWith("Vectors not verified yet");
    });
  
    it("不应该能在挑战响应窗口关闭后响应", async function () {
      const tokenId1 = await mintNFT(addr1, 1);
      const tokenId2 = await mintNFT(addr2, 2);
      await createDataPurchaseRequest(addr3, tokenId1);
      await nmft.connect(addr1).confirmRequest(tokenId1, addr3.address);
      await nmft.connect(addr3).buyerDeposit(tokenId1, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId1, addr3.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr3).initiateChallenge(tokenId1);
  
      await nmft.connect(addr1).updateMerkleRoot(tokenId1, originalRoot);
      await nmft.connect(addr1).ownerResToChallenge(tokenId1, addr3.address, originalVectors, originalMerkleProofs, originalMerkleRoots);
  
      // 模拟买家验证
      await nmft.connect(addr3).buyerVerifyChallenge(tokenId1);
  
      // 模拟挑战响应窗口关闭
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 增加24小时
      await ethers.provider.send("evm_mine"); // 挖一个新块
  
      // 尝试响应挑战，这应该触发自动解决
      await expect(nmft.connect(addr2).otherOwnersResToChallenge(
        tokenId1,
        addr3.address,
        tokenId2,
        originalVectors,
        originalMerkleRoots,
        challengerVectors,
        challengerMerkleProofs,
        challengerMerkleRoots
      )).to.emit(nmft, "ChallengeResolved")
        .withArgs(tokenId1, addr3.address, addr1.address, tokenId1);
    });
  });

  describe("buyerConfirmChallengeEnd", function () {
    it("买家应该能成功确认挑战结束", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr2).initiateChallenge(tokenId);
  
      // 创建有效的向量
      const vectors = Array(challengeSize).fill().map(() => ethers.toBigInt(ethers.randomBytes(32)));
  
      // 创建 Merkle tree
      const leaves = vectors.map(v => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v])));
      const tree = new MerkleTree(leaves, keccak256, { sort: true });
      const root = tree.getHexRoot();
  
      const merkleProofs = vectors.map(v => tree.getHexProof(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v]))));
      const merkleRoots = Array(challengeSize).fill(root);
  
      // 更新合约中的 Merkle root
      await nmft.connect(addr1).updateMerkleRoot(tokenId, root);
      await ethers.provider.send("evm_mine"); // 挖一个新块
      await nmft.connect(addr1).ownerResToChallenge(tokenId, addr2.address, vectors, merkleProofs, merkleRoots);
  
      // 模拟时间经过
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 增加24小时
      await ethers.provider.send("evm_mine"); // 挖一个新块
  
      await expect(nmft.connect(addr2).buyerConfirmChallengeEnd(tokenId))
        .to.emit(nmft, "ChallengeResolved")
        .withArgs(tokenId, addr2.address, addr1.address, tokenId);
    });
  
    it("买家不应该能在未超过时间窗口时确认挑战结束", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr2).initiateChallenge(tokenId);
  
      // 创建有效的向量
      const vectors = Array(challengeSize).fill().map(() => ethers.toBigInt(ethers.randomBytes(32)));
      const leaves = vectors.map(v => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v])));
      const tree = new MerkleTree(leaves, keccak256, { sort: true });
      const root = tree.getHexRoot();
      const merkleProofs = vectors.map(v => tree.getHexProof(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [v]))));
      const merkleRoots = Array(challengeSize).fill(root);
  
      await nmft.connect(addr1).updateMerkleRoot(tokenId, root);
      await ethers.provider.send("evm_mine"); // 挖一个新块
      await nmft.connect(addr1).ownerResToChallenge(tokenId, addr2.address, vectors, merkleProofs, merkleRoots);
  
      // 不增加时间，直接尝试确认挑战结束
      await expect(nmft.connect(addr2).buyerConfirmChallengeEnd(tokenId))
        .to.be.revertedWith("Challenge response window not closed yet");
    });
  });

  describe("setHashchainTip", function () {
    it("买家应该能成功设置哈希链顶部", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr2).initiateChallenge(tokenId);
      await nmft.connect(addr2).buyerVerifyChallenge(tokenId);
  
      // 模拟挑战结束
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 增加24小时
      await ethers.provider.send("evm_mine"); // 挖一个新块
      await nmft.connect(addr2).buyerConfirmChallengeEnd(tokenId);
  
      const hashchainTip = ethers.keccak256(ethers.toUtf8Bytes("hashchain tip"));
      await expect(nmft.connect(addr2).setHashchainTip(tokenId, hashchainTip))
        .to.emit(nmft, "HashchainTipSet")
        .withArgs(tokenId, addr2.address, addr1.address, hashchainTip, 5);
    });
  
    it("不应该允许设置零值作为哈希链顶部", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr2).initiateChallenge(tokenId);
      await nmft.connect(addr2).buyerVerifyChallenge(tokenId);
  
      // 模拟挑战结束
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await nmft.connect(addr2).buyerConfirmChallengeEnd(tokenId);
  
      await expect(nmft.connect(addr2).setHashchainTip(tokenId, ethers.ZeroHash))
        .to.be.revertedWith("Invalid tip: cannot be zero");
    });
  
    it("不应该允许重复设置哈希链顶部", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr2).initiateChallenge(tokenId);
      await nmft.connect(addr2).buyerVerifyChallenge(tokenId);
  
      // 模拟挑战结束
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await nmft.connect(addr2).buyerConfirmChallengeEnd(tokenId);
  
      const hashchainTip = ethers.keccak256(ethers.toUtf8Bytes("hashchain tip"));
      await nmft.connect(addr2).setHashchainTip(tokenId, hashchainTip);
  
      await expect(nmft.connect(addr2).setHashchainTip(tokenId, hashchainTip))
        .to.be.revertedWith("Hashchain tip already set");
    });
  });
  
  describe("confirmFinalPayment", function () {
    it("挑战胜利者应该能成功确认最终支付", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr2).initiateChallenge(tokenId);
      await nmft.connect(addr2).buyerVerifyChallenge(tokenId);
  
      // 模拟挑战结束
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await nmft.connect(addr2).buyerConfirmChallengeEnd(tokenId);

      let finalHash = ethers.keccak256(ethers.toUtf8Bytes("final hash"));
      let hashchainTip = finalHash;

      // 模拟哈希链
      for (let i = 0; i < newCompletedBatches; i++) {
        hashchainTip = ethers.keccak256(hashchainTip);
      }
  
      await nmft.connect(addr2).setHashchainTip(tokenId, hashchainTip);

      await expect(nmft.connect(addr1).confirmFinalPayment(tokenId, addr2.address, finalHash, newCompletedBatches))
        .to.emit(nmft, "FinalPaymentConfirmed")
        .withArgs(tokenId, addr2.address, addr1.address, newCompletedBatches);
    });
  
    it("不应该允许非挑战胜利者确认最终支付", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr2).initiateChallenge(tokenId);
      await nmft.connect(addr2).buyerVerifyChallenge(tokenId);
  
      // 模拟挑战结束
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await nmft.connect(addr2).buyerConfirmChallengeEnd(tokenId);
  
      const hashchainTip = ethers.keccak256(ethers.toUtf8Bytes("hashchain tip"));
      await nmft.connect(addr2).setHashchainTip(tokenId, hashchainTip);
  
      const finalHash = ethers.keccak256(ethers.toUtf8Bytes("final hash"));
  
      await expect(nmft.connect(addr3).confirmFinalPayment(tokenId, addr2.address, finalHash, newCompletedBatches))
        .to.be.revertedWith("Only the challenge winner can confirm final payment");
    });
  
    it("应该正确处理最后一批次的支付和NFT转移", async function () {
      const tokenId1 = await mintNFT(addr1, 1);
      const tokenId2 = await mintNFT(addr2, 2);
      const newCompletedBatches = batchNumber; // 完成所有批次
      await createDataPurchaseRequest(addr3, tokenId1, batchNumber, 1, ethers.parseEther("0.01")); // TradeType.DataAndNFT
      await nmft.connect(addr1).confirmRequest(tokenId1, addr3.address);
      const buyerDepositAmount = await calculateBuyerDepositAmount(tokenId1, addr3.address);
      await nmft.connect(addr3).buyerDeposit(tokenId1, { value: buyerDepositAmount });
      await nmft.connect(addr1).ownerDeposit(tokenId1, addr3.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr3).initiateChallenge(tokenId1);

      await nmft.connect(addr2).updateMerkleRoot(tokenId2, challengerRoot);
      await ethers.provider.send("evm_mine"); // 挖一个新块，增加点时间
      await nmft.connect(addr1).updateMerkleRoot(tokenId1, originalRoot);
      await nmft.connect(addr1).ownerResToChallenge(tokenId1, addr3.address, originalVectors, originalMerkleProofs, originalMerkleRoots);
  
      // 模拟买家验证
      await nmft.connect(addr3).buyerVerifyChallenge(tokenId1);
  
      // 尝试响应挑战，这应该触发自动解决
      await nmft.connect(addr2).otherOwnersResToChallenge(
        tokenId1,
        addr3.address,
        tokenId2,
        originalVectors,
        originalMerkleRoots,
        challengerVectors,
        challengerMerkleProofs,
        challengerMerkleRoots
      )
  
      // 模拟挑战结束
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await nmft.connect(addr3).buyerConfirmChallengeEnd(tokenId1);
  
      let finalHash = ethers.keccak256(ethers.toUtf8Bytes("final hash"));
      let hashchainTip = finalHash;

      // 假設addr2挑战成功
      await createDataPurchaseRequest(addr3, tokenId2, batchNumber, 1, ethers.parseEther("0.01")); // TradeType.DataAndNFT
      await nmft.connect(addr2).confirmRequest(tokenId2, addr3.address);
      await nmft.connect(addr3).buyerDeposit(tokenId2, { value: buyerDepositAmount });
      await nmft.connect(addr2).ownerDeposit(tokenId2, addr3.address, { value: ethers.parseEther("0.01") });

      // 模拟哈希链
      for (let i = 0; i < newCompletedBatches; i++) {
        hashchainTip = ethers.keccak256(hashchainTip);
      }

      await nmft.connect(addr3).setHashchainTip(tokenId2, hashchainTip);
      const request = await nmft.getRequest(tokenId2, addr3.address);
      expect(request.tradeType).to.equal(1); // TradeType.DataAndNFT
      expect(request.reqBatchNumber).to.equal(batchNumber);
      const dataInfo = await nmft.getDataInfo(tokenId2);
      expect(dataInfo.batchNumber).to.equal(batchNumber);
      
      const initialOwner = await nmft.ownerOf(tokenId2);
      expect(initialOwner).to.equal(addr2.address);

      await expect(nmft.connect(addr2).confirmFinalPayment(tokenId2, addr3.address, finalHash, newCompletedBatches))
        .to.emit(nmft, "FinalPaymentConfirmed")
        .withArgs(tokenId2, addr3.address, addr2.address, newCompletedBatches)
        .to.emit(nmft, "TransactionCleanedUp")
        .withArgs(tokenId2, addr3.address, addr2.address)
        .to.emit(nmft, "Transfer")
        .withArgs(addr2.address, addr3.address, tokenId2);

      const finalOwner = await nmft.ownerOf(tokenId2);
      expect(finalOwner).to.equal(addr3.address);

      // 验证请求已被清理
      const cleanedRequest = await nmft.getRequest(tokenId2, addr3.address);
      expect(cleanedRequest.confirmed).to.be.false;
    });
  });
  
  describe("ownerCleanupTransaction", function () {
    it("所有者应该能在超时后清理交易", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
  
      // 模拟交易超时
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]); // 增加2天
      await ethers.provider.send("evm_mine");
  
      await expect(nmft.connect(addr1).ownerCleanupTransaction(tokenId, addr2.address))
        .to.emit(nmft, "TransactionCleanedUp")
        .withArgs(tokenId, addr2.address, addr1.address);
    });
  
    it("非所有者不应该能清理交易", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
  
      // 模拟交易超时
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
  
      await expect(nmft.connect(addr3).ownerCleanupTransaction(tokenId, addr2.address))
        .to.be.revertedWith("Only the token owner can perform this action");
    });
  
    it("不应该允许在交易未超时时清理", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
  
      await expect(nmft.connect(addr1).ownerCleanupTransaction(tokenId, addr2.address))
        .to.be.revertedWith("Transaction has not timed out yet");
    });
  });
  
});