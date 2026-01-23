/**
 * 完整工作流测试（使用 Memory Repository）
 *
 * 测试 Search → Organize → Write → CheckText 完整流程
 */

import { createLogger } from '../src/infrastructure/logging/logger.js';

const logger = createLogger();

async function testFullWorkflow() {
  console.log('\n========================================');
  console.log('    完整工作流测试');
  console.log('========================================\n');

  try {
    // 1. 导入必要的模块
    console.log('1. 加载模块...\n');

    const workflowModule = await import('../src/domain/workflow/index.js');
    const { createSimpleContentCreatorGraph, createInitialState, ExecutionMode } = workflowModule;

    console.log('   ✓ 模块加载成功\n');

    // 2. 创建工作流图
    console.log('2. 创建工作流图...\n');

    const graph = createSimpleContentCreatorGraph();
    console.log('   ✓ 工作流图创建成功\n');

    // 3. 创建初始任务
    console.log('3. 创建初始任务...\n');

    const initialState = createInitialState({
      taskId: 'e2e-test-' + Date.now(),
      mode: ExecutionMode.SYNC,
      topic: '人工智能在医疗诊断中的应用',
      requirements: '写一篇文章，介绍 AI 在医疗诊断领域的应用和优势',
      hardConstraints: {
        minWords: 200,
        keywords: ['AI', '医疗诊断'],
      },
    });

    console.log('   ✓ 任务创建成功');
    console.log('      任务ID:', initialState.taskId);
    console.log('      选题:', initialState.topic);
    console.log('      字数要求:', initialState.hardConstraints.minWords, '-', initialState.hardConstraints.maxWords);
    console.log('      关键词:', initialState.hardConstraints.keywords?.join(', '));
    console.log('');

    // 调试：打印初始状态
    console.log('   [DEBUG] 初始状态内容:');
    console.log('      taskId:', initialState.taskId);
    console.log('      topic:', initialState.topic);
    console.log('      mode:', initialState.mode);
    console.log('      所有字段:', Object.keys(initialState));
    console.log('');

    // 4. 执行工作流
    console.log('4. 执行工作流...');
    console.log('   (预计需要 1-3 分钟，请耐心等待...)\n');

    const startTime = Date.now();

    // 只执行前几个节点（Search → Organize → Write → CheckText）
    // 不包含图片生成，因为那需要更长时间
    const result = await graph.invoke(initialState);

    const duration = Date.now() - startTime;
    const durationSec = Math.round(duration / 1000);

    console.log('\n   ✓ 工作流执行完成！');
    console.log('   总耗时:', durationSec, '秒\n');

    // 5. 显示结果
    console.log('5. 执行结果：\n');

    // 搜索结果
    if (result.searchResults && result.searchResults.length > 0) {
      console.log('   ✓ 搜索完成');
      console.log('      搜索结果数:', result.searchResults.length);
      console.log('      第一条标题:', result.searchResults[0]?.title?.substring(0, 60) + '...');
    } else {
      console.log('   ⚠ 搜索结果为空（可能降级处理）');
    }

    // 整理结果
    if (result.organizedInfo) {
      console.log('\n   ✓ 整理完成');
      console.log('      大纲长度:', result.organizedInfo.outline?.length || 0, '字符');
      console.log('      关键点数:', result.organizedInfo.keyPoints?.length || 0);
      console.log('      摘要长度:', result.organizedInfo.summary?.length || 0, '字符');

      if (result.organizedInfo.keyPoints && result.organizedInfo.keyPoints.length > 0) {
        console.log('\n      关键点预览:');
        result.organizedInfo.keyPoints.slice(0, 3).forEach((point, i) => {
          console.log(`        ${i + 1}. ${point.substring(0, 70)}...`);
        });
      }
    }

    // 文章内容
    if (result.articleContent) {
      console.log('\n   ✓ 文章生成完成');
      const wordCount = result.articleContent.length;
      console.log('      文章长度:', wordCount, '字符');

      // 显示文章预览
      console.log('\n      文章内容预览:');
      const lines = result.articleContent.split('\n');
      lines.slice(0, 5).forEach((line) => {
        console.log('        ', line);
      });
      if (lines.length > 5) {
        console.log('        ... (还有', lines.length - 5, '行)');
      }
    }

    // 质检结果
    if (result.textQualityReport) {
      console.log('\n   ✓ 文本质检完成');
      console.log('      质检评分:', result.textQualityReport.score, '/ 10');
      console.log('      是否通过:', result.textQualityReport.passed ? '✅ 是' : '❌ 否');

      if (!result.textQualityReport.passed && result.textRetryCount > 0) {
        console.log('      重试次数:', result.textRetryCount);
      }

      if (result.textQualityReport.details.softScores) {
        console.log('\n      软评分详情:');
        const scores = result.textQualityReport.details.softScores;
        if (scores.relevance) console.log(`        - 相关性: ${scores.relevance.score}/10 - ${scores.relevance.reason?.substring(0, 40)}...`);
        if (scores.coherence) console.log(`        - 连贯性: ${scores.coherence.score}/10`);
        if (scores.completeness) console.log(`        - 完整性: ${scores.completeness.score}/10`);
        if (scores.readability) console.log(`        - 可读性: ${scores.readability.score}/10`);
      }

      if (result.textQualityReport.details.fixSuggestions && result.textQualityReport.details.fixSuggestions.length > 0) {
        console.log('\n      改进建议:');
        result.textQualityReport.details.fixSuggestions.slice(0, 3).forEach((suggestion, i) => {
          console.log(`        ${i + 1}. ${suggestion}`);
        });
      }
    }

    // 6. 总结
    console.log('\n========================================');
    console.log('   测试完成！');
    console.log('========================================');
    console.log('任务ID:', result.taskId);
    console.log('最终状态:', result.status || 'completed');
    console.log('执行时长:', durationSec, '秒');
    console.log('文章字数:', result.articleContent?.length || 0);
    console.log('质检通过:', result.textQualityReport?.passed ? '✅' : '❌');
    console.log('搜索结果:', result.searchResults?.length || 0, '条');
    console.log('========================================\n');

    // 7. 保存到数据库（Memory Repository）
    console.log('7. 保存到数据库...\n');

    const { createTaskRepository } = await import('../src/infrastructure/database/index.js');
    const { TaskType } = await import('../src/domain/entities/Task.js');

    const repo = createTaskRepository();

    const task = await repo.create({
      id: result.taskId,
      mode: ExecutionMode.SYNC,
      type: TaskType.ARTICLE,
      topic: result.topic,
      requirements: result.requirements,
      hardConstraints: result.hardConstraints,
    });

    console.log('   ✓ 任务已保存到数据库');
    console.log('      数据库类型:', repo.constructor.name);
    console.log('      任务ID:', task.id);

    // 更新任务状态
    await repo.update(task.id, {
      status: result.textQualityReport?.passed ? 'completed' : 'failed',
      completedAt: new Date().toISOString(),
    });

    console.log('   ✓ 任务状态已更新');

    // 显示统计
    const stats = (repo as any).getStats ? (repo as any).getStats() : null;
    if (stats) {
      console.log('\n   数据库统计:');
      console.log('      总任务数:', stats.totalTasks);
      console.log('      快照数:', stats.snapshots);
      console.log('      按状态:', JSON.stringify(stats.byStatus));
    }

    console.log('\n========================================\n');

    return true;
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    logger.error('Workflow test failed', error as Error);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('   Content Creator Full Workflow Test');
  console.log('   (Memory Repository 版本)');
  console.log('========================================');

  const success = await testFullWorkflow();

  if (!success) {
    process.exit(1);
  }
}

main();
