#!/bin/bash

# 函数：显示使用说明
show_usage() {
    echo "Usage: $0 [network] [deploy_count]"
    echo "If no network is specified, it will prompt for input."
    echo "If no deploy count is specified, it will deploy once."
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

# 函数：选择部署次数
select_deploy_count() {
    if [ -z "$1" ]; then
        echo "Enter the number of times to deploy (or enter 'q' to quit):"
        read deploy_count
        if [[ "$deploy_count" == "q" ]]; then
            echo "Exiting..."
            exit 0
        elif ! [[ "$deploy_count" =~ ^[1-9][0-9]*$ ]]; then
            echo "Invalid input. Please enter a positive integer."
            exit 1
        fi
    else
        deploy_count=$1
        if ! [[ "$deploy_count" =~ ^[1-9][0-9]*$ ]]; then
            echo "Error: Please enter a positive integer for deploy count"
            exit 1
        fi
    fi

    echo "Will deploy $deploy_count time(s)"
}

# 主脚本开始
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
    exit 0
fi

select_network $1
select_deploy_count $2

# 清理之前的编译结果
echo "Cleaning previous build..."
npx hardhat clean

# 编译合约
echo "Compiling contracts..."
npx hardhat compile

# 循环部署合约
for ((i=1; i<=deploy_count; i++))
do
    echo "Deploying contract $i of $deploy_count to $network..."
    npx hardhat run scripts/deploy.js --network $network
done

echo "Deployment process completed!"
