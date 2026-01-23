/**
 * 简化工作流测试（不依赖数据库）
 *
 * 只测试核心节点的功能，不涉及数据库操作
 */

import { createLogger } from '../src/infrastructure/logging/logger.js';

async function testWorkflowWithoutDatabase() {
  console.log('\n=== 简化工作流测试（无数据库） ===\n');

  try {
    // 动态导入工作流模块（避免数据库模块加载）
    const nodesModule = await import('../src/domain/workflow/nodes/index.js');
    const stateModule = await import('../src/domain/workflow/State.js');

    const { searchNode, organizeNode } = nodesModule;
    const { createInitialState, ExecutionMode } = stateModule;

    // 1. 创建初始状态
    console.log('1. 创建初始任务...');
    const state = createInitialState({
      taskId: 'simple-test-' + Date.now(),
      mode: ExecutionMode.SYNC,
      topic: '人工智能在医疗诊断中的应用',
      requirements: '写一篇关于 AI 医疗诊断的文章',
      hardConstraints: {
        minWords: 200,
        maxWords: 500,
        keywords: ['AI', '医疗诊断'],
      },
    });
    console.log('   ✅ 任务创建成功\n');

    // 2. 执行 Search Node
    console.log('2. 执行搜索节点...');
    const searchResult = await searchNode.execute(state);
    console.log('   ✅ 搜索完成');
    console.log('      结果数量:', searchResult.searchResults?.length || 0);
    if (searchResult.searchResults && searchResult.searchResults.length > 0) {
      console.log('      第一条:', searchResult.searchResults[0].title);
    }
    console.log('');

    // 3. 执行 Organize Node
    console.log('3. 执行整理节点...');
    const stateWithSearch = { ...state, ...searchResult };
    const organizeResult = await organizeNode.execute(stateWithSearch);
    console.log('   ✅ 整理完成');
    console.log('      大纲长度:', organizeResult.organizedInfo?.outline?.length || 0);
    console.log('      关键点数:', organizeResult.organizedInfo?.keyPoints?.length || 0);
    console.log('      摘要长度:', organizeResult.organizedInfo?.summary?.length || 0);

    if (organizeResult.organizedInfo?.keyPoints) {
      console.log('\n      关键点预览:');
      organizeResult.organizedInfo.keyPoints.slice(0, 3).forEach((point, i) => {
        console.log(`        ${i + 1}. ${point.substring(0, 60)}...`);
      });
    }
    console.log('');

    // 4. 显示完整状态
    console.log('4. 当前工作流状态:');
    const finalState = { ...state, ...searchResult, ...organizeResult };
    console.log('   Task ID:', finalState.taskId);
    console.log('   Topic:', finalState.topic);
    console.log('   Current Step:', finalState.currentStep || '未设置');
    console.log('   Search Results:', finalState.searchResults?.length || 0, '条');
    console.log('   Organized Info:', finalState.organizedInfo ? '✅' : '❌');

    console.log('\n========================================');
    console.log('   ✅ 简化工作流测试通过！');
    console.log('========================================\n');

    return true;
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('    简化工作流测试');
  console.log('========================================');

  const success = await testWorkflowWithoutDatabase();

  if (!success) {
    process.exit(1);
  }
}

main();
