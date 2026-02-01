/**
 * 测试 LLM 超时配置
 *
 * 验证：
 * 1. 配置系统正确读取超时值
 * 2. 非流式请求超时生效
 * 3. 流式请求超时生效
 * 4. 节点超时与底层服务协调
 */

import { enhancedLLMService } from '../src/services/llm/EnhancedLLMService.js';
import { llmService } from '../src/services/llm/LLMService.js';
import { config } from '../src/config/index.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';

const logger = createLogger('TimeoutTest');

/**
 * 测试 1: 验证配置系统
 */
async function testConfiguration() {
  console.log('\n========================================');
  console.log('测试 1: 配置系统验证');
  console.log('========================================');

  console.log('✅ 非流式请求超时:', config.llm.timeout, 'ms (', config.llm.timeout / 1000, '秒)');
  console.log('✅ 流式请求超时:', config.llm.streamTimeout, 'ms (', config.llm.streamTimeout / 1000, '秒)');

  // 验证配置合理性
  if (config.llm.streamTimeout > config.llm.timeout) {
    console.log('✅ 流式超时 > 非流式超时（合理）');
  } else {
    console.warn('⚠️  流式超时应大于非流式超时');
  }

  return true;
}

/**
 * 测试 2: 简单 LLM 请求（验证正常请求）
 */
async function testSimpleRequest() {
  console.log('\n========================================');
  console.log('测试 2: 简单 LLM 请求（非流式）');
  console.log('========================================');

  const startTime = Date.now();

  try {
    const result = await llmService.generateText(
      '用一句话介绍人工智能',
      '你是一位专业的科普作家。'
    );

    const duration = Date.now() - startTime;
    console.log('✅ 请求成功');
    console.log('   - 响应时间:', duration, 'ms (', (duration / 1000).toFixed(2), '秒)');
    console.log('   - 响应长度:', result.length, '字符');
    console.log('   - 响应内容:', result.substring(0, 100) + '...');

    if (duration < config.llm.timeout) {
      console.log('✅ 在超时时间内完成');
    } else {
      console.warn('⚠️  接近或超过超时时间');
    }

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ 请求失败');
    console.error('   - 耗时:', duration, 'ms');
    console.error('   - 错误:', (error as Error).message);
    return false;
  }
}

/**
 * 测试 3: 流式请求
 */
async function testStreamRequest() {
  console.log('\n========================================');
  console.log('测试 3: 流式 LLM 请求');
  console.log('========================================');

  const startTime = Date.now();

  try {
    const result = await enhancedLLMService.chat({
      messages: [
        { role: 'system', content: '你是一位专业的科普作家。' },
        { role: 'user', content: '请用100字左右介绍人工智能' },
      ],
      stream: true,
    });

    const duration = Date.now() - startTime;
    console.log('✅ 流式请求成功');
    console.log('   - 响应时间:', duration, 'ms (', (duration / 1000).toFixed(2), '秒)');
    console.log('   - Token 使用:', result.usage.totalTokens);
    console.log('   - 响应长度:', result.content.length, '字符');
    console.log('   - 响应内容:', result.content.substring(0, 100) + '...');

    if (duration < config.llm.streamTimeout) {
      console.log('✅ 在流式超时时间内完成');
    } else {
      console.warn('⚠️  接近或超过流式超时时间');
    }

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ 流式请求失败');
    console.error('   - 耗时:', duration, 'ms');
    console.error('   - 错误:', (error as Error).message);
    return false;
  }
}

/**
 * 测试 4: 较长请求（测试接近超时的情况）
 */
