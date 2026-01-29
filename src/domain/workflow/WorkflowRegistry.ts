/**
 * WorkflowRegistry - 工作流注册表
 *
 * 负责管理和注册所有工作流类型，提供统一的工作流创建接口
 * 核心功能：
 * - 工作流类型注册和发现
 * - 工作流实例创建
 * - 参数验证
 * - 元数据管理
 */

import type { BaseWorkflowState } from './BaseWorkflowState.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('WorkflowRegistry');

/**
 * 编译后的工作流图类型（来自 LangGraph）
 *
 * 注：LangGraph 的 CompiledGraph 类型比较复杂，这里使用简化的类型定义
 * 实际类型会在运行时由 LangGraph 提供
 */
export type WorkflowGraph = any;

/**
 * 工作流参数（通用）
 */
import { ExecutionMode } from '../entities/Task.js';

export interface WorkflowParams {
  taskId: string;
  mode: ExecutionMode;
  [key: string]: any;  // 允许特定工作流扩展参数
}

/**
 * 参数定义接口
 */
export interface ParamDefinition {
  name: string;                    // 参数名 (camelCase)
  description: string;             // 参数描述
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';  // 参数类型
  required: boolean;               // 是否必需
  defaultValue?: any;              // 默认值
  validation?: (value: any) => boolean;  // 自定义验证函数
  cliFlags?: string;               // 自定义 CLI flags (可选，默认使用 kebab-case 转换)
  examples?: string[];             // 参数示例值
}

/**
 * 工作流元数据
 */
export interface WorkflowMetadata {
  type: string;                   // 工作流类型标识符
  version: string;                // 版本号（如 '1.0.0'）
  name: string;                   // 显示名称
  description: string;            // 描述
  category?: string;              // 分类（如 'content', 'seo', 'marketing'）
  tags?: string[];                // 标签
  author?: string;                // 作者
  createdAt?: string;             // 创建时间
  docsUrl?: string;               // 文档链接
  icon?: string;                  // 图标（emoji 或 URL）
  requiredParams?: string[];      // 必需参数列表
  optionalParams?: string[];      // 可选参数列表
  examples?: WorkflowExample[];   // 使用示例

  // 新增字段
  paramDefinitions?: ParamDefinition[];  // 详细的参数定义
  stepNames?: Record<string, string>;    // 步骤名称映射（步骤ID -> 显示名称）
  retryFields?: {                  // 重试计数字段
    name: string;                  // 重试字段名（如 'translationRetryCount'）
    displayName: string;           // 显示名称（如 '翻译重试'）
  }[];
  resultDisplay?: (result: any, console: any) => void;  // 结果展示函数
}

/**
 * 工作流使用示例
 */
export interface WorkflowExample {
  name: string;                   // 示例名称
  description: string;            // 描述
  params: Record<string, any>;    // 示例参数
}

/**
 * 工作流工厂接口（核心接口）
 *
 * 所有工作流必须实现此接口以注册到 WorkflowRegistry
 */
export interface WorkflowFactory<TState extends BaseWorkflowState = BaseWorkflowState> {
  /**
   * 工作流类型标识符（唯一）
   */
  readonly type: string;

  /**
   * 工作流版本号
   */
  readonly version: string;

  /**
   * 工作流显示名称
   */
  readonly name: string;

  /**
   * 工作流描述
   */
  readonly description: string;

  /**
   * 创建工作流图（LangGraph CompiledGraph）
   *
   * @returns 编译后的工作流图
   */
  createGraph(): WorkflowGraph;

  /**
   * 创建工作流状态
   *
   * @param params - 工作流参数
   * @returns 初始化的工作流状态
   */
  createState(params: WorkflowParams): TState;

  /**
   * 验证工作流参数
   *
   * @param params - 待验证的参数
   * @returns 是否有效
   */
  validateParams(params: WorkflowParams): boolean;

  /**
   * 获取工作流元数据（可选）
   *
   * @returns 工作流元数据
   */
  getMetadata?(): WorkflowMetadata;

  /**
   * 创建默认参数（可选）
   *
   * @returns 默认参数
   */
  createDefaultParams?(): WorkflowParams;
}

/**
 * 工作流注册项
 */
interface WorkflowRegistration<TState extends BaseWorkflowState> {
  factory: WorkflowFactory<TState>;
  metadata: WorkflowMetadata;
  registeredAt: number;  // 注册时间戳
}

