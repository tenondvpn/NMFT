#!/bin/bash

# 函数：显示使用说明
show_usage() {
    echo "Usage: $0 [localhost|sepolia]"
    echo "If no network is specified, it will prompt for input."
}

# 函数：选择网络
select_network() {
    if [ -z "$1" ]; then
        echo "Select the network to deploy to:"
        select network in "localhost" "sepolia"; do
            case $network in
                localhost|sepolia ) break;;
                * ) echo "Invalid selection. Please choose 1 for localhost or 2 for sepolia.";;
            esac
        done
    else
        network=$1
    fi

    case $network in
        localhost|sepolia ) ;;
        * ) echo "Invalid network. Use 'localhost' or 'sepolia'."; exit 1;;
    esac

    echo "Deploying to $network"
}

# 主脚本开始
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
    exit 0
fi

select_network $1

# 清理之前的编译结果
echo "Cleaning previous build..."
npx hardhat clean

# 编译合约
echo "Compiling contracts..."
npx hardhat compile

# 部署合约
echo "Deploying contracts to $network..."
npx hardhat run scripts/deploy.js --network $network

echo "Deployment process completed!"