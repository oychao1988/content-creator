/**
 * Task 领域模型
 *
 * 表示一个内容创作任务
 */

/**
 * 任务状态
 */
export enum TaskStatus {
  PENDING = 'pending',           // 待处理
  RUNNING = 'running',           // 运行中
  WAITING = 'waiting',           // 等待中（等待人工审核）
  COMPLETED = 'completed',       // 已完成
  FAILED = 'failed',             // 失败
  CANCELLED = 'cancelled',       // 已取消
}

/**
 * 任务类型
 */
export enum TaskType {
  ARTICLE = 'article',           // 文章
  SOCIAL_MEDIA = 'social_media', // 社交媒体内容
  MARKETING = 'marketing',       // 营销文案
  OTHER = 'other',               // 其他
}

/**
 * 任务优先级
 */
export enum TaskPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4,
}

/**
 * 执行模式
 */
export enum ExecutionMode {
  SYNC = 'sync',                 // 同步执行
  ASYNC = 'async',               // 异步执行
}

/**
 * 任务实体
 */
export interface Task {
  // 基础字段
  id: string;                    // 任务 ID (UUID) - 别名为 taskId
  taskId: string;                // 任务 ID (UUID) - 与 id 相同
  type?: TaskType;               // 任务类型（可选，向后兼容）
  status: TaskStatus;            // 任务状态
  priority: TaskPriority;        // 优先级

  // 执行模式和需求
  mode: ExecutionMode;           // 执行模式（同步/异步）
  topic: string;                 // 选题/主题
  requirements: string;          // 需求描述
  targetAudience: string;        // 目标受众
  keywords?: string[];           // 关键词
  tone?: string;                 // 语气风格

  // 硬性约束
  hardConstraints?: {            // 硬性指标
    minWords?: number;           // 最小字数
    maxWords?: number;           // 最大字数
    keywords?: string[];         // 必须包含的关键词
  };

  // 元数据
  userId?: string;               // 用户 ID（外键，可选）
  estimatedTokens?: number;      // 预估 Token 数量
  maxTokens?: number;            // 最大 Token 限制

  // 状态字段
  currentStep?: string;          // 当前步骤
  workerId?: string;             // Worker ID（多 Worker 抢占）
  assignedWorkerId?: string;     // 分配的 Worker ID（别名，向后兼容）

  // 重试计数（持久化）
  textRetryCount: number;        // 文本质检重试次数
  imageRetryCount: number;       // 配图质检重试次数

  // 乐观锁（并发控制）
  version: number;               // 版本号

  // 时间戳
  createdAt: Date;               // 创建时间
  updatedAt: Date;               // 更新时间
  startedAt?: Date;              // 开始时间
  completedAt?: Date;            // 完成时间
  deletedAt?: Date;              // 软删除时间

  // 抢占时间（向后兼容）
  claimedAt?: Date;              // 抢占时间

  // 错误信息
  errorMessage?: string;         // 错误信息

  // State 快照（崩溃恢复）
  stateSnapshot?: object;        // LangGraph State 序列化

  // 幂等性
  idempotencyKey?: string;       // 幂等键（防止重复提交）

  // 结果引用（一对多）
  steps?: TaskStep[];            // 任务步骤（可选，用于关联查询）
  results?: Result[];            // 生成结果（可选，用于关联查询）
}

/**
 * 任务创建参数
 */
export interface CreateTaskParams {
  mode: ExecutionMode;           // 执行模式
  topic: string;
  requirements: string;
  targetAudience: string;
  type?: TaskType;               // 任务类型（可选）
  keywords?: string[];
  tone?: string;
  priority?: TaskPriority;
  maxTokens?: number;
  userId?: string;               // 用户 ID（可选）
  hardConstraints?: {            // 硬性约束
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };
  idempotencyKey?: string;       // 幂等键（可选）
}

/**
 * 任务更新参数
 */
export interface UpdateTaskParams {
  status?: TaskStatus;
  currentStep?: string;
  workerId?: string;
  assignedWorkerId?: string;     // 别名，向后兼容
  claimedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedTokens?: number;
  errorMessage?: string;
  stateSnapshot?: object;
  version: number;               // 必需：用于乐观锁
}

import type { TaskStep } from './TaskStep.js';
import type { Result } from './Result.js';

/**
 * 任务状态转换
 */
export const TaskStatusTransitions: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.PENDING]: [TaskStatus.RUNNING, TaskStatus.CANCELLED],
  [TaskStatus.RUNNING]: [TaskStatus.WAITING, TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED],
  [TaskStatus.WAITING]: [TaskStatus.RUNNING, TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED],
  [TaskStatus.COMPLETED]: [], // 终态，不可转换
  [TaskStatus.FAILED]: [],    // 终态，不可转换
  [TaskStatus.CANCELLED]: [], // 终态，不可转换
};

/**
 * 检查状态转换是否合法
 */
export function isValidStatusTransition(
  currentStatus: TaskStatus,
  newStatus: TaskStatus
): boolean {
  const allowedTransitions = TaskStatusTransitions[currentStatus];
  return allowedTransitions.includes(newStatus);
}

