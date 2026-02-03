/**
 * AI Scaffolding Module - AI 脚手架模块
 *
 * 导出所有 AI 相关组件
 */

// 理解引擎
export { AINeuralUnderstandingEngine } from './AINeuralUnderstandingEngine.js';
export type { UnderstandingResult, OptimizationResult, ContextConfig } from './AINeuralUnderstandingEngine.js';

// 代码生成器
export { AICodeGenerator } from './AICodeGenerator.js';
export type { CodeGeneratorConfig } from './AICodeGenerator.js';

// Prompt 模板
export { STATE_INTERFACE_GENERATION_PROMPT } from './prompts/generate-state.js';
export { NODE_CLASS_GENERATION_PROMPT } from './prompts/generate-node.js';
export { WORKFLOW_GRAPH_GENERATION_PROMPT } from './prompts/generate-graph.js';
export { FACTORY_CLASS_GENERATION_PROMPT } from './prompts/generate-factory.js';

// 代码生成组件
export { StateInterfaceGenerator } from '../codegen/StateInterfaceGenerator.js';
export { NodeClassGenerator } from '../codegen/NodeClassGenerator.js';
export { RouteFunctionGenerator } from '../codegen/RouteFunctionGenerator.js';
export { WorkflowGraphGenerator } from '../codegen/WorkflowGraphGenerator.js';
export { FactoryClassGenerator } from '../codegen/FactoryClassGenerator.js';
export { CodePostProcessor, type WorkflowFiles } from '../codegen/CodePostProcessor.js';
export * from '../codegen/utils.js';
