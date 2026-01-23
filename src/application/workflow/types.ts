/**
 * 执行器类型定义
 *
 * 定义同步执行器的接口和类型
 */

import type { WorkflowState } from '../../domain/workflow/State.js';

/**
 * 执行器配置
 */
export interface ExecutorConfig {
  // 数据库类型
  databaseType: 'postgres' | 'sqlite' | 'memory';

  // 超时配置
  timeout?: number;           // 单步超时(毫秒)
  totalTimeout?: number;      // 总超时(毫秒)

  // 重试配置
  maxRetries?: number;        // 最大重试次数

  // 日志配置
  enableLogging?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  finalState: WorkflowState;
  duration: number;           // 执行时长(毫秒)
  error?: string;
  metadata: {
    stepsCompleted: string[];
    tokensUsed: number;
    cost: number;
  };
}

/**
 * 执行进度信息
 */
export interface ExecutionProgress {
  taskId: string;
  currentStep: string;
  percentage: number;
  message: string;
}

/**
 * 执行进度回调函数
 */
export type ProgressCallback = (progress: ExecutionProgress) => void;