/**
 * WorkflowRegistry 单例类
 *
 * 管理所有已注册的工作流
 */
class WorkflowRegistryImpl {
  private workflows: Map<string, WorkflowRegistration<any>> = new Map();
  private initialized: boolean = false;

  /**
   * 注册工作流
   *
   * @param factory - 工作流工厂实例
   * @throws Error 如果工作流类型已存在或为空
   */
  register<TState extends BaseWorkflowState>(factory: WorkflowFactory<TState>): void {
    const { type } = factory;

    // 验证工作流类型
    if (!type || type.trim() === '') {
      throw new Error('Workflow type cannot be empty');
    }

    if (this.workflows.has(type)) {
      throw new Error(`Workflow type "${type}" already registered`);
    }

    // 获取元数据
    const metadata = factory.getMetadata?.() || {
      type,
      version: factory.version,
      name: factory.name,
      description: factory.description,
    };

    // 注册
    this.workflows.set(type, {
      factory,
      metadata,
      registeredAt: Date.now(),
    });

    logger.info('Workflow registered', {
      workflowType: type,
      version: metadata.version,
      name: metadata.name,
      totalWorkflows: this.workflows.size,
    });
  }

  /**
   * 获取工作流工厂（便捷方法）
   *
   * @param type - 工作流类型
   * @returns 工作流工厂实例
   * @throws Error 如果工作流不存在
   */
  get<TState extends BaseWorkflowState>(type: string): WorkflowFactory<TState> {
    return this.getFactory(type);
  }

  /**
   * 获取工作流工厂（可选，返回 undefined 而不是抛出错误）
   *
   * @param type - 工作流类型
   * @returns 工作流工厂实例或 undefined
   */
  getOptional<TState extends BaseWorkflowState>(type: string): WorkflowFactory<TState> | undefined {
    const registration = this.workflows.get(type);
    return registration?.factory as WorkflowFactory<TState> | undefined;
  }

  /**
   * 列出所有工作流工厂
   *
   * @returns 工作流工厂数组
   */
  list(): WorkflowFactory[] {
    return Array.from(this.workflows.values()).map((reg) => reg.factory);
  }

  /**
   * 按标签过滤工作流
   *
   * @param tag - 标签名称
   * @returns 符合条件的工作流工厂数组
   */
  filterByTag(tag: string): WorkflowFactory[] {
    return Array.from(this.workflows.values())
      .filter((reg) => reg.metadata.tags?.includes(tag))
      .map((reg) => reg.factory);
  }

  /**
   * 获取已注册工作流数量
   *
   * @returns 工作流数量
   */
  count(): number {
    return this.workflows.size;
  }

  /**
   * 批量注册工作流
   *
   * @param factories - 工作流工厂数组
   */
  registerMany<TState extends BaseWorkflowState>(
    factories: WorkflowFactory<TState>[]
  ): void {
    logger.info('Registering multiple workflows', {
      count: factories.length,
    });

    for (const factory of factories) {
      try {
        this.register(factory);
      } catch (error) {
        logger.error('Failed to register workflow', {
          workflowType: factory.type,
          error: error instanceof Error ? error.message : String(error),
        });
        // 继续注册其他工作流
      }
    }

    logger.info('Workflow registration completed', {
      totalWorkflows: this.workflows.size,
      succeeded: factories.length,
    });
  }

  /**
   * 获取工作流工厂
   *
   * @param type - 工作流类型
   * @returns 工作流工厂实例
   * @throws Error 如果工作流不存在
   */
  getFactory<TState extends BaseWorkflowState>(
    type: string
  ): WorkflowFactory<TState> {
    const registration = this.workflows.get(type);

    if (!registration) {
      logger.error('Workflow not found', { workflowType: type });
      throw new Error(
        `Unknown workflow type: ${type}. Available workflows: ${this.listWorkflowTypes().join(', ')}`
      );
    }

    return registration.factory as WorkflowFactory<TState>;
  }

  /**
   * 获取工作流元数据
   *
   * @param type - 工作流类型
   * @returns 工作流元数据
   * @throws Error 如果工作流不存在
   */
  getMetadata(type: string): WorkflowMetadata {
    const registration = this.workflows.get(type);

    if (!registration) {
      throw new Error(`Unknown workflow type: ${type}`);
    }

    return registration.metadata;
  }

