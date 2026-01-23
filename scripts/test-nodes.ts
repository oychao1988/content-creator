/**
 * 节点功能测试
 * 测试单个节点的执行功能
 */

import { createLogger } from '../src/infrastructure/logging/logger.js';

// 使用动态导入避免模块解析问题
async function importModules() {
  const stateModule = await import('../src/domain/workflow/State.js');
  const nodesModule = await import('../src/domain/workflow/nodes/index.js');

  return {
    createInitialState: stateModule.createInitialState,
    ExecutionMode: stateModule.ExecutionMode,
    searchNode: nodesModule.searchNode,
    organizeNode: nodesModule.organizeNode,
  };
}

const logger = createLogger('NodeTest');

async function testSearchNode(modules: any) {
  console.log('\n=== 测试 Search Node ===\n');

  try {
    const initialState = modules.createInitialState({
      taskId: 'test-search-123',
      mode: modules.ExecutionMode.SYNC,
      topic: '人工智能在医疗领域的应用',
      requirements: '写一篇关于 AI 医疗应用的文章',
      hardConstraints: {
        minWords: 500,
        maxWords: 1000,
        keywords: ['AI', '医疗', '人工智能'],
      },
    });

    console.log('执行 Search Node...');
    const result = await modules.searchNode.execute(initialState);

    console.log('✅ Search Node 执行成功');
    console.log('   搜索结果数量:', result.searchResults?.length || 0);

    if (result.searchResults && result.searchResults.length > 0) {
      console.log('   第一条结果:');
      console.log('     标题:', result.searchResults[0].title);
      console.log('     URL:', result.searchResults[0].url);
    }

    return true;
  } catch (error) {
    console.error('❌ Search Node 测试失败:', error);
    return false;
  }
}

async function testOrganizeNode(modules: any) {
  console.log('\n=== 测试 Organize Node ===\n');

  try {
    // 模拟搜索后的状态
    const stateWithSearchResults = modules.createInitialState({
      taskId: 'test-organize-123',
      mode: modules.ExecutionMode.SYNC,
      topic: '人工智能在医疗领域的应用',
      requirements: '写一篇关于 AI 医疗应用的文章',
      hardConstraints: {
        minWords: 500,
        maxWords: 1000,
      },
    });

    // 添加模拟搜索结果
    stateWithSearchResults.searchResults = [
      {
        title: 'AI 在医疗诊断中的应用',
        url: 'https://example.com/1',
        content: '人工智能在医疗诊断领域展现出巨大潜力，可以通过医学影像分析辅助医生诊断...',
        score: 0.95,
      },
      {
        title: '医疗 AI 的最新进展',
        url: 'https://example.com/2',
        content: '近年来，医疗 AI 技术快速发展，包括药物发现、个性化治疗等多个领域...',
        score: 0.88,
      },
    ];

    console.log('执行 Organize Node...');
    const result = await modules.organizeNode.execute(stateWithSearchResults);

    console.log('✅ Organize Node 执行成功');
    console.log('   大纲长度:', result.organizedInfo?.outline?.length || 0);
    console.log('   关键点数量:', result.organizedInfo?.keyPoints?.length || 0);
    console.log('   摘要长度:', result.organizedInfo?.summary?.length || 0);

    if (result.organizedInfo) {
      console.log('\n   大纲预览:');
      console.log('   ', result.organizedInfo.outline.substring(0, 100) + '...');

      console.log('\n   关键点:');
      result.organizedInfo.keyPoints.forEach((point, index) => {
        console.log(`     ${index + 1}. ${point.substring(0, 50)}...`);
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Organize Node 测试失败:', error);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('       节点功能测试');
  console.log('========================================');

  const modules = await importModules();

  const results = {
    searchNode: false,
    organizeNode: false,
  };

  // 测试 Search Node
  results.searchNode = await testSearchNode(modules);

  // 测试 Organize Node
  results.organizeNode = await testOrganizeNode(modules);

  // 总结
  console.log('\n========================================');
  console.log('       测试总结');
  console.log('========================================');
  console.log(`Search Node: ${results.searchNode ? '✅ 通过' : '❌ 失败'}`);
  console.log(`Organize Node: ${results.organizeNode ? '✅ 通过' : '❌ 失败'}`);
  console.log('\n通过: ' + Object.values(results).filter(Boolean).length + '/2');
  console.log('========================================\n');

  // 如果有测试失败，退出码为 1
  if (!Object.values(results).every(Boolean)) {
    process.exit(1);
  }
}

main();
