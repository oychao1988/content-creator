/**
 * 任务验证器
 *
 * 使用 Zod 进行请求参数验证
 */

import { z } from 'zod';
// 直接定义枚举以避免导入问题
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  WAITING = 'waiting',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum ExecutionMode {
  SYNC = 'sync',
  ASYNC = 'async',
}

export enum TaskType {
  ARTICLE = 'article',
  SOCIAL_MEDIA = 'social_media',
  MARKETING = 'marketing',
  OTHER = 'other',
}

/**
 * 创建任务请求验证
 */
export const createTaskSchema = z.object({
  type: z.nativeEnum(TaskType).optional(),
  mode: z.nativeEnum(ExecutionMode).default(ExecutionMode.SYNC),
  topic: z.string().min(1, 'Topic is required').max(500),
  requirements: z.string().min(1, 'Requirements are required').max(2000),
  targetAudience: z.string().min(1, 'Target audience is required').max(500),
  keywords: z.array(z.string()).optional(),
  tone: z.string().max(100).optional(),
  imageSize: z.string().optional(),
  priority: z.number().int().min(1).max(4).optional(),
  maxTokens: z.number().int().positive().optional(),
  userId: z.string().optional(),
  hardConstraints: z.object({
    minWords: z.number().int().positive().optional(),
    maxWords: z.number().int().positive().optional(),
    keywords: z.array(z.string()).optional(),
  }).optional(),
  idempotencyKey: z.string().optional(),
  // Webhook 回调参数
  callbackUrl: z.string().url().optional(),
  callbackEnabled: z.boolean().optional(),
  callbackEvents: z.array(z.string()).optional(),
});

/**
 * 更新任务请求验证
 */
export const updateTaskSchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  currentStep: z.string().optional(),
});

/**
 * 列出任务查询验证
 */
export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.nativeEnum(TaskStatus).optional(),
  type: z.nativeEnum(TaskType).optional(),
  userId: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * 任务 ID 参数验证
 */
export const taskIdParamSchema = z.object({
  id: z.string().uuid('Invalid task ID format'),
});

/**
 * 工作流类型参数验证
 */
export const workflowTypeParamSchema = z.object({
  type: z.string().min(1),
});

/**
 * 类型导出
 */
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
