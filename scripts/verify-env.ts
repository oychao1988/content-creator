#!/usr/bin/env tsx
/**
 * 环境验证脚本
 *
 * 用于验证所有必需的环境变量和外部服务连接
 */

import { config } from 'dotenv';
import { Pool } from 'pg';
import Redis from 'ioredis';
import axios from 'axios';

// 加载环境变量
config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, colors.green);
}

function logError(message: string) {
  log(`✗ ${message}`, colors.red);
}

function logWarning(message: string) {
  log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, colors.cyan);
}

async function checkEnvVariables(): Promise<boolean> {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  log('检查环境变量', colors.blue);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  const requiredVars = [
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'REDIS_URL',
    'LLM_API_KEY',
    'LLM_BASE_URL',
    'TAVILY_API_KEY',
    'ARK_API_KEY',
  ];

  let allPresent = true;

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      logError(`环境变量 ${varName} 未设置`);
      allPresent = false;
    } else {
      logSuccess(`环境变量 ${varName} 已设置`);
    }
  }

  return allPresent;
}

async function checkPostgreSQL(): Promise<boolean> {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  log('检查 PostgreSQL 连接', colors.blue);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  try {
    const pool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      max: 1,
      connectionTimeoutMillis: 5000,
    });

    logInfo(`连接到 ${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`);

    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    await client.release();
    await pool.end();

    const version = result.rows[0].version;
    logSuccess('PostgreSQL 连接成功');
    logInfo(`版本: ${version.split(',')[0]}`);

    return true;
  } catch (error) {
    logError(`PostgreSQL 连接失败: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  log('检查 Redis 连接', colors.blue);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      logError('REDIS_URL 环境变量未设置');
      return false;
    }

    logInfo(`连接到 Redis (${redisUrl.replace(/:[^:@]+@/, ':****@')})`);

    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      connectTimeout: 5000,
    });

    const pong = await redis.ping();
    await redis.quit();

    if (pong === 'PONG') {
      logSuccess('Redis 连接成功');
      const info = await new Redis(redisUrl).info('server');
      const versionMatch = info.match(/redis_version:([\d.]+)/);
      if (versionMatch) {
        logInfo(`版本: ${versionMatch[1]}`);
      }
      return true;
    }

    logError('Redis ping 失败');
    return false;
  } catch (error) {
    logError(`Redis 连接失败: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function checkDeepSeekAPI(): Promise<boolean> {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  log('检查 DeepSeek API', colors.blue);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  try {
    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL;

    if (!apiKey || !baseUrl) {
      logError('LLM_API_KEY 或 LLM_BASE_URL 环境变量未设置');
      return false;
    }

    logInfo(`测试 API: ${baseUrl}`);

    const response = await axios.post(
      `${baseUrl}/v1/chat/completions`,
      {
        model: process.env.LLM_MODEL_NAME || 'deepseek-chat',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (response.status === 200) {
      logSuccess('DeepSeek API 连接成功');
      return true;
    }

    logError(`DeepSeek API 返回状态码: ${response.status}`);
    return false;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        logError(`DeepSeek API 错误: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else {
        logError(`DeepSeek API 请求失败: ${error.message}`);
      }
    } else {
      logError(`DeepSeek API 检查失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    return false;
  }
}

async function checkTavilyAPI(): Promise<boolean> {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  log('检查 Tavily API (MCP Search)', colors.blue);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  try {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      logError('TAVILY_API_KEY 环境变量未设置');
      return false;
    }

    logInfo('测试 Tavily API...');

    const response = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: apiKey,
        query: 'test',
        max_results: 1,
      },
      {
        timeout: 10000,
      }
    );

    if (response.status === 200) {
      logSuccess('Tavily API 连接成功');
      return true;
    }

    logError(`Tavily API 返回状态码: ${response.status}`);
    return false;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        logError(`Tavily API 错误: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else {
        logError(`Tavily API 请求失败: ${error.message}`);
      }
    } else {
      logError(`Tavily API 检查失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    return false;
  }
}

async function checkDoubaoAPI(): Promise<boolean> {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  log('检查 Doubao API (字节跳动)', colors.blue);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  try {
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      logError('ARK_API_KEY 环境变量未设置');
      return false;
    }

    logInfo('Doubao API 验证成功 (仅检查密钥存在)');
    logSuccess('Doubao API 配置完成');
    return true;
  } catch (error) {
    logError(`Doubao API 检查失败: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════╗', colors.cyan);
  log('║   Content Creator 环境验证工具      ║', colors.cyan);
  log('╚════════════════════════════════════════╝', colors.cyan);

  const results = {
    envVars: await checkEnvVariables(),
    postgres: await checkPostgreSQL(),
    redis: await checkRedis(),
    deepseek: await checkDeepSeekAPI(),
    tavily: await checkTavilyAPI(),
    doubao: await checkDoubaoAPI(),
  };

  // 输出总结
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  log('验证总结', colors.blue);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  const allPassed = Object.values(results).every((result) => result === true);

  if (allPassed) {
    logSuccess('所有检查通过!环境配置正确。');
    process.exit(0);
  } else {
    logError('部分检查失败,请检查配置。');
    log('\n失败项目:', colors.red);
    if (!results.envVars) logError('  - 环境变量');
    if (!results.postgres) logError('  - PostgreSQL');
    if (!results.redis) logError('  - Redis');
    if (!results.deepseek) logError('  - DeepSeek API');
    if (!results.tavily) logError('  - Tavily API');
    if (!results.doubao) logError('  - Doubao API');
    process.exit(1);
  }
}

main().catch((error) => {
  logError(`脚本执行失败: ${error.message}`);
  process.exit(1);
});
