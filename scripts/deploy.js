const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const NMFT = await hre.ethers.getContractFactory("NMFT");

  const projectionMatrixHash = process.env.PROJECTION_MATRIX_HASH;
  if (!projectionMatrixHash) {
    throw new Error("PROJECTION_MATRIX_HASH not set in .env file");
  }

  const startTime = Date.now();
  const nmft = await NMFT.deploy(deployer.address, projectionMatrixHash);
  const deploymentReceipt = await nmft.deploymentTransaction().wait();
  const endTime = Date.now();

  const executionTime = endTime - startTime;
  const contractAddress = await nmft.getAddress();
  const gasUsed = deploymentReceipt.gasUsed;

  console.log("NMFT deployed to:", contractAddress);
  console.log("Gas used:", gasUsed.toString());

  // 获取当前网络
  const network = hre.network.name;

  // 更新 .env 文件
  updateEnvFile(network, contractAddress);

  // 更新 CSV 文件
  updateCsvFile(network, executionTime, gasUsed, contractAddress, deploymentReceipt);
}

function updateEnvFile(network, address) {
  const envPath = path.join(__dirname, '../.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  const envLines = envContent.split('\n');
  const variableName = `${network.toUpperCase()}_NMFT_CONTRACT_ADDRESS`;
  
  let updated = false;
  for (let i = 0; i < envLines.length; i++) {
    if (envLines[i].startsWith(`${variableName}=`)) {
      envLines[i] = `${variableName}=${address}`;
      updated = true;
      break;
    }
  }

  if (!updated) {
    envLines.push(`${variableName}=${address}`);
  }

  fs.writeFileSync(envPath, envLines.join('\n'));
  console.log(`.env file updated with ${variableName}=${address}`);
}

function updateCsvFile(network, executionTime, gasUsed, contractAddress, deploymentReceipt) {
  const csvFilePath = path.join(__dirname, `../results/${network}_performance.csv`);
  
  // 将整个 deploymentReceipt 转换为 JSON 字符串，并转义逗号和换行符
  const receiptJson = JSON.stringify(deploymentReceipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');
  
  const csvLine = `deploy,${executionTime},${gasUsed},${contractAddress},${new Date().toISOString()},${receiptJson}\n`;

  if (!fs.existsSync(csvFilePath)) {
    fs.writeFileSync(csvFilePath, 'method,latency,gas,contract_address,time,receipt\n');
  }

  fs.appendFileSync(csvFilePath, csvLine);
  console.log(`CSV file updated: ${csvFilePath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });