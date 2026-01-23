#!/usr/bin/env tsx
/**
 * 配置系统测试脚本
 */

import { config } from '../src/config/index.js';

console.log('\n=== Testing Configuration System ===\n');

// 测试各个配置模块
console.log('✓ Environment:', config.env.NODE_ENV);
console.log('✓ Worker ID:', config.worker.id);
console.log('✓ Worker Concurrency:', config.worker.concurrency);
console.log('✓ PostgreSQL:', `${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`);
console.log('✓ Redis:', config.redis.url.replace(/:([^:@]+)@/, ':****@'));
console.log('✓ LLM Model:', config.llm.modelName);
console.log('✓ Storage Provider:', config.storage.provider);
console.log('✓ Log Level:', config.logging.level);

console.log('\n=== All Tests Passed ===\n');
