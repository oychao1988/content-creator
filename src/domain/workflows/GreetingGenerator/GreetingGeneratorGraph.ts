t;
import { StateGraph, END, START } from '@langchain/langgraph';
import type { CompiledGraph } from '@langchain/langgraph';
import { ExecutionMode } from '../../../entities/Task.js';
import { Node } from './nodes/Node.js';

// No conditional edges in this workflow

/**
 * 创建问候生成工作流图
 */
export function createGreetingGeneratorGraph(): CompiledGraph {
  const graph = new StateGraph<GreetingGeneratorState>({
    channels: {
      // BaseWorkflowState 字段
      taskId: { value: (x, y) => y ?? x, default: () => '' },
      workflowType: { value: (x, y) => y ?? x, default: () => 'greeting-generator' },
      mode: { value: (x, y) => y ?? x, default: () => 'sync' as ExecutionMode },
      currentStep: { value: (x, y) => y ?? x, default: () => 'start' },
      retryCount: { value: (x, y) => y ?? x, default: () => 0 },
      version: { value: (x, y) => y ?? x, default: () => 1 },
      startTime: { value: (x, y) => y ?? x, default: () => undefined },
      endTime: { value: (x, y) => y ?? x, default: () => undefined },
      error: { value: (x, y) => y ?? x, default: () => undefined },
      metadata: { value: (x, y) => ({ ...x, ...y }), default: () => ({}) },

      // GreetingGeneratorState 特定字段
      name: { value: (x, y) => y ?? x, default: () => '' },
      timeOfDay: { value: (x, y) => y ?? x, default: () => 'morning' },
      language: { value: (x, y) => y ?? x, default: () => 'zh' },
      greetingText: { value: (x, y) => y ?? x, default: () => undefined },
    },
  });

  // 添加节点
  const node = new Node();
  graph.addNode('generateGreeting', node.toLangGraphNode());

  // 设置入口点
  graph.setEntryPoint('generateGreeting');

  // 添加边
  graph.addEdge('generateGreeting', END);

  return graph.compile();
}
