#!/usr/bin/env tsx
/**
 * 测试不同的 LLM 服务类型
 *
 * 对比 API 和 CLI 两种 LLM 服务的生成效果
 */

import { LLMServiceFactory } from '../src/services/llm/LLMServiceFactory.js';
import { config } from '../src/config/index.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';

const logger = createLogger('LLMTest');

// 测试提示词
const testPrompts = [
  {
    name: '简单问答',
    prompt: '1+1等于多少？',
  },
  {
    name: '创意写作',
    prompt: '请写一首关于春天的简短诗，不超过50字',
  },
  {
    name: '代码生成',
    prompt: '写一个 JavaScript 函数，计算斐波那契数列的第 n 项',
  },
];

/**
 * 测试单个 LLM 服务
 */
async function testLLMService(
  serviceName: string,
  serviceFactory: () => ReturnType<typeof LLMServiceFactory.createAPI | typeof LLMServiceFactory.createCLI>
) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 测试服务: ${serviceName}`);
  console.log(`${'='.repeat(60)}\n`);

  const llmService = serviceFactory();

  for (const testCase of testPrompts) {
    console.log(`\n📝 测试用例: ${testCase.name}`);
    console.log(`   提示词: ${testCase.prompt}\n`);

    try {
      const startTime = Date.now();

      const result = await llmService.chat({
        messages: [
          {
            role: 'user',
            content: testCase.prompt,
          },
        ],
        stream: true,
      });

      const duration = Date.now() - startTime;

      console.log(`✅ 成功!`);
      console.log(`   回复: ${result.content.substring(0, 100)}${result.content.length > 100 ? '...' : ''}`);
      console.log(`   Token 使用: ${result.usage.totalTokens} (输入: ${result.usage.promptTokens}, 输出: ${result.usage.completionTokens})`);
      console.log(`   耗时: ${(duration / 1000).toFixed(2)}s`);
      console.log(`   成本: $${result.cost.toFixed(6)}`);
    } catch (error) {
      console.log(`❌ 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('\n🚀 LLM 服务类型测试');
  console.log(`当前配置: LLM_SERVICE_TYPE=${config.llmServiceType}\n`);

  // 测试 API 服务
  try {
    await testLLMService('API 服务 (DeepSeek)', () => LLMServiceFactory.createAPI());
  } catch (error) {
    console.error('API 服务测试失败:', error);
  }

  // 测试 CLI 服务
  try {
    await testLLMService('Claude CLI 服务', () => LLMServiceFactory.createCLI());
  } catch (error) {
    console.error('CLI 服务测试失败:', error);
  }

  console.log('\n✨ 测试完成!\n');
}

// 运行测试
main().catch((error) => {
  console.error('测试失败:', error);
  process.exit(1);
});
