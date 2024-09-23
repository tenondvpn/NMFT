const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NMFT", function () {
  let NMFT;
  let nmft;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    // 获取合约工厂
    NMFT = await ethers.getContractFactory("NMFT");
    
    // 获取测试账户
    [owner, addr1, addr2] = await ethers.getSigners();
    
    // 部署合约
    nmft = await NMFT.deploy(owner.address, 12345);
    await nmft.deployed();
  });

  describe("mintDataNFT", function () {
    it("应该能成功铸造新的数据NFT", async function () {
      const tokenURI = "https://example.com/token/1";
      const batchPrice = ethers.utils.parseEther("1");
      const batchNumber = 10;
      const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("merkle root"));
      const description = "Test NFT";

      // 铸造NFT
      await expect(nmft.connect(owner).mintDataNFT(
        addr1.address,
        tokenURI,
        batchPrice,
        batchNumber,
        merkleRoot,
        description
      ))
        .to.emit(nmft, "DataNFTMinted")
        .withArgs(1, description, batchPrice);

      // 验证 NFT 所有权
      expect(await nmft.ownerOf(1)).to.equal(addr1.address);

      // 验证 NFT 数据
      const dataInfo = await nmft.getDataInfo(1);
      expect(dataInfo.batchPrice).to.equal(batchPrice);
      expect(dataInfo.batchNumber).to.equal(batchNumber);
      expect(dataInfo.latestMerkleRoot).to.equal(merkleRoot);
    });

    it("非所有者不应该能铸造NFT", async function () {
      const tokenURI = "https://example.com/token/1";
      const batchPrice = ethers.utils.parseEther("1");
      const batchNumber = 10;
      const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("merkle root"));
      const description = "Test NFT";

      // 尝试用非所有者账户铸造NFT
      await expect(nmft.connect(addr1).mintDataNFT(
        addr2.address,
        tokenURI,
        batchPrice,
        batchNumber,
        merkleRoot,
        description
      )).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});