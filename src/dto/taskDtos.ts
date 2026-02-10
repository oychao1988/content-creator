/**
 * 任务 DTO (Data Transfer Objects)
 *
 * 定义 API 响应的数据格式
 */

import type { Task } from '../domain/entities/Task.js';
export { TaskStatus, ExecutionMode } from '../domain/entities/Task.js';

/**
 * 任务响应 DTO
 */
export interface TaskResponseDto {
  id: string;
  type?: string;
  status: TaskStatus;
  mode: ExecutionMode;
  priority: number;
  topic: string;
  requirements: string;
  targetAudience: string;
  keywords?: string[];
  tone?: string;
  hardConstraints?: {
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };
  userId?: string;
  currentStep?: string;
  workerId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * 任务状态响应 DTO
 */
export interface TaskStatusResponseDto {
  taskId: string;
  status: TaskStatus;
  currentStep?: string;
  progress: number;
  estimatedTimeRemaining?: number;
}

/**
 * 任务结果响应 DTO
 */
export interface TaskResultResponseDto {
  taskId: string;
  status: 'completed' | 'failed';
  content?: string;
  htmlContent?: string;
  images?: Array<{
    url: string;
    prompt: string;
    width: number;
    height: number;
  }>;
  qualityScore?: number;
  wordCount?: number;
  metrics?: {
    tokensUsed: number;
    cost: number;
    duration: number;
    stepsCompleted: string[];
  };
  error?: string;
}

/**
 * 任务列表响应 DTO
 */
export interface TaskListResponseDto {
  tasks: TaskResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 工作流元数据响应 DTO
 */
export interface WorkflowMetadataResponseDto {
  type: string;
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
}

/**
 * 工作流列表响应 DTO
 */
export interface WorkflowListResponseDto {
  workflows: WorkflowMetadataResponseDto[];
}

/**
 * API 错误响应 DTO
 */
export interface ErrorResponseDto {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
  timestamp: string;
}

/**
 * API 成功响应 DTO
 */
export interface SuccessResponseDto<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * 健康检查响应 DTO
 */
export interface HealthResponseDto {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: 'ok' | 'down';
    redis?: 'ok' | 'down' | 'disabled';
    queue?: 'ok' | 'down' | 'disabled';
  };
}

/**
 * 统计信息响应 DTO
 */
export interface StatsResponseDto {
  tasks: {
    total: number;
    byStatus: Record<TaskStatus, number>;
    byType: Record<string, number>;
  };
  queue?: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
}

/**
 * 实体到 DTO 转换函数
 */
export function taskToDto(task: Task): TaskResponseDto {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    mode: task.mode,
    priority: task.priority,
    topic: task.topic,
    requirements: task.requirements,
    targetAudience: task.targetAudience,
    keywords: task.keywords,
    tone: task.tone,
    hardConstraints: task.hardConstraints,
    userId: task.userId,
    currentStep: task.currentStep,
    workerId: task.workerId,
    errorMessage: task.errorMessage,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    startedAt: task.startedAt?.toISOString(),
    completedAt: task.completedAt?.toISOString(),
  };
}

/**
 * 任务列表转换函数
 */
export function taskListToDto(
  tasks: Task[],
  page: number,
  limit: number,
  total: number
): TaskListResponseDto {
  return {
    tasks: tasks.map(taskToDto),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
