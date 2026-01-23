/**
 * 完整工作流端到端测试
 *
 * 测试完整的内容创作工作流：
 * Search → Organize → Write → CheckText → GenerateImage → CheckImage
 */

import { createLogger } from '../src/infrastructure/logging/logger.js';

// 使用动态导入
async function importModules() {
  const workflowModule = await import('../src/domain/workflow/index.js');

  return {
    createSimpleContentCreatorGraph: workflowModule.createSimpleContentCreatorGraph,
    createInitialState: workflowModule.createInitialState,
    ExecutionMode: workflowModule.ExecutionMode,
  };
}

const logger = createLogger('WorkflowE2ETest');

async function testCompleteWorkflow() {
  console.log('\n=== 完整工作流端到端测试 ===\n');

  try {
    const modules = await importModules();

    // 1. 创建工作流图
    console.log('1. 创建工作流图...');
    const graph = modules.createSimpleContentCreatorGraph();
    console.log('   ✅ 工作流图创建成功\n');

    // 2. 创建初始状态
    console.log('2. 创建初始状态...');
    const initialState = modules.createInitialState({
      taskId: 'e2e-test-' + Date.now(),
      mode: modules.ExecutionMode.SYNC,
      topic: '人工智能在医疗诊断中的应用',
      requirements: '写一篇关于 AI 在医疗诊断领域应用的文章，要求包括具体应用场景、优势和挑战',
      hardConstraints: {
        minWords: 300,
        maxWords: 800,
        keywords: ['AI', '医疗诊断', '人工智能'],
      },
    });
    console.log('   ✅ 初始状态创建成功');
    console.log('   任务ID:', initialState.taskId);
    console.log('   选题:', initialState.topic);
    console.log('   最小字数:', initialState.hardConstraints.minWords);
    console.log('   最大字数:', initialState.hardConstraints.maxWords);
    console.log('   关键词:', initialState.hardConstraints.keywords?.join(', '));
    console.log('');

    // 3. 执行工作流
    console.log('3. 开始执行工作流...');
    console.log('   (这可能需要 2-5 分钟，请耐心等待...)\n');

    const startTime = Date.now();
    const result = await graph.invoke(initialState);
    const duration = Date.now() - startTime;

    console.log('\n   ✅ 工作流执行完成！');
    console.log('   总耗时:', Math.round(duration / 1000), '秒\n');

    // 4. 检查结果
    console.log('4. 检查执行结果...\n');

    // 搜索结果
    if (result.searchResults && result.searchResults.length > 0) {
      console.log('   ✅ 搜索完成');
      console.log('      搜索结果数:', result.searchResults.length);
      console.log('      第一条:', result.searchResults[0]?.title?.substring(0, 50) + '...');
    } else {
      console.log('   ⚠️  搜索结果为空');
    }

    // 整理结果
    if (result.organizedInfo) {
      console.log('\n   ✅ 整理完成');
      console.log('      大纲长度:', result.organizedInfo.outline?.length || 0, '字符');
      console.log('      关键点数:', result.organizedInfo.keyPoints?.length || 0);
      console.log('      摘要长度:', result.organizedInfo.summary?.length || 0, '字符');

      if (result.organizedInfo.keyPoints && result.organizedInfo.keyPoints.length > 0) {
        console.log('\n      关键点预览:');
        result.organizedInfo.keyPoints.slice(0, 3).forEach((point, i) => {
          console.log(`        ${i + 1}. ${point.substring(0, 60)}...`);
        });
      }
    }

    // 文章内容
    if (result.articleContent) {
      console.log('\n   ✅ 文章生成完成');
      console.log('      文章长度:', result.articleContent.length, '字符');
      console.log('      文章预览:');
      console.log('      ', result.articleContent.substring(0, 150) + '...');
    }

    // 文本质检
    if (result.textQualityReport) {
      console.log('\n   ✅ 文本质检完成');
      console.log('      质检评分:', result.textQualityReport.score);
      console.log('      是否通过:', result.textQualityReport.passed ? '✅ 是' : '❌ 否');

      if (!result.textQualityReport.passed && result.textRetryCount > 0) {
        console.log('      重试次数:', result.textRetryCount);
      }

      if (result.textQualityReport.details.softScores) {
        console.log('\n      软评分详情:');
        const scores = result.textQualityReport.details.softScores;
        if (scores.relevance) console.log(`        - 相关性: ${scores.relevance.score}/10`);
        if (scores.coherence) console.log(`        - 连贯性: ${scores.coherence.score}/10`);
        if (scores.completeness) console.log(`        - 完整性: ${scores.completeness.score}/10`);
        if (scores.readability) console.log(`        - 可读性: ${scores.readability.score}/10`);
      }
    }

    // 配图生成
    if (result.images && result.images.length > 0) {
      console.log('\n   ✅ 配图生成完成');
      console.log('      生成图片数:', result.images.length);
      result.images.forEach((img, i) => {
        console.log(`        图片 ${i + 1}: ${img.url.substring(0, 60)}...`);
      });
    } else {
      console.log('\n   ⚠️  未生成配图（可能禁用或失败）');
    }

    // 配图质检
    if (result.imageQualityReport) {
      console.log('\n   ✅ 配图质检完成');
      console.log('      质检评分:', result.imageQualityReport.score);
      console.log('      是否通过:', result.imageQualityReport.passed ? '✅ 是' : '❌ 否');
    }

    // 5. 总结
    console.log('\n========================================');
    console.log('   工作流执行成功！');
    console.log('========================================');
    console.log('任务ID:', result.taskId);
    console.log('执行时长:', Math.round(duration / 1000), '秒');
    console.log('文章字数:', result.articleContent?.length || 0);
    console.log('质检通过:', result.textQualityReport?.passed ? '✅' : '❌');
    console.log('配图数量:', result.images?.length || 0);
    console.log('========================================\n');

    return true;
  } catch (error) {
    console.error('\n❌ 工作流测试失败:', error);
    logger.error('Workflow execution failed', error as Error);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('    Content Creator E2E Test');
  console.log('========================================');

  const success = await testCompleteWorkflow();

  if (!success) {
    process.exit(1);
  }
}

main();
