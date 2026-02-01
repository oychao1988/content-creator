#!/usr/bin/env tsx
/**
 * 通用 LLM 测试脚本
 * 支持命令行参数配置
 *
 * 使用示例:
 *   npx tsx scripts/test-llm.ts "你好"                    # 使用默认配置
 *   npx tsx scripts/test-llm.ts "你好" --type api         # 使用 API 模式
 *   npx tsx scripts/test-llm.ts "你好" --type cli         # 使用 CLI 模式
 *   npx tsx scripts/test-llm.ts "你好" --no-stream        # 禁用流式输出
 *   npx tsx scripts/test-llm.ts "你好" --no-display       # 禁用实时显示
 */

import { LLMServiceFactory } from '../src/services/llm/LLMServiceFactory.js';
import type { ILLMService } from '../src/services/llm/ILLMService.js';
import { config } from '../src/config/index.js';

// 解析命令行参数
const args = process.argv.slice(2);
const prompt = args[0] || '请用一句话介绍 TypeScript';

// 解析选项
const options = {
  type: 'api' as 'api' | 'cli',
  stream: true,
  display: true,
};

for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--type' && args[i + 1]) {
    const type = args[++i];
    if (type === 'api' || type === 'cli') {
      options.type = type;
    }
  } else if (arg === '--no-stream') {
    options.stream = false;
  } else if (arg === '--no-display') {
    options.display = false;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
使用方法:
  npx tsx scripts/test-llm.ts [提示词] [选项]

参数:
  提示词                    要发送给 LLM 的提示内容（默认: "请用一句话介绍 TypeScript"）

选项:
  --type <api|cli>         LLM 服务类型（默认: api）
  --no-stream              禁用流式输出
  --no-display             禁用实时显示
  --help, -h               显示帮助信息

示例:
  npx tsx scripts/test-llm.ts "你好"
  npx tsx scripts/test-llm.ts "写一首诗" --type api
  npx tsx scripts/test-llm.ts "介绍 Go" --type cli
  npx tsx scripts/test-llm.ts "test" --no-stream
    `);
    process.exit(0);
  }
}

async function testLLM() {
  console.log('\n🧪 LLM 服务测试');
  console.log('=' .repeat(50));
  console.log(`📝 提示词: ${prompt}`);
  console.log(`🔧 配置: type=${options.type}, stream=${options.stream}, display=${options.display}\n`);

  if (options.display) {
    console.log('⏳ 正在生成...\n');
    console.log('💬 回复: ');
  }

  try {
    const startTime = Date.now();

    // 根据类型创建服务
    const llmService: ILLMService =
      options.type === 'cli' ? LLMServiceFactory.createCLI() : LLMServiceFactory.createAPI();

    const result = await llmService.chat({
      messages: [{ role: 'user', content: prompt }],
      stream: options.stream,
      enableStreamDisplay: options.display && options.stream,
    });

    const duration = Date.now() - startTime;

    if (!options.display) {
      console.log('\n✅ 生成成功!\n');
      console.log(`📄 回复内容: ${result.content}\n`);
    } else {
      console.log('\n✅ 生成成功!\n');
    }

    console.log('📊 统计信息:');
    console.log(`   - Token 使用: ${result.usage.totalTokens} (输入: ${result.usage.promptTokens}, 输出: ${result.usage.completionTokens})`);
    console.log(`   - 耗时: ${(duration / 1000).toFixed(2)}s`);
    console.log(`   - 成本: $${result.cost.toFixed(6)}\n`);
  } catch (error) {
    console.error('\n❌ 生成失败:', error);
    process.exit(1);
  }
}

testLLM();
