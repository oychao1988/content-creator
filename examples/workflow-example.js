/**
 * Content Creator Workflow 使用示例 (JavaScript 版本)
 *
 * 演示如何使用内容创作者工作流
 */

import {
  createContentCreatorGraph,
  createSimpleContentCreatorGraph,
  createInitialState,
  ExecutionMode,
} from '../dist/domain/workflow/index.js';
import { createLogger } from '../dist/infrastructure/logging/logger.js';

const logger = createLogger('WorkflowExampleJS');

/**
 * 示例 1：基本使用
 */
async function example1_BasicUsage() {
  console.log('\n=== 示例 1：基本使用 ===\n');

  // 1. 创建工作流图
  const graph = createSimpleContentCreatorGraph();

  // 2. 创建初始状态
  const initialState = createInitialState({
    taskId: `task-${Date.now()}`,
    mode: ExecutionMode.SYNC,
    topic: 'AI 技术的发展趋势',
    requirements: '写一篇关于 AI 技术发展趋势的文章，重点讨论大语言模型',
    hardConstraints: {
      minWords: 500,
      maxWords: 1000,
      keywords: ['AI', '人工智能', '技术发展'],
    },
  });

  console.log('初始状态:', {
    taskId: initialState.taskId,
    topic: initialState.topic,
    mode: initialState.mode,
  });

  // 3. 执行工作流
  try {
    const result = await graph.invoke(initialState);

    console.log('\n工作流执行成功！');
    console.log('文章内容:', result.articleContent?.substring(0, 100) + '...');
    console.log('配图数量:', result.images?.length || 0);
    console.log('文本质检通过:', result.textQualityReport?.passed);
    console.log('配图质检通过:', result.imageQualityReport?.passed);
  } catch (error) {
    console.error('\n工作流执行失败:', error);
  }
}

/**
 * 示例 2：使用检查点恢复
 */
async function example2_WithCheckpoints() {
  console.log('\n=== 示例 2：使用检查点恢复 ===\n');

  // 1. 创建工作流图（带检查点）
  const graph = createContentCreatorGraph();

  // 2. 创建初始状态
  const initialState = createInitialState({
    taskId: `task-with-checkpoint-${Date.now()}`,
    mode: ExecutionMode.SYNC,
    topic: 'Web 开发的最佳实践',
    requirements: '介绍现代 Web 开发的最佳实践，包括性能优化和安全考虑',
    hardConstraints: {
      minWords: 800,
      maxWords: 1200,
      keywords: ['Web', '前端', '性能优化'],
    },
  });

  console.log('初始状态:', {
    taskId: initialState.taskId,
    topic: initialState.topic,
  });

  // 3. 执行工作流
  try {
    const result = await graph.invoke(initialState);

    console.log('\n工作流执行成功！');
    console.log('文章字数:', result.articleContent?.length);
    console.log('配图数量:', result.images?.length || 0);
  } catch (error) {
    console.error('\n工作流执行失败:', error);
  }
}

/**
 * 示例 3：流式输出
 */
async function example3_StreamingOutput() {
  console.log('\n=== 示例 3：流式输出 ===\n');

  // 1. 创建工作流图
  const graph = createSimpleContentCreatorGraph();

  // 2. 创建初始状态
  const initialState = createInitialState({
    taskId: `task-streaming-${Date.now()}`,
    mode: ExecutionMode.SYNC,
    topic: '远程工作的优势与挑战',
    requirements: '分析远程工作的优势和面临的挑战，给出实用建议',
    hardConstraints: {
      minWords: 600,
      maxWords: 1000,
      keywords: ['远程工作', '团队协作', '工作效率'],
    },
  });

  console.log('初始状态:', {
    taskId: initialState.taskId,
    topic: initialState.topic,
  });

  // 3. 流式执行工作流
  try {
    let stepCount = 0;

    for await (const event of graph.stream(initialState)) {
      const [nodeName, output] = Object.entries(event)[0];

      if (nodeName !== '__end__') {
        stepCount++;
        console.log(`\n[步骤 ${stepCount}] ${nodeName} 节点完成`);

        // 显示当前状态
        if (output.currentStep) {
          console.log('  当前步骤:', output.currentStep);
        }

        // 显示搜索结果
        if (output.searchResults) {
          console.log('  搜索结果:', output.searchResults.length, '条');
        }

        // 显示文章内容
        if (output.articleContent) {
          console.log(
            '  文章内容:',
            output.articleContent.substring(0, 50) + '...'
          );
        }

        // 显示质检结果
        if (output.textQualityReport) {
          console.log(
            '  文本质检:',
            output.textQualityReport.passed ? '通过' : '未通过',
            `分数: ${output.textQualityReport.score}`
          );
        }

        // 显示配图
        if (output.images) {
          console.log('  配图数量:', output.images.length);
        }
      }
    }

    console.log('\n工作流执行完成！');
  } catch (error) {
    console.error('\n工作流执行失败:', error);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('Content Creator Workflow 使用示例 (JavaScript 版本)\n');
  console.log('====================================\n');

  // 运行示例
  await example1_BasicUsage();
  await example2_WithCheckpoints();
  await example3_StreamingOutput();
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Example failed', error);
    process.exit(1);
  });
}

export { example1_BasicUsage, example2_WithCheckpoints, example3_StreamingOutput };
