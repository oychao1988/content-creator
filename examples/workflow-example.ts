/**
 * Content Creator Workflow 使用示例
 *
 * 演示如何使用新的工作流注册表架构
 */

import {
  WorkflowRegistry,
  registerWorkflow,
  createWorkflowGraph,
  createWorkflowState,
  listWorkflows,
} from '../src/domain/workflow/index.js';
import { contentCreatorWorkflowAdapter } from '../src/domain/workflow/adapters/ContentCreatorWorkflowAdapter.js';
import { translationWorkflowFactory } from '../src/domain/workflow/examples/TranslationWorkflow.js';
import { ExecutionMode } from '../src/domain/entities/Task.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';

const logger = createLogger('WorkflowExample');

/**
 * 示例 1：工作流注册表基本使用
 */
async function example1_WorkflowRegistry() {
  console.log('\n=== 示例 1：工作流注册表基本使用 ===\n');

  // 注册工作流
  registerWorkflow(contentCreatorWorkflowAdapter);
  registerWorkflow(translationWorkflowFactory);

  // 列出所有已注册的工作流
  const workflows = listWorkflows();
  console.log('已注册的工作流:');
  for (const workflow of workflows) {
    console.log(`  - ${workflow.name} (${workflow.type})`);
    console.log(`    版本: ${workflow.version}`);
    console.log(`    描述: ${workflow.description}`);
  }
}

/**
 * 示例 2：使用内容创作工作流
 */
async function example2_ContentCreatorWorkflow() {
  console.log('\n=== 示例 2：使用内容创作工作流 ===\n');

  try {
    // 创建工作流状态
    const state = createWorkflowState('content-creator', {
      taskId: `content-task-${Date.now()}`,
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
      taskId: state.taskId,
      topic: state.topic,
      mode: state.mode,
    });

    // 创建工作流图
    const graph = createWorkflowGraph('content-creator');

    // 执行工作流
    const result = await graph.invoke(state);

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
 * 示例 3：使用翻译工作流
 */
async function example3_TranslationWorkflow() {
  console.log('\n=== 示例 3：使用翻译工作流 ===\n');

  try {
    // 创建工作流状态
    const state = createWorkflowState('translation', {
      taskId: `translation-task-${Date.now()}`,
      mode: ExecutionMode.SYNC,
      sourceText: 'Artificial intelligence is transforming the world',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      translationStyle: 'formal',
      domain: 'technology',
    });

    console.log('初始状态:', {
      taskId: state.taskId,
      sourceText: state.sourceText,
      sourceLanguage: state.sourceLanguage,
      targetLanguage: state.targetLanguage,
    });

    // 创建工作流图
    const graph = createWorkflowGraph('translation');

    // 执行工作流
    const result = await graph.invoke(state);

    console.log('\n工作流执行成功！');
    console.log('源文本:', result.sourceText);
    console.log('翻译后:', result.translatedText);
    console.log('质量评分:', result.qualityReport?.score);
  } catch (error) {
    console.error('\n工作流执行失败:', error);
  }
}

/**
 * 示例 4：参数验证
 */
async function example4_ParameterValidation() {
  console.log('\n=== 示例 4：参数验证 ===\n');

  // 验证内容创作工作流参数
  const validContentParams = {
    taskId: 'valid-task-001',
    mode: ExecutionMode.SYNC,
    topic: '区块链技术',
    requirements: '深入讲解区块链原理',
  };

  const isValidContent = WorkflowRegistry.validateParams('content-creator', validContentParams);
  console.log(`内容创作工作流参数验证: ${isValidContent ? '✅ 通过' : '❌ 失败'}`);

  // 验证翻译工作流参数
  const validTranslationParams = {
    taskId: 'valid-task-002',
    mode: ExecutionMode.SYNC,
    sourceText: 'Hello World',
    sourceLanguage: 'en',
    targetLanguage: 'zh',
  };

  const isValidTranslation = WorkflowRegistry.validateParams('translation', validTranslationParams);
  console.log(`翻译工作流参数验证: ${isValidTranslation ? '✅ 通过' : '❌ 失败'}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('Content Creator Workflow 使用示例\n');
  console.log('====================================\n');

  // 运行示例
  await example1_WorkflowRegistry();
  await example2_ContentCreatorWorkflow();
  await example3_TranslationWorkflow();
  await example4_ParameterValidation();
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Example failed', error);
    process.exit(1);
  });
}

export {
  example1_WorkflowRegistry,
  example2_ContentCreatorWorkflow,
  example3_TranslationWorkflow,
  example4_ParameterValidation
};
