/**
 * CLI 格式化工具
 */

import chalk from 'chalk';

/**
 * 获取状态显示文本
 */
export function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'pending': chalk.yellow('⏳ 待处理'),
    'running': chalk.blue('🔄 运行中'),
    'waiting': chalk.yellow('⏸️ 等待中'),
    'completed': chalk.green('✅ 已完成'),
    'failed': chalk.red('❌ 失败'),
    'cancelled': chalk.gray('⏹️ 已取消'),
  };
  return statusMap[status] || status;
}

/**
 * 格式化日期
 */
export function formatDate(date: Date): string {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 格式化时长
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}分${remainingSeconds}秒`;
}

/**
 * 格式化Token数量
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 10000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

/**
 * 格式化成本
 */
export function formatCost(cost: number): string {
  if (cost >= 1) {
    return `¥${cost.toFixed(2)}`;
  }
  return `¥${cost.toFixed(4)}`;
}

/**
 * 打印分隔线
 */
export function printSeparator(char: string = '─', length: number = 40): void {
  console.log(chalk.gray(char.repeat(length)));
}
