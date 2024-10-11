const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const NMFT = await hre.ethers.getContractFactory("NMFT");

  const nmft = await NMFT.deploy(deployer.address, process.env.PROJECTION_MATRIX_HASH);

  const deploymentReceipt = await nmft.deploymentTransaction().wait();

  console.log("NMFT deployed to:", await nmft.getAddress());

  // 获取 gas 使用量
  const gasUsed = deploymentReceipt.gasUsed;
  console.log("Gas used:", gasUsed.toString());

  // 获取 gas 价格
  const gasPrice = deploymentReceipt.gasPrice;
  console.log("Gas price:", hre.ethers.formatUnits(gasPrice, "gwei"), "gwei");

  // 计算总 gas 费用（以 ETH 为单位）
  const gasCost = gasUsed * gasPrice;
  console.log("Total gas cost:", hre.ethers.formatEther(gasCost), "ETH");

  // 假设的 ETH 价格
  const ethPrice = 2000; // 假设 1 ETH = 2000 USD
  console.log("Assumed ETH price:", ethPrice, "USD");

  // 计算并打印估计的 USD 费用
  const gasCostUSD = hre.ethers.formatEther(gasCost) * ethPrice;
  console.log("Estimated total gas cost:", gasCostUSD.toFixed(2), "USD");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });