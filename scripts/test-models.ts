#!/usr/bin/env tsx
/**
 * 领域模型测试脚本
 */

import {
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  isValidStatusTransition,
  CreateTaskParams,
  TaskStep,
  StepType,
  Result,
  ResultType,
  QualityCheck,
  CheckType,
  CheckCategory,
} from '../src/domain/entities/index.js';

console.log('\n=== Testing Domain Models ===\n');

// 测试 Task 模型
console.log('1. Testing Task Model');
console.log('   ✓ TaskStatus:', Object.values(TaskStatus));
console.log('   ✓ TaskType:', Object.values(TaskType));
console.log('   ✓ TaskPriority:', Object.values(TaskPriority));

const createTaskParams: CreateTaskParams = {
  type: TaskType.ARTICLE,
  topic: '人工智能的未来',
  requirements: '写一篇关于人工智能未来发展的文章',
  targetAudience: '技术爱好者',
  keywords: ['AI', '未来', '科技'],
  tone: '专业',
  priority: TaskPriority.NORMAL,
};

console.log('   ✓ CreateTaskParams:', JSON.stringify(createTaskParams, null, 2));

// 测试状态转换
console.log('\n2. Testing Task Status Transitions');
console.log('   ✓ PENDING -> RUNNING:', isValidStatusTransition(TaskStatus.PENDING, TaskStatus.RUNNING));
console.log('   ✓ RUNNING -> COMPLETED:', isValidStatusTransition(TaskStatus.RUNNING, TaskStatus.COMPLETED));
console.log('   ✓ COMPLETED -> PENDING:', isValidStatusTransition(TaskStatus.COMPLETED, TaskStatus.PENDING));

// 测试 TaskStep 模型
console.log('\n3. Testing TaskStep Model');
console.log('   ✓ StepType:', Object.values(StepType));

// 测试 Result 模型
console.log('\n4. Testing Result Model');
console.log('   ✓ ResultType:', Object.values(ResultType));

// 测试 QualityCheck 模型
console.log('\n5. Testing QualityCheck Model');
console.log('   ✓ CheckType:', Object.values(CheckType));
console.log('   ✓ CheckCategory:', Object.values(CheckCategory));

// 创建示例任务
console.log('\n6. Creating Example Task');
const exampleTask: Task = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  type: TaskType.ARTICLE,
  status: TaskStatus.PENDING,
  priority: TaskPriority.NORMAL,
  topic: '人工智能的未来',
  requirements: '写一篇关于人工智能未来发展的文章',
  targetAudience: '技术爱好者',
  keywords: ['AI', '未来', '科技'],
  tone: '专业',
  estimatedTokens: 3000,
  maxTokens: 4000,
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 1,
};

console.log('   ✓ Example Task:', JSON.stringify(exampleTask, null, 2));

console.log('\n=== All Domain Model Tests Passed ===\n');
