/**
 * WorkflowRegistry 使用示例
 *
 * 演示如何使用工作流注册表
 */

import { ExecutionMode } from '../../entities/Task.js';
import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import type { WorkflowFactory, WorkflowParams, WorkflowMetadata } from '../WorkflowRegistry.js';
import {
  WorkflowRegistry,
  registerWorkflow,
  getWorkflowFactory,
  listWorkflows,
} from '../WorkflowRegistry.js';

/**
 * 测试工作流状态
 */
interface TestWorkflowState extends BaseWorkflowState {
  input: string;
  output?: string;
}

/**
 * 测试工作流工厂
 */
class TestWorkflowFactory implements WorkflowFactory<TestWorkflowState> {
  readonly type = 'test-workflow';
  readonly version = '1.0.0';
  readonly name = 'Test Workflow';
  readonly description = 'A test workflow for demonstration';

  createGraph(): any {
    return { type: 'test-graph' };
  }

  createState(params: WorkflowParams): TestWorkflowState {
    return {
      taskId: params.taskId,
      workflowType: this.type,
      mode: params.mode as any,
      currentStep: 'start',
      retryCount: 0,
      version: 1,
      startTime: Date.now(),
      input: (params as any).input || '',
    };
  }

  validateParams(params: WorkflowParams): boolean {
    return !!params.taskId && !!params.mode;
  }

  getMetadata(): WorkflowMetadata {
    return {
      type: this.type,
      version: this.version,
      name: this.name,
      description: this.description,
      category: 'test',
      tags: ['demo', 'example'],
      requiredParams: ['taskId', 'mode'],
      optionalParams: ['input'],
    };
  }

  createDefaultParams(): WorkflowParams {
    return {
      taskId: 'default-task',
      mode: ExecutionMode.SYNC,
      input: 'default input',
    };
  }
}

/**
 * 示例 1: 注册工作流
 */
function example1_RegisterWorkflow() {
  console.log('\n=== 示例 1: 注册工作流 ===');

  const factory = new TestWorkflowFactory();
  registerWorkflow(factory);

  console.log('工作流已注册:', factory.type);
  console.log('所有工作流:', WorkflowRegistry.listWorkflowTypes());
}

/**
 * 示例 2: 获取工作流工厂
 */
function example2_GetFactory() {
  console.log('\n=== 示例 2: 获取工作流工厂 ===');

  const factory = getWorkflowFactory<TestWorkflowState>('test-workflow');
  console.log('工作流类型:', factory.type);
  console.log('工作流名称:', factory.name);
  console.log('工作流版本:', factory.version);
}

/**
 * 示例 3: 创建工作流状态
 */
function example3_CreateState() {
  console.log('\n=== 示例 3: 创建工作流状态 ===');

  const params: WorkflowParams = {
    taskId: 'task-123',
    mode: ExecutionMode.SYNC,
    input: 'test input',
  };

  const state = WorkflowRegistry.createState<TestWorkflowState>(
    'test-workflow',
    params
  );

  console.log('创建的状态:', state);
  console.log('输入:', state.input);
}

/**
 * 示例 4: 获取工作流元数据
 */
function example4_GetMetadata() {
  console.log('\n=== 示例 4: 获取工作流元数据 ===');

  const metadata = WorkflowRegistry.getMetadata('test-workflow');
  console.log('元数据:', JSON.stringify(metadata, null, 2));
}

/**
 * 示例 5: 列出所有工作流
 */
function example5_ListWorkflows() {
  console.log('\n=== 示例 5: 列出所有工作流 ===');

  const workflows = listWorkflows();
  console.log('所有工作流数量:', workflows.length);

  for (const workflow of workflows) {
    const metadata = workflow.getMetadata?.();
    console.log(`  - ${workflow.name} (${workflow.type})`);
    console.log(`    描述: ${workflow.description}`);
    console.log(`    分类: ${metadata?.category || '未分类'}`);
    console.log(`    标签: ${metadata?.tags?.join(', ') || '无'}`);
  }
}

/**
 * 示例 6: 验证工作流参数
 */
function example6_ValidateParams() {
  console.log('\n=== 示例 6: 验证工作流参数 ===');

  const validParams: WorkflowParams = {
    taskId: 'task-123',
    mode: ExecutionMode.SYNC,
  };

  const invalidParams: WorkflowParams = {
    taskId: '',
    mode: ExecutionMode.SYNC,
  };

  console.log('有效参数验证:', WorkflowRegistry.validateParams('test-workflow', validParams));
  console.log('无效参数验证:', WorkflowRegistry.validateParams('test-workflow', invalidParams));
}

/**
 * 示例 7: 获取工作流统计信息
 */
function example7_GetStats() {
  console.log('\n=== 示例 7: 获取工作流统计信息 ===');

  const stats = WorkflowRegistry.getStats();
  console.log('工作流总数:', stats.totalWorkflows);
  console.log('分类统计:', stats.categories);
  console.log('版本信息:', stats.versions);
}

/**
 * 示例 8: 工作流存在性检查
 */
function example8_Exists() {
  console.log('\n=== 示例 8: 工作流存在性检查 ===');

  console.log('test-workflow 存在:', WorkflowRegistry.has('test-workflow'));
  console.log('non-existent-workflow 存在:', WorkflowRegistry.has('non-existent-workflow'));
}

/**
 * 示例 9: 创建工作流图
 */
function example9_CreateGraph() {
  console.log('\n=== 示例 9: 创建工作流图 ===');

  const graph = WorkflowRegistry.createGraph('test-workflow');
  console.log('工作流图:', graph);
}

/**
 * 运行所有示例
 */
export function runWorkflowRegistryExamples() {
  console.log('\n🚀 WorkflowRegistry 使用示例\n');
  console.log('='.repeat(60));

  try {
    // 清空注册表（确保干净状态）
    WorkflowRegistry.clear();

    example1_RegisterWorkflow();
    example2_GetFactory();
    example3_CreateState();
    example4_GetMetadata();
    example5_ListWorkflows();
    example6_ValidateParams();
    example7_GetStats();
    example8_Exists();
    example9_CreateGraph();

    console.log('\n' + '='.repeat(60));
    console.log('✅ 所有示例运行成功！');
  } catch (error) {
    console.error('\n❌ 示例运行失败:', error);
    throw error;
  }
}

// 如果直接运行此文件，执行所有示例
if (import.meta.url === `file://${process.argv[1]}`) {
  runWorkflowRegistryExamples();
}
