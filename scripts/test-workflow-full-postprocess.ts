/**
 * 完整工作流测试 - 验证图片占位符替换
 */

import { createLogger } from '../src/infrastructure/logging/logger.js';

const logger = createLogger('WorkflowTest');

async function testWorkflow() {
  console.log('=== 完整工作流测试 ===\n');

  // 动态导入
  const { createContentCreatorGraph } = await import('../src/domain/workflow/ContentCreatorGraph.js');
  const { createInitialState } = await import('../src/domain/workflow/State.js');
  const { ExecutionMode } = await import('../src/domain/workflow/State.js');

  // 创建初始状态
  const initialState = createInitialState({
    taskId: 'test-workflow-postprocess-' + Date.now(),
    mode: ExecutionMode.SYNC,
    topic: '人工智能在医疗领域的应用',
    requirements: '写一篇关于 AI 医疗应用的文章，字数在 2000-3000 字之间',
    hardConstraints: {
      minWords: 2000,
      maxWords: 3000,
      keywords: ['AI', '医疗', '人工智能'],
    },
  });

  console.log('1. 创建初始状态');
  console.log('   taskId:', initialState.taskId);
  console.log('   topic:', initialState.topic);
  console.log();

  // 创建工作流图
  const graph = createContentCreatorGraph();
  console.log('2. 创建工作流图');
  console.log();

  // 执行工作流
  console.log('3. 执行工作流...');
  console.log();

  const startTime = Date.now();

  try {
    const result = await graph.invoke(initialState);

    const duration = Date.now() - startTime;

    console.log('\n=== 工作流执行完成 ===');
    console.log('耗时:', (duration / 1000).toFixed(2), '秒');
    console.log();

    // 检查结果
    console.log('4. 检查结果：');
    console.log('   articleContent 存在:', !!result.articleContent);
    console.log('   finalArticleContent 存在:', !!result.finalArticleContent);
    console.log('   images 数量:', result.images?.length || 0);
    console.log('   imagePrompts 数量:', result.imagePrompts?.length || 0);
    console.log();

    // 检查 articleContent 中的占位符
    if (result.articleContent) {
      const placeholders = (result.articleContent.match(/image-placeholder-\d+/g) || []);
      console.log('   articleContent 中的占位符:', placeholders);
    }

    // 检查 finalArticleContent 中的占位符
    if (result.finalArticleContent) {
      const placeholders = (result.finalArticleContent.match(/image-placeholder-\d+/g) || []);
      console.log('   finalArticleContent 中的占位符:', placeholders);

      const hasLocalPaths = result.finalArticleContent.includes('/storage/images/');
      const hasRemoteUrls = result.finalArticleContent.includes('https://');

      console.log('   包含本地路径:', hasLocalPaths);
      console.log('   包含远程 URL:', hasRemoteUrls);
    }

    console.log();

    // 显示文章片段（如果有 finalArticleContent）
    if (result.finalArticleContent) {
      console.log('5. 最终文章片段（前 500 字符）：');
      console.log(result.finalArticleContent.substring(0, 500) + '...\n');
    }

    // 检查图片信息
    if (result.images && result.images.length > 0) {
      console.log('6. 图片信息：');
      result.images.forEach((img, idx) => {
        console.log(`   图片 ${idx + 1}:`);
        console.log(`     - URL: ${img.url ? img.url.substring(0, 60) + '...' : 'none'}`);
        console.log(`     - 本地路径: ${img.localPath || 'none'}`);
        console.log(`     - 宽度: ${img.width}, 高度: ${img.height}`);
      });
    }

    return result;
  } catch (error) {
    console.error('\n❌ 工作流执行失败：');
    console.error(error);
    throw error;
  }
}

testWorkflow().catch(error => {
  console.error('测试失败：', error);
  process.exit(1);
});
