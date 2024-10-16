#!/bin/bash

# 函数：显示使用说明
show_usage() {
    echo "Usage: $0 [localhost|sepolia]"
    echo "If no network is specified, it will prompt for input."
    echo "At any prompt, enter 'q' to quit."
}

# 函数：选择网络
select_network() {
    if [ -z "$1" ]; then
        echo "Select the network to deploy to (or enter 'q' to quit):"
        options=("localhost" "sepolia")
        select network in "${options[@]}"; do
            if [[ "$REPLY" == "q" ]]; then
                echo "Exiting..."
                exit 0
            elif [[ -n "$network" ]]; then
                break
            else
                echo "Invalid selection. Please choose a valid option or enter 'q' to quit."
            fi
        done
    else
        network=$1
    fi

    case $network in
        localhost|sepolia ) ;;
        q ) echo "Exiting..."; exit 0;;
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
