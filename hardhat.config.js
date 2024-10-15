require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  gasReporter: {
    enabled: false,
    currency: 'USD',
    gasPrice: 21,
    noColors: true,
    // outputFile: 'gas-report.txt',
    showTimeSpent: true,
    // onlyCalledMethods: false,  // 这将包括未被调用的方法
    // coinmarketcap: 'YOUR-COINMARKETCAP-API-KEY',
    // outputFile: 'gas-report.txt'
  },
  networks: {
    hardhat: {
      gas: "auto",
      // gasLimit: 100000000,  // 增加到 100 million
      gasPrice: "auto",
      // blockGasLimit: 100000000,  // 增加到 100 million
    },
    localhost: {
      url: "http://localhost:8545",
      gas: "auto",
      gasPrice: "auto",
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [process.env.PRIVATE_KEY]
      // url: "https://ethereum-sepolia-rpc.publicnode.com",
      // chainId: 11155111
    },
    shardora: {
      url: "http://localhost:8545", // 需要修改成 Shardora 节点
      accounts: [process.env.PRIVATE_KEY] // 使用本地 Shardora 账户
    }
  },
  plugins: ["solidity-coverage"],
  mocha: {
    timeout: 86400000 // 24 小时（以毫秒为单位）
  }
};
