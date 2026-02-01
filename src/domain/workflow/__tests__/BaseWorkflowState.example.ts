/**
 * BaseWorkflowState 使用示例
 *
 * 演示如何使用新的基础工作流状态架构
 */

import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import {
  WorkflowStateFactory,
  WorkflowStateHelper,
} from '../BaseWorkflowState.js';
import { ExecutionMode } from '../../entities/Task.js';

/**
 * 示例 1: 创建基础工作流状态
 */
function example1_CreateBaseState() {
  console.log('\n=== 示例 1: 创建基础工作流状态 ===');

  const baseState = WorkflowStateFactory.createBaseState({
    taskId: 'task-123',
    workflowType: 'content-creator',
    mode: ExecutionMode.SYNC,
    initialStep: 'search',
    metadata: {
      userId: 'user-456',
      priority: 'high',
    },
  });

  console.log('基础状态:', baseState);
  console.log('状态摘要:', WorkflowStateHelper.getSummary(baseState));
}

/**
 * 示例 2: 扩展基础状态（创建特定工作流状态）
 */
function example2_ExtendState() {
  console.log('\n=== 示例 2: 扩展基础状态 ===');

  // 先创建基础状态
  const baseState = WorkflowStateFactory.createBaseState({
    taskId: 'task-123',
    workflowType: 'content-creator',
    mode: ExecutionMode.SYNC,
  });

  // 定义特定工作流的状态接口
  interface ContentCreatorState extends BaseWorkflowState {
    topic: string;
    requirements: string;
    searchResults?: string[];
  }

  // 扩展基础状态
  const contentState = WorkflowStateFactory.extendState<ContentCreatorState>(
    baseState,
    {
      topic: 'AI技术发展',
      requirements: '写一篇科普文章',
      searchResults: [],
    }
  );

  console.log('扩展后的状态:', contentState);
  console.log('包含 topic:', contentState.topic);
}

/**
 * 示例 3: 使用状态辅助方法
 */
function example3_StateHelpers() {
  console.log('\n=== 示例 3: 使用状态辅助方法 ===');

  const baseState = WorkflowStateFactory.createBaseState({
    taskId: 'task-123',
    workflowType: 'content-creator',
    mode: ExecutionMode.SYNC,
  });

  // 更新步骤
  const stepUpdate = WorkflowStateHelper.updateStep('search');
  console.log('步骤更新:', stepUpdate);

  // 增加重试计数
  const retryUpdate = WorkflowStateHelper.incrementRetry(baseState);
  console.log('重试计数更新:', retryUpdate);

  // 标记完成
  const completeUpdate = WorkflowStateHelper.markComplete();
  console.log('完成标记:', completeUpdate);

  // 设置元数据字段
  const metadataUpdate = WorkflowStateHelper.setMetadataField(
    baseState,
    'progress',
    50
  );
  console.log('元数据更新:', metadataUpdate);
}

/**
 * 示例 4: 状态序列化和反序列化
 */
function example4_Serialization() {
  console.log('\n=== 示例 4: 状态序列化和反序列化 ===');

  const baseState = WorkflowStateFactory.createBaseState({
    taskId: 'task-123',
    workflowType: 'content-creator',
    mode: ExecutionMode.SYNC,
    metadata: {
      userId: 'user-456',
    },
  });

  // 序列化
  const json = WorkflowStateHelper.serialize(baseState);
  console.log('序列化后的 JSON:', json);

  // 反序列化
  const restored = WorkflowStateHelper.deserialize(
    json,
    'content-creator'
  );
  console.log('反序列化后的状态:', restored);
}

/**
 * 示例 5: 状态验证
 */
function example5_Validation() {
  console.log('\n=== 示例 5: 状态验证 ===');

  const baseState = WorkflowStateFactory.createBaseState({
    taskId: 'task-123',
    workflowType: 'content-creator',
    mode: ExecutionMode.SYNC,
  });

  // 验证基础状态
  const isValid = WorkflowStateHelper.validateBaseState(baseState);
  console.log('状态是否有效:', isValid);

  // 检查是否完成
  const isComplete = WorkflowStateHelper.isComplete(baseState);
  console.log('是否已完成:', isComplete);

  // 检查是否有错误
  const hasError = WorkflowStateHelper.hasError(baseState);
  console.log('是否有错误:', hasError);

  // 获取执行时长
  const duration = WorkflowStateHelper.getDuration(baseState);
  console.log('执行时长 (ms):', duration);
}

/**
 * 示例 6: 创建检查点
 */
function example6_Checkpoint() {
  console.log('\n=== 示例 6: 创建检查点 ===');

  const baseState = WorkflowStateFactory.createBaseState({
    taskId: 'task-123',
    workflowType: 'content-creator',
    mode: ExecutionMode.SYNC,
    initialStep: 'organize',
    metadata: {
      progress: 30,
    },
  });

  const checkpoint = WorkflowStateHelper.createCheckpoint(baseState);
  console.log('检查点快照:', checkpoint);
}

/**
 * 示例 7: 状态克隆
 */
function example7_Clone() {
  console.log('\n=== 示例 7: 状态克隆 ===');

  const baseState = WorkflowStateFactory.createBaseState({
    taskId: 'task-123',
    workflowType: 'content-creator',
    mode: ExecutionMode.SYNC,
  });

  const cloned = WorkflowStateFactory.cloneState(baseState);

  console.log('原始状态 ID:', baseState);
  console.log('克隆状态 ID:', cloned);
  console.log('是否相等:', baseState === cloned);  // 应该为 false
}

/**
 * 运行所有示例
 */
export function runBaseWorkflowStateExamples() {
  console.log('\n🚀 BaseWorkflowState 使用示例\n');
  console.log('=' .repeat(60));

  try {
    example1_CreateBaseState();
    example2_ExtendState();
    example3_StateHelpers();
    example4_Serialization();
    example5_Validation();
    example6_Checkpoint();
    example7_Clone();

    console.log('\n' + '='.repeat(60));
    console.log('✅ 所有示例运行成功！');
  } catch (error) {
    console.error('\n❌ 示例运行失败:', error);
    throw error;
  }
}

// 如果直接运行此文件，执行所有示例
if (import.meta.url === `file://${process.argv[1]}`) {
  runBaseWorkflowStateExamples();
}