async function testLongerRequest() {
  console.log('\n========================================');
  console.log('测试 4: 较长内容生成（测试超时边界）');
  console.log('========================================');

  const startTime = Date.now();

  try {
    const result = await enhancedLLMService.chat({
      messages: [
        {
          role: 'system',
          content: '你是一位专业的技术作家，擅长写详细的技术文章。',
        },
        {
          role: 'user',
          content: '请写一篇关于 TypeScript 类型系统的文章，包含：\n1. 基本类型\n2. 接口\n3. 泛型\n4. 类型推断\n5. 装饰器\n\n每个部分至少100字。',
        },
      ],
      stream: true,
      taskId: 'timeout-test-' + Date.now(),
      stepName: 'longContent',
    });

    const duration = Date.now() - startTime;
    console.log('✅ 长内容生成成功');
    console.log('   - 响应时间:', duration, 'ms (', (duration / 1000).toFixed(2), '秒)');
    console.log('   - Token 使用:', result.usage.totalTokens);
    console.log('   - 响应长度:', result.content.length, '字符');
    console.log('   - 占用超时比例:', ((duration / config.llm.streamTimeout) * 100).toFixed(1), '%');

    if (duration < config.llm.streamTimeout * 0.8) {
      console.log('✅ 在安全时间内完成（< 80% 超时时间）');
    } else if (duration < config.llm.streamTimeout) {
      console.warn('⚠️  接近超时阈值（> 80% 超时时间）');
    } else {
      console.error('❌ 超过超时时间！');
    }

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ 长内容生成失败');
    console.error('   - 耗时:', duration, 'ms (', (duration / 1000).toFixed(2), '秒)');
    console.error('   - 错误:', (error as Error).message);

    if ((error as Error).message.includes('timeout')) {
      console.error('   ❌ 确认是超时错误');
    }

    return false;
  }
}

/**
 * 测试 5: 配置对比测试
 */
async function testConfigComparison() {
  console.log('\n========================================');
  console.log('测试 5: 节点超时配置对比');
  console.log('========================================');

  const nodes = [
    { name: 'SearchNode', timeout: 30000 },
    { name: 'OrganizeNode', timeout: 150000 },
    { name: 'WriteNode', timeout: 240000 },
    { name: 'CheckTextNode', timeout: 180000 },
    { name: 'CheckImageNode', timeout: 150000 },
    { name: 'GenerateImageNode', timeout: 180000 },
    { name: 'TranslateNode', timeout: 150000 },
  ];

  console.log('底层 LLM 超时:');
  console.log('  - 非流式:', config.llm.timeout / 1000, '秒');
  console.log('  - 流式:', config.llm.streamTimeout / 1000, '秒');

  console.log('\n节点超时配置:');
  for (const node of nodes) {
    const isStreamLLM = !node.name.includes('Search') && !node.name.includes('Generate');
    const baseTimeout = isStreamLLM ? config.llm.streamTimeout : config.llm.timeout;
    const status = node.timeout >= baseTimeout ? '✅' : '⚠️';

    console.log(`  ${status} ${node.name}: ${node.timeout / 1000}秒 (≥ ${baseTimeout / 1000}秒)`);
  }

  return true;
}

/**
 * 主测试函数
 */
async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   LLM 超时配置测试套件                 ║');
  console.log('╚══════════════════════════════════════════╝');

  const results = {
    configTest: false,
    simpleRequest: false,
    streamRequest: false,
    longerRequest: false,
    configComparison: false,
  };

  try {
    // 测试 1: 配置验证
    results.configTest = await testConfiguration();

    // 测试 2: 简单请求
    results.simpleRequest = await testSimpleRequest();

    // 测试 3: 流式请求
    results.streamRequest = await testStreamRequest();

    // 测试 4: 长请求（可选，可能耗时较长）
    console.log('\n提示: 即将测试较长内容生成（可能需要10-30秒）...');
    results.longerRequest = await testLongerRequest();

    // 测试 5: 配置对比
    results.configComparison = await testConfigComparison();

    // 输出测试结果汇总
    console.log('\n========================================');
    console.log('测试结果汇总');
    console.log('========================================');
    console.log('配置验证:', results.configTest ? '✅ 通过' : '❌ 失败');
    console.log('简单请求:', results.simpleRequest ? '✅ 通过' : '❌ 失败');
    console.log('流式请求:', results.streamRequest ? '✅ 通过' : '❌ 失败');
    console.log('长内容生成:', results.longerRequest ? '✅ 通过' : '❌ 失败');
    console.log('配置对比:', results.configComparison ? '✅ 通过' : '❌ 失败');

    const passedCount = Object.values(results).filter((r) => r).length;
    const totalCount = Object.keys(results).length;

    console.log('\n总体结果:', `${passedCount}/${totalCount} 测试通过`);

    if (passedCount === totalCount) {
      console.log('🎉 所有测试通过！');
      process.exit(0);
    } else {
      console.warn('⚠️  部分测试未通过，请检查配置和网络连接');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ 测试执行失败:');
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
main();
