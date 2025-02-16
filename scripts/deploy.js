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
  updateCsvFiles(network, executionTime, gasUsed, contractAddress, deploymentReceipt);
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

function updateCsvFiles(network, executionTime, gasUsed, contractAddress, deploymentReceipt) {
  // 确保 results 目录存在
  const resultsDir = path.join(__dirname, '../results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const files = [
    `${network}_performance.csv`,
    `${network}_batch_number.csv`,
    `${network}_challenge_size.csv`
  ];

  files.forEach(file => {
    const csvFilePath = path.join(resultsDir, file);

    // 将整个 deploymentReceipt 转换为 JSON 字符串，并转义逗号和换行符
    const receiptJson = JSON.stringify(deploymentReceipt).replace(/,/g, '\\,').replace(/\n/g, '\\n');

    let csvLine;
    if (file.includes('performance')) {
      csvLine = `deploy,${executionTime},${gasUsed},${contractAddress},${new Date().toISOString()},${receiptJson}\n`;
    } else {
      // 对于 batch_number 和 challenge_size，我们使用不同的字段顺序
      csvLine = `deploy,,${executionTime},${gasUsed},${contractAddress},${new Date().toISOString()},${receiptJson}\n`;
    }

    if (!fs.existsSync(csvFilePath)) {
      if (file.includes('performance')) {
        fs.writeFileSync(csvFilePath, 'method,latency,gas,contract_address,time,receipt\n');
      } else if (file.includes('batch_number')) {
        fs.writeFileSync(csvFilePath, 'method,batchNumber,latency,gas,contractAddress,time,receipt\n');
      } else if (file.includes('challenge_size')) {
        fs.writeFileSync(csvFilePath, 'method,challengeSize,latency,gas,contractAddress,time,receipt\n');
      }
    }

    fs.appendFileSync(csvFilePath, csvLine);
    console.log(`CSV file updated: ${csvFilePath}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
