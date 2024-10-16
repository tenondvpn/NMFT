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
        echo "Select the network to run tests on (or enter 'q' to quit):"
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

    echo "Running tests on $network"
}

# 函数：运行测试
run_test() {
    local test_file=$1
    echo "Running test: $test_file"
    npx hardhat test $test_file --network $network
}

# 函数：选择测试
select_test() {
    while true; do
        echo "Select the test to run (or enter 'q' to quit):"
        options=("performance.js" "batch_number.js" "challenge_size.js" "Run all tests")
        select test in "${options[@]}"; do
            if [[ "$REPLY" == "q" ]]; then
                echo "Exiting..."
                exit 0
            elif [[ -n "$test" ]]; then
                break
            else
                echo "Invalid selection. Please choose a valid option or enter 'q' to quit."
            fi
        done

        case $test in
            "performance.js" )
                run_test "test/performance.js"
                ;;
            "batch_number.js" )
                run_test "test/batch_number.js"
                ;;
            "challenge_size.js" )
                run_test "test/challenge_size.js"
                ;;
            "Run all tests" )
                run_test "test/performance.js"
                run_test "test/batch_number.js"
                run_test "test/challenge_size.js"
                ;;
        esac

        echo "Test execution completed!"
        echo "Do you want to run more tests? (y/n)"
        read -r answer
        if [[ "$answer" != "y" ]]; then
            break
        fi
    done
}

# 主脚本开始
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
    exit 0
fi

select_network $1
select_test

echo "All tests completed!"
