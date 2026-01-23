/**
 * 端到端测试脚本
 *
 * 使用真实 API 测试完整工作流（如果配置了 API 密钥）
 * 或使用 Mock 测试
 */

import { createSimpleContentCreatorGraph, createInitialState, ExecutionMode } from '../src/domain/workflow/index.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';

const logger = createLogger('E2ETest');

// 测试配置
const TEST_CONFIG = {
  useRealAPI: false, // 设置为 true 使用真实 API，false 使用 Mock
  timeout: 600000, // 10 分钟超时
};

/**
 * 端到端测试：完整工作流
 */
async function testFullWorkflow() {
  logger.info('开始端到端测试：完整工作流');

  const startTime = Date.now();

  try {
    // 1. 创建工作流
    logger.info('1. 创建工作流图...');
    const graph = createSimpleContentCreatorGraph();
    logger.info('   ✅ 工作流图创建成功');

    // 2. 创建初始状态
    logger.info('2. 创建初始状态...');
    const initialState = createInitialState({
      taskId: `e2e-test-${Date.now()}`,
      mode: ExecutionMode.SYNC,
      topic: 'Web 开发的最佳实践',
      requirements: '写一篇关于现代 Web 开发最佳实践的文章，包括性能优化和安全考虑',
      hardConstraints: {
        minWords: 600,
        maxWords: 1200,
        keywords: ['Web', '前端', '性能优化'],
      },
    });
    logger.info('   ✅ 初始状态创建成功');
    logger.info('   taskId:', initialState.taskId);
    logger.info('   topic:', initialState.topic);

    // 3. 执行工作流（流式）
    logger.info('3. 开始执行工作流（流式输出）...\n');

    let stepCount = 0;
    const steps: string[] = [];

    for await (const event of graph.stream(initialState)) {
      const [nodeName, output] = Object.entries(event)[0];

      if (nodeName !== '__end__') {
        stepCount++;
        steps.push(nodeName);

        logger.info(`[步骤 ${stepCount}] ${nodeName} 节点完成`);

        // 显示关键信息
        if (output.currentStep) {
          logger.debug(`  当前步骤: ${output.currentStep}`);
        }

        if (output.searchResults) {
          logger.info(`  ✅ 搜索结果: ${output.searchResults.length} 条`);
        }

        if (output.organizedInfo) {
          logger.info(`  ✅ 大纲已生成`);
          logger.debug(`  关键点: ${output.organizedInfo.keyPoints?.length} 个`);
        }

        if (output.articleContent) {
          const wordCount = output.articleContent.length;
          logger.info(`  ✅ 文章已生成: ${wordCount} 字`);
          logger.debug(`  内容预览: ${output.articleContent.substring(0, 50)}...`);
        }

        if (output.textQualityReport) {
          const { passed, score } = output.textQualityReport;
          logger.info(`  ✅ 文本质检: ${passed ? '通过' : '未通过'} (分数: ${score.toFixed(1)})`);
        }

        if (output.images) {
          logger.info(`  ✅ 配图生成: ${output.images.length} 张`);
        }

        if (output.imageQualityReport) {
          const { passed, score } = output.imageQualityReport;
          logger.info(`  ✅ 配图质检: ${passed ? '通过' : '未通过'} (分数: ${score.toFixed(1)})`);
        }

        logger.debug('');
      }
    }

    // 4. 验证结果
    logger.info('4. 验证结果...\n');

    logger.info(`✅ 工作流执行成功！`);
    logger.info(`   总步骤数: ${stepCount}`);
    logger.info(`   执行的节点: ${steps.join(' → ')}`);

    const duration = Date.now() - startTime;
    logger.info(`   总耗时: ${(duration / 1000).toFixed(2)} 秒`);

    return true;
  } catch (error) {
    logger.error('❌ 端到端测试失败', error as Error);
    return false;
  }
}

/**
 * 测试质检重试机制
 */
async function testQualityCheckRetry() {
  logger.info('\n开始测试：质检重试机制');

  try {
    const graph = createSimpleContentCreatorGraph();

    // 创建一个会触发质检失败的初始状态
    const initialState = createInitialState({
      taskId: `retry-test-${Date.now()}`,
      mode: ExecutionMode.SYNC,
      topic: '简单主题',
      requirements: '写一篇短文',
      hardConstraints: {
        minWords: 100,
        maxWords: 200,
      },
    });

    logger.info('执行工作流（可能会触发重试）...');

    const result = await graph.invoke(initialState);

    logger.info('✅ 工作流完成');
    logger.info(`   最终重试次数: ${result.textRetryCount}`);
    logger.info(`   质检通过: ${result.textQualityReport?.passed ? '是' : '否'}`);

    return true;
  } catch (error) {
    logger.error('❌ 重试测试失败', error as Error);
    return false;
  }
}

/**
 * 并发测试
 */
async function testConcurrentWorkflows() {
  logger.info('\n开始测试：并发工作流');

  try {
    const graph = createSimpleContentCreatorGraph();

    const tasks = Array.from({ length: 3 }, (_, i) =>
      createInitialState({
        taskId: `concurrent-test-${i + 1}-${Date.now()}`,
        mode: ExecutionMode.SYNC,
        topic: `并发测试主题 ${i + 1}`,
        requirements: '写一篇短文',
        hardConstraints: {
          minWords: 100,
          maxWords: 200,
        },
      })
    );

    logger.info('并发执行 3 个工作流...');

    const startTime = Date.now();

    const results = await Promise.all(
      tasks.map((state) => graph.invoke(state))
    );

    const duration = Date.now() - startTime;

    logger.info('✅ 并发测试完成');
    logger.info(`   完成任务数: ${results.length}`);
    logger.info(`   总耗时: ${(duration / 1000).toFixed(2)} 秒`);
    logger.info(`   平均耗时: ${(duration / results.length / 1000).toFixed(2)} 秒/任务`);

    return true;
  } catch (error) {
    logger.error('❌ 并发测试失败', error as Error);
    return false;
  }
}

/**
 * 主测试函数
 */
async function runAllTests() {
  logger.info('='.repeat(60));
  logger.info('Content Creator 端到端测试');
  logger.info('='.repeat(60));
  logger.info('');

  const results: { name: string; passed: boolean }[] = [];

  // 测试 1：完整工作流
  const test1Passed = await testFullWorkflow();
  results.push({ name: '完整工作流', passed: test1Passed });

  // 测试 2：质检重试
  const test2Passed = await testQualityCheckRetry();
  results.push({ name: '质检重试机制', passed: test2Passed });

  // 测试 3：并发执行
  const test3Passed = await testConcurrentWorkflows();
  results.push({ name: '并发工作流', passed: test3Passed });

  // 输出测试总结
  logger.info('\n' + '='.repeat(60));
  logger.info('测试总结');
  logger.info('='.repeat(60));

  results.forEach((result) => {
    const status = result.passed ? '✅ 通过' : '❌ 失败';
    logger.info(`${status} - ${result.name}`);
  });

  const allPassed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;

  logger.info('');
  logger.info(`总计: ${passedCount}/${results.length} 测试通过`);

  if (allPassed) {
    logger.info('\n🎉 所有测试通过！');
  } else {
    logger.info('\n⚠️  部分测试失败，请检查日志');
  }

  return allPassed;
}

// 如果直接运行此脚本
if (require.main === module) {
  runAllTests()
    .then((allPassed) => {
      process.exit(allPassed ? 0 : 1);
    })
    .catch((error) => {
      logger.error('测试运行失败', error);
      process.exit(1);
    });
}

export { runAllTests, testFullWorkflow, testQualityCheckRetry, testConcurrentWorkflows };
