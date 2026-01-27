#!/usr/bin/env python3
"""
Content Creator Workflow 使用示例 (Python 版本)

演示如何使用 Python 调用 Content Creator 的 CLI 命令
"""

import subprocess
import json
import time
import uuid
import shlex


def run_cli_command(command):
    """运行 CLI 命令"""
    try:
        # 使用 shlex 安全地引用参数
        cmd = shlex.split(command)
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.returncode, result.stdout, result.stderr
    except subprocess.CalledProcessError as e:
        return e.returncode, e.stdout, e.stderr
    except Exception as e:
        return -1, "", str(e)


def print_result(result):
    """打印任务结果"""
    print("\n" + "=" * 50)
    print("任务结果")
    print("=" * 50)
    print(result)
    print("=" * 50)


def example1_create_sync_task():
    """
    示例 1: 创建同步任务（立即返回结果）
    """
    print("\n=== 示例 1: 创建同步任务 ===")

    topic = "AI 技术的发展趋势"
    requirements = "写一篇关于 AI 技术发展趋势的文章，重点讨论大语言模型"
    keywords = "AI,人工智能,技术发展"

    command = f"npm run cli:create -- --topic \"{topic}\" --requirements \"{requirements}\" --keywords \"{keywords}\" --min-words 500 --max-words 1000 --mode sync"

    print(f"执行命令: {command}")
    returncode, stdout, stderr = run_cli_command(command)

    if returncode == 0:
        print("✅ 任务创建成功！")
        print_result(stdout)
        return stdout
    else:
        print(f"❌ 任务执行失败 (返回码: {returncode})")
        if stdout:
            print(f"标准输出: {stdout}")
        if stderr:
            print(f"错误输出: {stderr}")


def example2_create_async_task():
    """
    示例 2: 创建异步任务（后台处理）
    """
    print("\n=== 示例 2: 创建异步任务 ===")

    topic = "Web 开发的最佳实践"
    requirements = "介绍现代 Web 开发的最佳实践，包括性能优化和安全考虑"
    keywords = "Web,前端,性能优化"

    command = f"npm run cli:create -- --topic \"{topic}\" --requirements \"{requirements}\" --keywords \"{keywords}\" --min-words 800 --max-words 1200 --mode async"

    print(f"执行命令: {command}")
    returncode, stdout, stderr = run_cli_command(command)

    if returncode == 0:
        print("✅ 任务创建成功！")
        print_result(stdout)
        return stdout
    else:
        print(f"❌ 任务执行失败 (返回码: {returncode})")
        if stdout:
            print(f"标准输出: {stdout}")
        if stderr:
            print(f"错误输出: {stderr}")


def example3_check_task_status(task_id):
    """
    示例 3: 检查任务状态
    """
    print("\n=== 示例 3: 检查任务状态 ===")

    command = f"npm run cli:status -- --id {task_id}"

    print(f"执行命令: {command}")
    returncode, stdout, stderr = run_cli_command(command)

    if returncode == 0:
        print("✅ 任务状态查询成功！")
        print_result(stdout)
        return stdout
    else:
        print(f"❌ 任务状态查询失败 (返回码: {returncode})")
        if stdout:
            print(f"标准输出: {stdout}")
        if stderr:
            print(f"错误输出: {stderr}")


def example4_list_tasks():
    """
    示例 4: 列出所有任务
    """
    print("\n=== 示例 4: 列出所有任务 ===")

    command = "npm run cli:list"

    print(f"执行命令: {command}")
    returncode, stdout, stderr = run_cli_command(command)

    if returncode == 0:
        print("✅ 任务列表查询成功！")
        print_result(stdout)
        return stdout
    else:
        print(f"❌ 任务列表查询失败 (返回码: {returncode})")
        if stdout:
            print(f"标准输出: {stdout}")
        if stderr:
            print(f"错误输出: {stderr}")


def example5_retry_failed_task():
    """
    示例 5: 重试失败的任务
    """
    print("\n=== 示例 5: 重试失败的任务 ===")

    # 首先获取失败的任务（这里简化处理，直接尝试获取任务列表）
    tasks_output = example4_list_tasks()

    if tasks_output:
        print("\n注意: 请手动从任务列表中找到失败的任务ID，然后执行重试")
        print("例如: npm run cli:retry -- --id <task-id>")
    else:
        print("没有找到任务")


def main():
    print("Content Creator Workflow 使用示例 (Python 版本)")
    print("=" * 60)

    # 检查 Node.js 项目是否存在
    import os
    if not os.path.exists("package.json"):
        print("\n❌ 错误: 请在 Content Creator 项目根目录运行此脚本")
        print("当前目录: ", os.getcwd())
        return

    print("\n✅ 项目环境检查通过")

    # 运行示例
    print("\n" + "=" * 60)
    print("开始运行示例")
    print("=" * 60)

    # 示例 1: 创建同步任务（这会执行较长时间）
    sync_result = example1_create_sync_task()

    # 示例 4: 列出所有任务
    example4_list_tasks()

    print("\n" + "=" * 60)
    print("所有示例运行完成！")
    print("=" * 60)

    print("\n💡 其他可用命令:")
    print("  - 查看任务结果: npm run cli:result -- --id <task-id>")
    print("  - 重试失败任务: npm run cli:retry -- --id <task-id>")
    print("  - 取消任务: npm run cli:cancel -- --id <task-id>")
    print("  - 启动监控面板: npm run monitor")


if __name__ == "__main__":
    main()
