/**
 * 工作流初始化模块
 *
 * 在应用启动时自动注册所有可用的工作流
 */

import { createLogger } from '../../infrastructure/logging/logger.js';
import { WorkflowRegistry } from './WorkflowRegistry.js';
import { contentCreatorWorkflowAdapter } from './adapters/ContentCreatorWorkflowAdapter.js';
import { translationWorkflowFactory } from './examples/TranslationWorkflow.js';

const logger = createLogger('WorkflowInit');

/**
 * 初始化并注册所有工作流
 *
 * 此函数应在应用启动时调用，确保所有工作流都已注册
 */
export function initializeWorkflows(): void {
  // 检查是否已经初始化
  if (WorkflowRegistry.isInitialized()) {
    logger.debug('Workflows already initialized');
    return;
  }

  logger.info('Initializing workflows...');

  // 注册内容创建工作流
  if (!WorkflowRegistry.has('content-creator')) {
    WorkflowRegistry.register(contentCreatorWorkflowAdapter);
    logger.info('Registered workflow: content-creator');
  }

  // 注册翻译工作流
  if (!WorkflowRegistry.has('translation')) {
    WorkflowRegistry.register(translationWorkflowFactory);
    logger.info('Registered workflow: translation');
  }

  logger.info(`Workflow initialization complete. Total workflows registered: ${WorkflowRegistry.count()}`);
}

/**
 * 确保工作流已初始化
 *
 * 如果工作流尚未初始化，自动执行初始化
 * 此函数可以安全地多次调用
 */
export function ensureWorkflowsInitialized(): void {
  if (!WorkflowRegistry.isInitialized()) {
    initializeWorkflows();
  }
}

/**
 * 获取已注册的工作流类型列表
 */
export function getRegisteredWorkflowTypes(): string[] {
  ensureWorkflowsInitialized();
  return WorkflowRegistry.listWorkflowTypes();
}

/**
 * 获取已注册的工作流数量
 */
export function getRegisteredWorkflowCount(): number {
  return WorkflowRegistry.count();
}

// 导出单例函数（便捷导入）
export const registerWorkflows = initializeWorkflows;
