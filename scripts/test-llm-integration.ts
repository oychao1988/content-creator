#!/usr/bin/env tsx
/**
 * LLM 服务快速测试脚本
 *
 * 测试 API 和 CLI 模式的流式/非流式输出
 *
 * 运行方式：
 * - 测试 API 模式：npm run test-llm
 * - 测试 CLI 模式：LLM_SERVICE_TYPE=cli npm run test-llm
 * - 启用详细输出：npm run test-llm -- --verbose
 */

import { LLMServiceFactory } from '../src/services/llm/LLMServiceFactory.js';
import { config } from '../src/config/index.js';

const VERBOSE = process.argv.includes('--verbose');

async function testAPIMode() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 测试 API 模式 (EnhancedLLMService)');
  console.log('='.repeat(60));

  const apiService = LLMServiceFactory.createAPI();

  // 非流式测试
  console.log('\n📝 测试 1: 非流式模式');
  console.log('-'.repeat(40));
  const streamStart1 = Date.now();
  const nonStreamResult = await apiService.chat({
    messages: [
      { role: 'user', content: '用一句话解释什么是 RESTful API' },
    ],
    stream: false,
  });
  const streamDuration1 = Date.now() - streamStart1;

  console.log('✅ 响应长度:', nonStreamResult.content.length, '字符');
  console.log('✅ Token 使用:', nonStreamResult.usage.totalTokens);
  console.log('✅ 成本: $' + nonStreamResult.cost.toFixed(6));
  console.log('✅ 耗时:', (streamDuration1 / 1000).toFixed(2) + 's');

  if (VERBOSE) {
    console.log('\n📄 响应内容:');
    console.log(nonStreamResult.content.substring(0, 200) + '...');
  }

  // 流式测试
  console.log('\n📝 测试 2: 流式模式');
  console.log('-'.repeat(40));
  const streamStart2 = Date.now();
  const streamResult = await apiService.chat({
    messages: [
      { role: 'user', content: '列举三种常见的设计模式' },
    ],
    stream: true,
  });
  const streamDuration2 = Date.now() - streamStart2;

  console.log('✅ 响应长度:', streamResult.content.length, '字符');
  console.log('✅ Token 使用:', streamResult.usage.totalTokens);
  console.log('✅ 成本: $' + streamResult.cost.toFixed(6));
  console.log('✅ 耗时:', (streamDuration2 / 1000).toFixed(2) + 's');

  if (VERBOSE) {
    console.log('\n📄 响应内容:');
    console.log(streamResult.content.substring(0, 200) + '...');
  }

  // 对比
  console.log('\n📊 对比分析');
  console.log('-'.repeat(40));
  const tokenDiff = Math.abs(
    streamResult.usage.totalTokens - nonStreamResult.usage.totalTokens
  );
  console.log('Token 差异:', tokenDiff, '(流式 vs 非流式)');
}

async function testCLIMode() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 测试 CLI 模式 (ClaudeCLIService)');
  console.log('='.repeat(60));

  const cliService = LLMServiceFactory.createCLI();

  // 非流式测试
  console.log('\n📝 测试 1: 非流式模式');
  console.log('-'.repeat(40));
  const streamStart1 = Date.now();
  const nonStreamResult = await cliService.chat({
    messages: [
      { role: 'system', content: '你是一个技术专家' },
      { role: 'user', content: '解释什么是 TypeScript' },
    ],
    stream: false,
  });
  const streamDuration1 = Date.now() - streamStart1;

  console.log('✅ 响应长度:', nonStreamResult.content.length, '字符');
  console.log('✅ Token 使用:', nonStreamResult.usage.totalTokens);
  console.log('✅ 成本: $' + nonStreamResult.cost.toFixed(6));
  console.log('✅ 耗时:', (streamDuration1 / 1000).toFixed(2) + 's');

  if (VERBOSE) {
    console.log('\n📄 响应内容:');
    console.log(nonStreamResult.content.substring(0, 200) + '...');
  }

  // 流式测试
  console.log('\n📝 测试 2: 流式模式');
  console.log('-'.repeat(40));
  const streamStart2 = Date.now();
  const streamResult = await cliService.chat({
    messages: [
      { role: 'system', content: '你是一个技术专家' },
      { role: 'user', content: '列举三种数据库类型' },
    ],
    stream: true,
  });
  const streamDuration2 = Date.now() - streamStart2;

  console.log('✅ 响应长度:', streamResult.content.length, '字符');
  console.log('✅ Token 使用:', streamResult.usage.totalTokens);
  console.log('✅ 成本: $' + streamResult.cost.toFixed(6));
  console.log('✅ 耗时:', (streamDuration2 / 1000).toFixed(2) + 's');

  if (VERBOSE) {
    console.log('\n📄 响应内容:');
    console.log(streamResult.content.substring(0, 200) + '...');
  }
}

async function healthCheck() {
  console.log('\n' + '='.repeat(60));
  console.log('🏥 健康检查');
  console.log('='.repeat(60));

  const service = LLMServiceFactory.create();

  console.log('\n检查服务:', config.llmServiceType.toUpperCase());
  const isHealthy = await service.healthCheck();

  if (isHealthy) {
    console.log('✅ 服务健康');
  } else {
    console.log('❌ 服务不健康');
    process.exit(1);
  }
}

async function main() {
  try {
    console.log('\n🚀 LLM 服务集成测试');
    console.log('当前配置: LLM_SERVICE_TYPE=' + config.llmServiceType);
    console.log('运行模式:', config.llmServiceType === 'cli' ? 'Claude CLI' : 'DeepSeek API');

    // 健康检查
    await healthCheck();

    // 根据配置运行相应测试
    if (config.llmServiceType === 'cli') {
      await testCLIMode();
    } else {
      await testAPIMode();
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 所有测试完成！');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

main();
