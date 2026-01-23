#!/usr/bin/env tsx
/**
 * 日志系统测试脚本
 */

import { createLogger, logger } from '../src/infrastructure/logging/logger.js';

console.log('\n=== Testing Logger System ===\n');

// 测试默认日志器
console.log('--- Testing Default Logger ---');
logger.debug('This is a debug message');
logger.info('This is an info message');
logger.warn('This is a warning message');
logger.error('This is an error message');

// 测试带上下文的日志器
console.log('\n--- Testing Context Logger ---');
const dbLogger = createLogger('Database');
dbLogger.info('Connecting to database');
dbLogger.debug('Connection pool created', { poolSize: 25 });

const workerLogger = createLogger('Worker');
workerLogger.info('Starting worker', { workerId: 'worker-1' });

// 测试错误日志
console.log('\n--- Testing Error Logger ---');
try {
  throw new Error('Test error');
} catch (error) {
  if (error instanceof Error) {
    logger.error('An error occurred', error, { taskId: 'task-123' });
  }
}

// 测试子日志器
console.log('\n--- Testing Child Logger ---');
const serviceLogger = createLogger('Service');
const taskLogger = serviceLogger.child('Task');
taskLogger.info('Task started', { taskId: '123' });

console.log('\n=== Logger Test Completed ===\n');
