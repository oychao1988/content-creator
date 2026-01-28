/**
 * ContentCreatorWorkflowAdapter 演示脚本
 *
 * 展示如何使用新的适配器架构
 */

import {
  WorkflowRegistry,
  registerWorkflow,
  createWorkflowGraph,
  createWorkflowState,
  listWorkflows,
} from '../domain/workflow/index.js';
import { contentCreatorWorkflowAdapter } from '../domain/workflow/adapters/ContentCreatorWorkflowAdapter.js';
import type { WorkflowState } from '../domain/workflow/State.js';
import { ExecutionMode } from '../domain/entities/Task.js';

/**
 * 演示 1: 注册工作流
 */
async function demo1_RegisterWorkflow() {
  console.log('\n=== 演示 1: 注册工作流 ===\n');

  // 注册 content-creator 工作流
  registerWorkflow(contentCreatorWorkflowAdapter);

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
 * 演示 2: 创建工作流图
 */
async function demo2_CreateGraph() {
  console.log('\n=== 演示 2: 创建工作流图 ===\n');

  try {
    const graph = createWorkflowGraph('content-creator');
    console.log('✅ 工作流图创建成功');
    console.log(`图类型: ${graph.constructor.name}`);
  } catch (error) {
    console.error('❌ 创建工作流图失败:', error);
  }
}

/**
 * 演示 3: 创建工作流状态
 */
async function demo3_CreateState() {
  console.log('\n=== 演示 3: 创建工作流状态 ===\n');

  try {
    const state = createWorkflowState<WorkflowState>('content-creator', {
      taskId: 'demo-task-001',
      mode: ExecutionMode.SYNC,
      topic: '人工智能技术',
      requirements: '写一篇 2000 字的科普文章',
      targetAudience: '大众',
      tone: '轻松易懂',
      hardConstraints: {
        minWords: 2000,
        maxWords: 3000,
        keywords: ['AI', '人工智能', '机器学习'],
      },
    });

    console.log('✅ 工作流状态创建成功');
    console.log(`  taskId: ${state.taskId}`);
    console.log(`  workflowType: ${state.workflowType}`);
    console.log(`  mode: ${state.mode}`);
    console.log(`  topic: ${state.topic}`);
    console.log(`  requirements: ${state.requirements}`);
    console.log(`  currentStep: ${state.currentStep}`);
    console.log(`  retryCount: ${state.retryCount}`);
    console.log(`  version: ${state.version}`);
    console.log(`  metadata:`, JSON.stringify(state.metadata, null, 2));
    console.log(`  hardConstraints:`, JSON.stringify(state.hardConstraints, null, 2));
  } catch (error) {
    console.error('❌ 创建工作流状态失败:', error);
  }
}

/**
 * 演示 4: 验证参数
 */
async function demo4_ValidateParams() {
  console.log('\n=== 演示 4: 验证参数 ===\n');

  // 有效的参数
  const validParams = {
    taskId: 'demo-task-002',
    mode: ExecutionMode.SYNC,
    topic: '区块链技术',
    requirements: '深入讲解区块链原理',
  };

  const isValid = WorkflowRegistry.validateParams('content-creator', validParams);
  console.log(`有效参数验证: ${isValid ? '✅ 通过' : '❌ 失败'}`);

  // 无效的参数
  const invalidParams = {
    taskId: '', // 无效：空字符串
    mode: ExecutionMode.SYNC,
    topic: '', // 无效：空字符串
    requirements: '', // 无效：空字符串
  };

  const isInvalid = WorkflowRegistry.validateParams('content-creator', invalidParams);
  console.log(`无效参数验证: ${isInvalid ? '✅ 通过' : '❌ 失败'}`);
}

/**
 * 演示 5: 获取工作流元数据
 */
async function demo5_GetMetadata() {
  console.log('\n=== 演示 5: 获取工作流元数据 ===\n');

  try {
    const metadata = WorkflowRegistry.getMetadata('content-creator');
    console.log('工作流元数据:');
    console.log(`  类型: ${metadata.type}`);
    console.log(`  版本: ${metadata.version}`);
    console.log(`  名称: ${metadata.name}`);
    console.log(`  描述: ${metadata.description}`);
    console.log(`  分类: ${metadata.category}`);
    console.log(`  标签: ${metadata.tags?.join(', ')}`);
    console.log(`  作者: ${metadata.author}`);
    console.log(`  必需参数: ${metadata.requiredParams?.join(', ')}`);
    console.log(`  可选参数: ${metadata.optionalParams?.join(', ')}`);
    console.log(`  示例数量: ${metadata.examples?.length}`);

    if (metadata.examples && metadata.examples.length > 0) {
      console.log('\n示例:');
      for (const example of metadata.examples) {
        console.log(`  - ${example.name}`);
        console.log(`    ${example.description}`);
      }
    }
  } catch (error) {
    console.error('❌ 获取元数据失败:', error);
  }
}

/**
 * 演示 6: 向后兼容性检查
 */
async function demo6_BackwardCompatibility() {
  console.log('\n=== 演示 6: 向后兼容性检查 ===\n');

  // 使用现有的 createInitialState 函数
  const { createInitialState } = await import('../domain/workflow/State.js');

  const state = createInitialState({
    taskId: 'compat-check-001',
    mode: ExecutionMode.SYNC,
    topic: '兼容性测试',
    requirements: '测试向后兼容性',
  });

  console.log('✅ 使用现有的 createInitialState 函数成功');
  console.log(`  workflowType: ${state.workflowType}`);
  console.log(`  retryCount: ${state.retryCount}`);
  console.log(`  metadata:`, JSON.stringify(state.metadata, null, 2));

  // 使用现有的 createSimpleContentCreatorGraph 函数
  const { createSimpleContentCreatorGraph } = await import(
    '../domain/workflow/ContentCreatorGraph.js'
  );

  const graph = createSimpleContentCreatorGraph();
  console.log('\n✅ 使用现有的 createSimpleContentCreatorGraph 函数成功');
  console.log(`  图类型: ${graph.constructor.name}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 ContentCreatorWorkflowAdapter 演示\n');
  console.log('=' .repeat(50));

  try {
    await demo1_RegisterWorkflow();
    await demo2_CreateGraph();
    await demo3_CreateState();
    await demo4_ValidateParams();
    await demo5_GetMetadata();
    await demo6_BackwardCompatibility();

    console.log('\n' + '='.repeat(50));
    console.log('✅ 所有演示完成！\n');
  } catch (error) {
    console.error('\n❌ 演示过程中发生错误:', error);
    process.exit(1);
  }
}

// 运行演示
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
