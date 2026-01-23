/**
 * TaskStep 领域模型
 *
 * 表示任务的一个执行步骤
 */

import { TaskStatus } from './Task.js';

/**
 * 步骤类型
 */
export enum StepType {
  SEARCH = 'search',             // 搜索选题
  ORGANIZE = 'organize',         // 整理资料
  WRITE = 'write',               // 撰写内容
  CHECK_TEXT = 'check_text',     // 文本质量检查
  GEN_IMAGE = 'gen_image',       // 生成配图
  CHECK_IMAGE = 'check_image',   // 图片质量检查
}

/**
 * 步骤输入定义
 */
export interface StepInput {
  [key: string]: any;
}

/**
 * 搜索步骤输入
 */
export interface SearchStepInput extends StepInput {
  topic: string;
  requirements: string;
  targetAudience: string;
  keywords?: string[];
}

/**
 * 整理步骤输入
 */
export interface OrganizeStepInput extends StepInput {
  searchResults: any[];
  requirements: string;
}

/**
 * 撰写步骤输入
 */
export interface WriteStepInput extends StepInput {
  organizedContent: any;
  topic: string;
  targetAudience: string;
  tone?: string;
  maxTokens?: number;
}

/**
 * 文本检查步骤输入
 */
export interface CheckTextStepInput extends StepInput {
  text: string;
  requirements: string;
}

/**
 * 生成图片步骤输入
 */
export interface GenImageStepInput extends StepInput {
  text: string;
  requirements: string;
}

/**
 * 图片检查步骤输入
 */
export interface CheckImageStepInput extends StepInput {
  imageUrl: string;
  requirements: string;
}

/**
 * 步骤输出定义
 */
export interface StepOutput {
  [key: string]: any;
}

/**
 * 搜索步骤输出
 */
export interface SearchStepOutput extends StepOutput {
  results: any[];
  summary: string;
}

/**
 * 整理步骤输出
 */
export interface OrganizeStepOutput extends StepOutput {
  organized: any;
  outline: string;
}

/**
 * 撰写步骤输出
 */
export interface WriteStepOutput extends StepOutput {
  text: string;
  tokenCount: number;
}

/**
 * 检查步骤输出
 */
export interface CheckStepOutput extends StepOutput {
  passed: boolean;
  score?: number;
  reason?: string;
  details?: any;
}

/**
 * 步骤状态
 */
export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * 任务步骤实体
 */
export interface TaskStep {
  // 基础字段
  id: number;                    // 自增 ID
  taskId: string;                // 所属任务 ID
  stepType: StepType;            // 步骤类型
  status: StepStatus;            // 步骤状态
  attempt: number;               // 尝试次数（用于重试）

  // 输入输出
  inputData?: object;            // 输入数据 (JSON)
  outputData?: object;           // 输出数据 (JSON，可选)

  // 兼容旧接口
  input?: StepInput;             // 输入参数（别名）
  output?: StepOutput;           // 输出结果（别名）

  // 错误处理
  errorMessage?: string;         // 错误信息（可选）
  error?: string;                // 错误信息（别名，向后兼容）
  retryCount?: number;           // 重试次数（别名，向后兼容）

  // 时间戳
  createdAt: Date;               // 创建时间
  startedAt?: Date;              // 开始时间
  completedAt?: Date;            // 完成时间
  durationMs?: number;           // 执行耗时（毫秒）

  // 执行信息（向后兼容）
  duration?: number;             // 执行时长（毫秒，别名）
  workerId?: string;             // 执行 Worker ID
}

/**
 * 创建步骤参数
 */
export interface CreateStepParams {
  taskId: string;
  stepType: StepType;
  input: StepInput;
  workerId?: string;
}

/**
 * 更新步骤参数
 */
export interface UpdateStepParams {
  status?: TaskStatus;
  output?: StepOutput;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
}
