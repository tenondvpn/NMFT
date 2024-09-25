const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

describe("NMFT", function () {
  let NMFT, nmft, owner, addr1, addr2, addr3;

  // 定义共用的测试参数
  const batchPrice = ethers.parseEther("0.1");
  const tokenURI = "https://example.com/token/1";
  const batchNumber = 10;
  const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("merkle root"));
  const description = "Test NFT";

  const reqBatchPrice = ethers.parseEther("0.1");
  const challengeSize = 2;

  const COMPRESSED_VECTOR_LENGTH = 256;
  const MAX_VECTOR_LENGTH = 20;

  function generateRandomMatrix() {
    return Array(COMPRESSED_VECTOR_LENGTH).fill().map(() => 
      Array(MAX_VECTOR_LENGTH).fill().map(() => Math.random() < 0.5 ? -1 : 1)
    );
  }

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    NMFT = await ethers.getContractFactory("NMFT");
    nmft = await NMFT.deploy(owner.address);
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
    const nftTransferFee = tradeType === 1 ? ethers.parseEther("0.05") : 0;
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

  describe("setProjectionMatrix", function () {
    it("所有者应该能成功设置投影矩阵", async function () {
      const projectionMatrix = generateRandomMatrix();

      await nmft.connect(owner).setProjectionMatrix(projectionMatrix);
      expect(await nmft.isMatrixInitialized()).to.be.true;

      // 验证投影矩阵是否正确设置
      for (let i = 0; i < COMPRESSED_VECTOR_LENGTH; i++) {
        for (let j = 0; j < MAX_VECTOR_LENGTH; j++) {
          const storedValue = await nmft.projectionMatrix(i, j);
          expect(storedValue).to.equal(projectionMatrix[i][j]);
        }
      }
    });

    it("非所有者不应该能设置投影矩阵", async function () {
      const projectionMatrix = generateRandomMatrix();

      await expect(nmft.connect(addr1).setProjectionMatrix(projectionMatrix))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("应该拒绝无效的投影矩阵尺寸", async function () {
      const invalidMatrix = Array(COMPRESSED_VECTOR_LENGTH - 1).fill().map(() => 
        Array(MAX_VECTOR_LENGTH).fill().map(() => Math.random() < 0.5 ? -1 : 1)
      );

      await expect(nmft.connect(owner).setProjectionMatrix(invalidMatrix))
        .to.be.revertedWith("Invalid column length");
    });

    it("不应该允许重复初始化矩阵", async function () {
      const projectionMatrix = generateRandomMatrix();

      // 第一次设置矩阵
      await nmft.connect(owner).setProjectionMatrix(projectionMatrix);

      // 尝试再次设置矩阵
      await expect(nmft.connect(owner).setProjectionMatrix(projectionMatrix))
        .to.be.revertedWith("Matrix already initialized");
    });
  });

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
        .to.be.revertedWith("Incorrect deposit amount");
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
  
      // 创建有效的 int8 向量
      const vectors = [
        [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
        [8, 7, 6, 5, 4, 3, 2, 1, 0, -1]
      ];

      // 创建 Merkle tree
      const leaves = vectors.map(v => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['int8[]'], [v])));
      const tree = new MerkleTree(leaves, keccak256, { sort: true });
      const root = tree.getHexRoot();

      console.log("Merkle Root:", root);

      const merkleProofs = vectors.map(v => {
        const leaf = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['int8[]'], [v]));
        const proof = tree.getHexProof(leaf);
        console.log("Vector:", v);
        console.log("Leaf:", leaf);
        console.log("Proof:", proof);
        return proof;
      });

      const merkleRoots = [root, root];

      // 更新合约中的 Merkle root
      await nmft.connect(addr1).updateMerkleRoot(tokenId, root);

      // 执行 ownerResToChallenge 并捕获事件
      const tx = await nmft.connect(addr1).ownerResToChallenge(tokenId, addr2.address, vectors, merkleProofs, merkleRoots);
      const receipt = await tx.wait();

      // 打印合约中的 Merkle 调试信息
      const merkleDebugEvent = receipt.events.find(e => e.event === 'MerkleDebug');
      if (merkleDebugEvent) {
        console.log("Contract Merkle Root:", merkleDebugEvent.args.merkleRoot);
        console.log("Contract Leaf:", merkleDebugEvent.args.leaf);
        console.log("Contract Merkle Proof:", merkleDebugEvent.args.merkleProof);
      } else {
        console.log("MerkleDebug event not found");
      }

      // 执行 ownerResToChallenge
    //   await expect(nmft.connect(addr1).ownerResToChallenge(tokenId, addr2.address, vectors, merkleProofs, merkleRoots))
    //     .to.emit(nmft, "VectorsVerified")
    //     .withArgs(tokenId, addr2.address);
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

      // 创建有效的 int8 向量
      const vectors = [
        [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
        [8, 7, 6, 5, 4, 3, 2, 1, 0, -1]
      ];

      // 创建 Merkle tree
      const leaves = vectors.map(v => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['int8[]'], [v])));
      const tree = new MerkleTree(leaves, keccak256, { sort: true });
      const root = tree.getHexRoot();

      const merkleProofs = vectors.map(v => tree.getHexProof(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['int8[]'], [v]))));
      const merkleRoots = [root, root];

      // 更新合约中的 Merkle root
      await nmft.connect(addr1).updateMerkleRoot(tokenId, root);
      await nmft.connect(addr1).ownerResToChallenge(tokenId, addr2.address, vectors, merkleProofs, merkleRoots);

      await expect(nmft.connect(addr2).buyerConfirmChallengeEnd(tokenId))
        .to.emit(nmft, "ChallengeEnded")
        .withArgs(tokenId, addr2.address);
    });

    it("买家不应该能在未超过时间窗口时确认挑战结束", async function () {
      const tokenId = await mintNFT(addr1, 1);
      await createDataPurchaseRequest(addr2, tokenId);
      await nmft.connect(addr1).confirmRequest(tokenId, addr2.address);
      await nmft.connect(addr2).buyerDeposit(tokenId, { value: ethers.parseEther("0.5") });
      await nmft.connect(addr1).ownerDeposit(tokenId, addr2.address, { value: ethers.parseEther("0.01") });
      await nmft.connect(addr2).initiateChallenge(tokenId);

      await expect(nmft.connect(addr2).buyerConfirmChallengeEnd(tokenId))
        .to.be.revertedWith("Challenge response window not closed yet");
    });
  });

});