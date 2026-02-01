#!/usr/bin/env tsx
/**
 * API LLM 服务测试脚本
 * 使用 DeepSeek API 生成内容
 */

import { LLMServiceFactory } from '../src/services/llm/LLMServiceFactory.js';
import type { ILLMService } from '../src/services/llm/ILLMService.js';

// 从命令行参数读取提示词
const prompt = process.argv[2] || '请用一句话介绍 TypeScript';

async function testAPI() {
  console.log('\n🌐 API LLM 服务测试');
  console.log('=' .repeat(50));
  console.log(`📝 提示词: ${prompt}\n`);
  console.log('⏳ 正在生成...\n');
  console.log('💬 回复: ');

  try {
    const startTime = Date.now();

    // 强制使用 API 服务
    const apiService: ILLMService = LLMServiceFactory.createAPI();

    const result = await apiService.chat({
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      enableStreamDisplay: true,
    });

    const duration = Date.now() - startTime;

    console.log('\n✅ 生成成功!\n');
    console.log('📊 统计信息:');
    console.log(`   - Token 使用: ${result.usage.totalTokens} (输入: ${result.usage.promptTokens}, 输出: ${result.usage.completionTokens})`);
    console.log(`   - 耗时: ${(duration / 1000).toFixed(2)}s`);
    console.log(`   - 成本: $${result.cost.toFixed(6)}\n`);
  } catch (error) {
    console.error('\n❌ 生成失败:', error);
    process.exit(1);
  }
}

testAPI();
