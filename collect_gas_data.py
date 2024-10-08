import argparse
import subprocess
import os
import csv
import re
import pandas as pd
import seaborn as sns
from typing import List, Dict
import matplotlib.pyplot as plt

MIN_SIZE = 100
MAX_SIZE = 1000
STEP = 100

def run_test(size: int, grep: str = None) -> str:
    """运行测试并返回输出"""
    env = os.environ.copy()
    # env['CHALLENGE_SIZE'] = str(size)
    env['BATCH_NUMBER'] = str(size)
    subprocess.run(['npx', 'hardhat', 'clean'], check=True)
    command = ['npx', 'hardhat', 'test']
    if grep:
        command.extend(['--grep', grep])
    result = subprocess.run(command, capture_output=True, text=True, env=env)
    return result.stdout

def parse_output(output: str) -> List[Dict[str, any]]:
    """解析输出并提取方法和gas使用量"""
    results = []
    for line in output.split('\n'):
        pattern = r'\|\s+NMFT\s+·\s+(\w+)\s+·(?:[^·]+·){2}\s*(\d+)\s+·'
        matches = re.findall(pattern, line)
        for match in matches:
            method, avg_gas = match
            results.append({
                'method': method,
                'avg_gas': int(avg_gas)
            })
    return results

def collect_data(grep: str = None) -> List[Dict[str, any]]:
    """收集所有大小的数据"""
    all_results = []
    for size in range(MIN_SIZE, MAX_SIZE + 1, STEP):
        print(f"Running test with challengeSize = {size}")
        output = run_test(size, grep)
        results = parse_output(output)
        print(f"Parsed results for size {size}: {results}")
        for result in results:
            result['size'] = size
        all_results.extend(results)
    return all_results

def save_to_csv(data: List[Dict[str, any]], filename: str):
    """将数据保存到CSV文件"""
    with open(filename, 'w', newline='') as csvfile:
        fieldnames = ['method', 'size', 'avg_gas']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for row in data:
            writer.writerow(row)

def plot_data(data: List[Dict[str, any]]):
    """绘制数据图表"""
    methods = set(row['method'] for row in data)
    for method in methods:
        method_data = [row for row in data if row['method'] == method]
        sizes = [row['size'] for row in method_data]
        gas_usage = [row['avg_gas'] for row in method_data]
        plt.plot(sizes, gas_usage, marker='o', label=method)
    
    plt.title('Gas Usage by Batch Number for Each Method')
    plt.xlabel('Batch Number')
    plt.ylabel('Average Gas Used')
    plt.legend()
    plt.grid(True)
    plt.savefig('gas_usage_plot.png')
    plt.close()

def plot_data_from_csv(csv_filename: str = 'gas_results.csv'):
    """从CSV文件读取数据并使用Seaborn绘制图表"""
    # 读取CSV文件到DataFrame
    df = pd.read_csv(csv_filename)
    
    # 确保'size'和'avg_gas'列是数值类型
    df['size'] = pd.to_numeric(df['size'])
    df['avg_gas'] = pd.to_numeric(df['avg_gas'])
    
    # 设置Seaborn样式
    sns.set_style("whitegrid")
    sns.set_palette("deep")
    
    # 创建图形和轴对象
    plt.figure(figsize=(12, 6))
    
    # 使用Seaborn的lineplot函数
    sns.lineplot(data=df, x='size', y='avg_gas', hue='method', marker='o')
    
    plt.title('Gas Usage by Batch Number for Each Method', fontsize=16)
    plt.xlabel('Batch Number', fontsize=12)
    plt.ylabel('Average Gas Used', fontsize=12)
    plt.legend(title='Method', title_fontsize='12', fontsize='10')
    
    # 调整布局
    plt.tight_layout()
    
    # 保存图片
    plt.savefig('gas_usage_plot.png', dpi=300)
    plt.close()

def main():
    parser = argparse.ArgumentParser(description='Collect gas data from Hardhat tests.')
    parser.add_argument('--grep', type=str, help='Grep pattern for selecting specific tests')
    args = parser.parse_args()

    data = collect_data(args.grep)
    save_to_csv(data, 'gas_results.csv')
    plot_data(data)
    print("Data collection and visualization complete.")

if __name__ == "__main__":
    main()