  /**
   * 检查工作流是否已注册
   *
   * @param type - 工作流类型
   * @returns 是否已注册
   */
  has(type: string): boolean {
    return this.workflows.has(type);
  }

  /**
   * 列出所有已注册的工作流类型
   *
   * @returns 工作流类型数组
   */
  listWorkflowTypes(): string[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * 列出所有工作流元数据
   *
   * @param filter - 可选的过滤条件
   * @returns 工作流元数据数组
   */
  listWorkflows(filter?: {
    category?: string;
    tags?: string[];
  }): WorkflowMetadata[] {
    let metadatas = Array.from(this.workflows.values()).map((reg) => reg.metadata);

    if (filter?.category) {
      metadatas = metadatas.filter((m) => m.category === filter.category);
    }

    if (filter?.tags && filter.tags.length > 0) {
      metadatas = metadatas.filter((m) =>
        filter.tags!.some((tag) => m.tags?.includes(tag))
      );
    }

    return metadatas;
  }

  /**
   * 获取工作流统计信息
   */
  getStats(): {
    totalWorkflows: number;
    categories: Record<string, number>;
    versions: Record<string, string>;
  } {
    const metadatas = this.listWorkflows();

    const categories: Record<string, number> = {};
    const versions: Record<string, string> = {};

    for (const metadata of metadatas) {
      // 统计分类
      if (metadata.category) {
        categories[metadata.category] = (categories[metadata.category] || 0) + 1;
      }

      // 记录版本
      versions[metadata.type] = metadata.version;
    }

    return {
      totalWorkflows: this.workflows.size,
      categories,
      versions,
    };
  }

  /**
   * 创建工作流图
   *
   * @param type - 工作流类型
   * @returns 编译后的工作流图
   */
  createGraph(type: string): WorkflowGraph {
    const factory = this.getFactory(type);
    return factory.createGraph();
  }

  /**
   * 创建工作流状态
   *
   * @param type - 工作流类型
   * @param params - 工作流参数
   * @returns 工作流状态
   */
  createState<TState extends BaseWorkflowState>(
    type: string,
    params: WorkflowParams
  ): TState {
    const factory = this.getFactory<TState>(type);

    // 验证参数
    if (!factory.validateParams(params)) {
      throw new Error(`Invalid parameters for workflow "${type}"`);
    }

    return factory.createState(params);
  }

  /**
   * 验证工作流参数
   *
   * @param type - 工作流类型
   * @param params - 待验证的参数
   * @returns 是否有效
   * @throws Error 如果工作流类型未知
   */
  validateParams(type: string, params: WorkflowParams): boolean {
    const factory = this.getFactory(type);
    return factory.validateParams(params);
  }

  /**
   * 注销工作流
   *
   * @param type - 工作流类型
   * @throws Error 如果工作流不存在
   */
  unregister(type: string): void {
    if (!this.workflows.has(type)) {
      throw new Error(`Workflow not registered: ${type}`);
    }

    this.workflows.delete(type);
    logger.info('Workflow unregistered', { workflowType: type });
  }

  /**
   * 清空所有工作流（主要用于测试）
   */
  clear(): void {
    const count = this.workflows.size;
    this.workflows.clear();
    logger.info('All workflows cleared', { count });
  }

  /**
   * 标记为已初始化
   */
  markInitialized(): void {
    this.initialized = true;
    logger.info('WorkflowRegistry initialized', {
      totalWorkflows: this.workflows.size,
    });
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * WorkflowRegistry 单例实例
 */
export const WorkflowRegistry = new WorkflowRegistryImpl();

/**
 * 便捷函数：注册工作流
 *
 * @param factory - 工作流工厂实例
 */
export function registerWorkflow<TState extends BaseWorkflowState>(
  factory: WorkflowFactory<TState>
): void {
  WorkflowRegistry.register(factory);
}

/**
 * 便捷函数：获取工作流工厂
 *
 * @param type - 工作流类型
 * @returns 工作流工厂实例
 */
export function getWorkflowFactory<TState extends BaseWorkflowState>(
  type: string
): WorkflowFactory<TState> {
  return WorkflowRegistry.getFactory<TState>(type);
}

/**
 * 便捷函数：获取工作流元数据
 *
 * @param type - 工作流类型
 * @returns 工作流元数据
 */
export function getWorkflowMetadata(type: string): WorkflowMetadata {
  return WorkflowRegistry.getMetadata(type);
}

/**
 * 便捷函数：列出所有工作流工厂
 *
 * @returns 工作流工厂数组
 */
export function listWorkflows(): WorkflowFactory[] {
  return WorkflowRegistry.list();
}

/**
 * 便捷函数：按标签过滤工作流
 *
 * @param tag - 标签名称
 * @returns 符合条件的工作流工厂数组
 */
export function filterWorkflowsByTag(tag: string): WorkflowFactory[] {
  return WorkflowRegistry.filterByTag(tag);
}

/**
 * 便捷函数：获取工作流工厂（便捷方法）
 *
 * @param type - 工作流类型
 * @returns 工作流工厂实例
 * @throws Error 如果工作流不存在
 */
export function getWorkflow(type: string): WorkflowFactory {
  return WorkflowRegistry.get(type);
}

/**
 * 便捷函数：获取工作流工厂（可选）
 *
 * @param type - 工作流类型
 * @returns 工作流工厂实例或 undefined
 */
export function getWorkflowOptional(type: string): WorkflowFactory | undefined {
  return WorkflowRegistry.getOptional(type);
}

/**
 * 便捷函数：获取已注册工作流数量
 *
 * @returns 工作流数量
 */
export function getWorkflowCount(): number {
  return WorkflowRegistry.count();
}

/**
 * 便捷函数：创建工作流图
 *
 * @param type - 工作流类型
 * @returns 编译后的工作流图
 */
export function createWorkflowGraph(type: string): WorkflowGraph {
  return WorkflowRegistry.createGraph(type);
}

/**
 * 便捷函数：创建工作流状态
 *
 * @param type - 工作流类型
 * @param params - 工作流参数
 * @returns 工作流状态
 */
export function createWorkflowState<TState extends BaseWorkflowState>(
  type: string,
  params: WorkflowParams
): TState {
  return WorkflowRegistry.createState<TState>(type, params);
}

/**
 * 便捷函数：验证工作流参数
 *
 * @param type - 工作流类型
 * @param params - 待验证的参数
 * @returns 是否有效
 */
export function validateWorkflowParams(
  type: string,
  params: WorkflowParams
): boolean {
  return WorkflowRegistry.validateParams(type, params);
}

/**
 * 工作流注册表工具类
 *
 * 提供额外的工具方法
 */
export class WorkflowRegistryUtils {
  /**
   * 打印所有已注册的工作流
   */
  static printWorkflows(): void {
    const workflows = listWorkflows();

    logger.info('Registered workflows:', {
      count: workflows.length,
    });

    for (const workflow of workflows) {
      const metadata = workflow.getMetadata?.();
      logger.info(`  - ${workflow.name} (${workflow.type})`, {
        version: workflow.version,
        description: workflow.description,
        category: metadata?.category,
        tags: metadata?.tags,
      });
    }
  }

  /**
   * 获取工作流的详细信息（JSON 格式）
   */
  static getWorkflowInfo(type: string): string {
    const metadata = getWorkflowMetadata(type);
    return JSON.stringify(metadata, null, 2);
  }

  /**
   * 导出所有工作流元数据为 JSON
   */
  static exportMetadata(): string {
    const workflows = listWorkflows();
    return JSON.stringify(workflows, null, 2);
  }

  /**
   * 检查工作流兼容性
   *
   * @param type - 工作流类型
   * @param requiredVersion - 需要的版本（如 '1.0.0'）
   * @returns 是否兼容
   */
  static checkCompatibility(type: string, requiredVersion: string): boolean {
    try {
      const metadata = getWorkflowMetadata(type);
      const currentVersion = metadata.version;

      // 简单版本比较（只比较 major.minor.patch）
      const current = currentVersion.split('.').map(Number);
      const required = requiredVersion.split('.').map(Number);

      for (let i = 0; i < 3; i++) {
        const c = current[i] || 0;
        const r = required[i] || 0;
        if (c < r) return false;
        if (c > r) return true;
      }

      return true;
    } catch (error) {
      logger.error('Failed to check compatibility', {
        workflowType: type,
        requiredVersion,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
