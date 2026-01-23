/**
 * Vitest 测试环境设置
 *
 * 在测试运行前设置必要的环境变量
 */

import { config as dotenvConfig } from 'dotenv';

// 加载测试环境变量
dotenvConfig();

// 设置测试环境必要的环境变量
process.env.NODE_ENV = 'test';
process.env.DATABASE_TYPE = 'memory';

// PostgreSQL 配置（测试用）
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_USER = 'test';
process.env.POSTGRES_PASSWORD = 'test';
process.env.POSTGRES_DB = 'test_db';

// Redis 配置（优先使用.env中的配置，否则使用本地配置）
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://localhost:6379';
}

// LLM 配置（优先使用.env中的真实配置，用于端到端测试）
if (!process.env.LLM_API_KEY) {
  process.env.LLM_API_KEY = 'test-key';
}
if (!process.env.LLM_BASE_URL) {
  process.env.LLM_BASE_URL = 'https://api.test.com';
}
if (!process.env.LLM_MODEL_NAME) {
  process.env.LLM_MODEL_NAME = 'test-model';
}

// Tavily API（测试用）
process.env.TAVIS_API_KEY = 'test-tavily-key';

// Doubao API（测试用）
process.env.ARK_API_KEY = 'test-ark-key';

// Worker 配置
process.env.WORKER_ID = 'test-worker';
process.env.WORKER_CONCURRENCY = '1';

// 日志配置
process.env.LOG_LEVEL = 'error';
