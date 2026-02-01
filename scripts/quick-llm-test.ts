#!/usr/bin/env tsx
/**
 * 快速测试当前配置的 LLM 服务
 */

import { LLMServiceFactory } from '../src/services/llm/LLMServiceFactory.js';
import { config } from '../src/config/index.js';

async function quickTest() {
  console.log('\n🧪 快速 LLM 服务测试');
  console.log(`当前配置: LLM_SERVICE_TYPE=${config.llmServiceType}`);
  console.log(`Claude CLI: ${config.claudeCLI.enabled ? '✅ 已启用' : '❌ 未启用'}\n`);

  const llmService = LLMServiceFactory.create();
  const prompt = '请用一句话介绍 TypeScript';

  console.log(`📝 提示词: ${prompt}\n`);
  console.log('⏳ 正在生成...\n');
  console.log('💬 回复: ');

  try {
    const startTime = Date.now();
    const result = await llmService.chat({
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      enableStreamDisplay: true,  // 启用流式显示
    });
    const duration = Date.now() - startTime;

    console.log('✅ 生成成功!\n');
    console.log(`📊 统计信息:`);
    console.log(`   - Token 使用: ${result.usage.totalTokens} (输入: ${result.usage.promptTokens}, 输出: ${result.usage.completionTokens})`);
    console.log(`   - 耗时: ${(duration / 1000).toFixed(2)}s`);
    console.log(`   - 成本: $${result.cost.toFixed(6)}\n`);
  } catch (error) {
    console.error('\n❌ 生成失败:', error);
    process.exit(1);
  }
}

quickTest();
