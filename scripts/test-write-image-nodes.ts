/**
 * 测试 WriteNode 和 GenerateImageNode 的集成
 * 验证 WriteNode 同时生成文章内容和图片提示词
 */

import { createLogger } from '../src/infrastructure/logging/logger.js';

async function importModules() {
  const stateModule = await import('../src/domain/workflow/State.js');
  const nodesModule = await import('../src/domain/workflow/nodes/index.js');

  return {
    createInitialState: stateModule.createInitialState,
    ExecutionMode: stateModule.ExecutionMode,
    writeNode: nodesModule.writeNode,
    generateImageNode: nodesModule.generateImageNode,
  };
}

const logger = createLogger('WriteImageTest');

async function testWriteNode(modules: any) {
  console.log('\n=== 测试 Write Node（生成文章和图片提示词）===\n');

  try {
    const initialState = modules.createInitialState({
      taskId: 'test-write-123',
      mode: modules.ExecutionMode.SYNC,
      topic: '人工智能在医疗领域的应用',
      requirements: '写一篇关于 AI 医疗应用的文章',
      hardConstraints: {
        minWords: 500,
        maxWords: 1000,
        keywords: ['AI', '医疗', '人工智能'],
      },
      imageCount: 2, // 生成 2 张图片的提示词
    });

    // 添加组织信息（模拟 OrganizeNode 已执行）
    initialState.organizedInfo = {
      outline: '一、AI 在医疗诊断中的应用\n二、AI 在药物发现中的应用\n三、AI 在个性化治疗中的应用',
      keyPoints: [
        'AI 可以通过医学影像分析辅助诊断',
        'AI 可以加速药物发现过程',
        'AI 可以实现个性化治疗方案',
      ],
      summary: '人工智能在医疗领域的应用日益广泛，包括诊断、药物发现和个性化治疗等多个方面。',
    };

    // 添加搜索结果（模拟 SearchNode 已执行）
    initialState.searchResults = [
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

    console.log('执行 Write Node...');
    const nodeResult = await modules.writeNode.execute(initialState);

    console.log('✅ Write Node 执行成功');

    // 从 stateUpdate 中获取结果
    const result = nodeResult.stateUpdate;

    // 验证文章内容
    if (!result.articleContent) {
      throw new Error('articleContent 未生成');
    }
    console.log('   文章内容长度:', result.articleContent.length);

    // 验证图片提示词
    if (!result.imagePrompts || !Array.isArray(result.imagePrompts)) {
      throw new Error('imagePrompts 未生成或不是数组');
    }
    console.log('   图片提示词数量:', result.imagePrompts.length);

    // 验证文章中包含图片占位符
    const placeholders = (result.articleContent.match(/image-placeholder-\d+/g) || []);
    console.log('   图片占位符数量:', placeholders.length);
    console.log('   占位符列表:', placeholders);

    // 显示图片提示词
    if (result.imagePrompts.length > 0) {
      console.log('\n   图片提示词:');
      result.imagePrompts.forEach((prompt: string, index: number) => {
        console.log(`     ${index + 1}. ${prompt.substring(0, 80)}...`);
      });
    }

    // 显示文章片段（包含占位符）
    console.log('\n   文章片段（包含占位符）:');
    const lines = result.articleContent.split('\n');
    const placeholderLines = lines.filter((line: string) => line.includes('image-placeholder'));
    placeholderLines.forEach((line: string) => {
      console.log(`   ${line.trim()}`);
    });

    // 验证占位符数量与提示词数量一致
    if (placeholders.length !== result.imagePrompts.length) {
      console.warn(`   ⚠️  警告: 占位符数量 (${placeholders.length}) 与提示词数量 (${result.imagePrompts.length}) 不一致`);
    }

    return {
      success: true,
      articleContent: result.articleContent,
      imagePrompts: result.imagePrompts,
      placeholderCount: placeholders.length,
    };
  } catch (error) {
    console.error('❌ Write Node 测试失败:', error);
    return { success: false, error };
  }
}

async function testGenerateImageNode(modules: any, writeResult: any) {
  console.log('\n=== 测试 GenerateImage Node（使用 WriteNode 生成的提示词）===\n');

  try {
    // 创建包含图片提示词的初始状态
    const stateWithPrompts = modules.createInitialState({
      taskId: 'test-generate-image-123',
      mode: modules.ExecutionMode.SYNC,
      topic: '人工智能在医疗领域的应用',
      requirements: '写一篇关于 AI 医疗应用的文章',
      hardConstraints: {
        minWords: 500,
        maxWords: 1000,
      },
    });

    // 使用 WriteNode 生成的图片提示词
    stateWithPrompts.imagePrompts = writeResult.imagePrompts;
    stateWithPrompts.articleContent = writeResult.articleContent;

    console.log(`执行 Generate Image Node（使用 ${stateWithPrompts.imagePrompts.length} 个提示词）...`);
    const nodeResult = await modules.generateImageNode.execute(stateWithPrompts);

    console.log('✅ GenerateImage Node 执行成功');

    // 从 stateUpdate 中获取结果
    const result = nodeResult.stateUpdate;
    console.log('   生成的图片数量:', result.images?.length || 0);

    if (result.images && result.images.length > 0) {
      console.log('\n   生成的图片:');
      result.images.forEach((img: any, index: number) => {
        console.log(`     ${index + 1}. URL: ${img.url?.substring(0, 60)}...`);
        if (img.localPath) {
          console.log(`        本地路径: ${img.localPath}`);
        }
        if (img.error) {
          console.log(`        ⚠️  错误: ${img.error}`);
        }
      });
    }

    return { success: true };
  } catch (error) {
    console.error('❌ GenerateImage Node 测试失败:', error);
    return { success: false, error };
  }
}

async function main() {
  console.log('========================================');
  console.log('  WriteNode & GenerateImageNode 集成测试');
  console.log('========================================');

  const modules = await importModules();

  // 测试 WriteNode
  const writeResult = await testWriteNode(modules);

  if (!writeResult.success) {
    console.log('\n❌ WriteNode 测试失败，无法继续测试 GenerateImageNode');
    process.exit(1);
  }

  // 测试 GenerateImageNode（使用 WriteNode 的输出）
  const imageResult = await testGenerateImageNode(modules, writeResult);

  // 总结
  console.log('\n========================================');
  console.log('  测试总结');
  console.log('========================================');
  console.log(`WriteNode: ${writeResult.success ? '✅ 通过' : '❌ 失败'}`);
  console.log(`  - 生成了 ${writeResult.imagePrompts?.length || 0} 个图片提示词`);
  console.log(`  - 文章中包含 ${writeResult.placeholderCount || 0} 个图片占位符`);
  console.log(`GenerateImageNode: ${imageResult.success ? '✅ 通过' : '❌ 失败'}`);

  const allPassed = writeResult.success && imageResult.success;
  console.log('\n总体结果:', allPassed ? '✅ 全部通过' : '❌ 有测试失败');
  console.log('========================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main();
