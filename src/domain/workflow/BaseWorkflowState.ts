/**
 * BaseWorkflowState - 工作流状态基类
 *
 * 提供所有工作流通用的基础状态结构和工具方法
 * 设计目标：
 * - 提取所有工作流的公共字段
 * - 保持与现有 WorkflowState 的兼容性
 * - 提供类型安全的状态操作方法
 * - 支持状态扩展和继承
 */

import { ExecutionMode } from '../entities/Task.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('BaseWorkflowState');

/**
 * 基础工作流状态接口
 *
 * 包含所有工作流类型必须具备的通用字段
 */
export interface BaseWorkflowState {
  // ========== 核心标识 ==========
  taskId: string;                  // 任务 ID
  workflowType: string;            // 工作流类型（如 'content-creator', 'seo-optimizer'）
  mode: ExecutionMode;             // 执行模式（sync/async）

  // ========== 流程控制 ==========
  currentStep: string;             // 当前步骤名称
  retryCount: number;              // 当前步骤的重试计数

  // ========== 版本控制 ==========
  version: number;                 // 状态版本号（用于乐观锁）

  // ========== 时间戳 ==========
  startTime?: number;              // 开始时间（时间戳）
  endTime?: number;                // 结束时间（时间戳）

  // ========== 错误处理 ==========
  error?: string;                  // 错误信息

  // ========== 元数据（可扩展） ==========
  metadata?: Record<string, any>;  // 额外的元数据信息
}

/**
 * 工作流状态创建参数
 */
export interface CreateWorkflowStateParams {
  taskId: string;
  workflowType: string;
  mode: ExecutionMode;
  initialStep?: string;            // 初始步骤，默认 'start'
  metadata?: Record<string, any>;
}

/**
 * 工作流状态工厂类
 *
 * 负责创建和初始化基础工作流状态
 */
export class WorkflowStateFactory {
  /**
   * 创建基础工作流状态
   */
  static createBaseState(params: CreateWorkflowStateParams): BaseWorkflowState {
    const baseState: BaseWorkflowState = {
      taskId: params.taskId,
      workflowType: params.workflowType,
      mode: params.mode,
      currentStep: params.initialStep || 'start',
      retryCount: 0,
      version: 1,
      startTime: Date.now(),
      metadata: params.metadata || {},
    };

    logger.debug('Created base workflow state', {
      taskId: params.taskId,
      workflowType: params.workflowType,
      mode: params.mode,
      initialStep: params.initialStep || 'start',
    });

    return baseState;
  }

  /**
   * 扩展基础状态（用于创建特定工作流的状态）
   *
   * @example
   * ```typescript
   * interface ContentCreatorState extends BaseWorkflowState {
   *   topic: string;
   *   requirements: string;
   *   // ... 其他字段
   * }
   *
   * const state = WorkflowStateFactory.extendState<ContentCreatorState>(baseState, {
   *   topic: 'AI技术',
   *   requirements: '写一篇科普文章',
   * });
   * ```
   */
  static extendState<T extends BaseWorkflowState>(
    baseState: BaseWorkflowState,
    extensions: Partial<T>
  ): T {
    const extendedState = {
      ...baseState,
      ...extensions,
    } as T;

    logger.debug('Extended workflow state', {
      taskId: baseState.taskId,
      workflowType: baseState.workflowType,
      extensionKeys: Object.keys(extensions),
    });

    return extendedState;
  }

  /**
   * 从 BaseWorkflowState 创建新的状态副本
   */
  static cloneState<T extends BaseWorkflowState>(state: T): T {
    const cloned = JSON.parse(JSON.stringify(state)) as T;

    logger.debug('Cloned workflow state', {
      taskId: state.taskId,
      workflowType: state.workflowType,
    });

    return cloned;
  }
}

/**
 * 工作流状态辅助类
 *
 * 提供状态更新、验证、序列化等工具方法
 */
export class WorkflowStateHelper {
  /**
   * 创建状态更新（类型安全的 Partial）
   *
   * @example
   * ```typescript
   * const update = WorkflowStateHelper.updateField('currentStep', 'search');
   * ```
   */
  static updateField<T extends BaseWorkflowState, K extends keyof T>(
    field: K,
    value: T[K]
  ): Partial<T> {
    return { [field]: value } as unknown as Partial<T>;
  }

  /**
   * 批量更新状态
   */
  static updateFields<T extends BaseWorkflowState>(
    updates: Partial<T>
  ): Partial<T> {
    return updates;
  }

  /**
   * 更新当前步骤
   */
  static updateStep<T extends BaseWorkflowState>(
    stepName: string
  ): Partial<T> {
    return {
      currentStep: stepName,
    } as Partial<T>;
  }

  /**
   * 增加重试计数
   */
  static incrementRetry<T extends BaseWorkflowState>(
    state: T
  ): Partial<T> {
    return {
      retryCount: state.retryCount + 1,
    } as Partial<T>;
  }

  /**
   * 重置重试计数
   */
  static resetRetry<T extends BaseWorkflowState>(): Partial<T> {
    return {
      retryCount: 0,
    } as Partial<T>;
  }

  /**
   * 增加版本号（用于乐观锁）
   */
  static incrementVersion<T extends BaseWorkflowState>(
    state: T
  ): Partial<T> {
    return {
      version: state.version + 1,
    } as Partial<T>;
  }

  /**
   * 标记错误
   */
  static markError<T extends BaseWorkflowState>(
    error: string
  ): Partial<T> {
    return {
      error,
      endTime: Date.now(),
    } as Partial<T>;
  }

  /**
   * 清除错误
   */
  static clearError<T extends BaseWorkflowState>(): Partial<T> {
    return {
      error: undefined,
    } as Partial<T>;
  }

  /**
   * 标记完成
   */
  static markComplete<T extends BaseWorkflowState>(): Partial<T> {
    return {
      currentStep: 'complete',
      endTime: Date.now(),
    } as Partial<T>;
  }

  /**
   * 更新元数据
   */
  static updateMetadata<T extends BaseWorkflowState>(
    state: T,
    metadata: Record<string, any>
  ): Partial<T> {
    return {
      metadata: {
        ...state.metadata,
        ...metadata,
      },
    } as Partial<T>;
  }

  /**
   * 设置元数据字段
   */
  static setMetadataField<T extends BaseWorkflowState>(
    state: T,
    key: string,
    value: any
  ): Partial<T> {
    return {
      metadata: {
        ...state.metadata,
        [key]: value,
      },
    } as Partial<T>;
  }

  /**
   * 验证状态是否可序列化
   */
  static validateSerializable<T extends BaseWorkflowState>(
    state: T
  ): boolean {
    try {
      JSON.stringify(state);
      return true;
    } catch (error) {
      logger.error('State is not serializable', {
        taskId: state.taskId,
        workflowType: state.workflowType,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 验证必需字段
   */
  static validateRequired<T extends BaseWorkflowState>(
    state: T,
    requiredFields: (keyof T)[]
  ): boolean {
    for (const field of requiredFields) {
      if (state[field] === undefined || state[field] === null) {
        logger.error('Missing required field', {
          taskId: state.taskId,
          workflowType: state.workflowType,
          field: String(field),
        });
        return false;
      }
    }

    return true;
  }

  /**
   * 验证基础状态的完整性
   */
  static validateBaseState(state: BaseWorkflowState): boolean {
    const requiredFields: Array<keyof BaseWorkflowState> = [
      'taskId',
      'workflowType',
      'mode',
      'currentStep',
      'retryCount',
      'version',
    ];

    return this.validateRequired(state, requiredFields) &&
           this.validateSerializable(state);
  }

  /**
   * 序列化状态
   */
  static serialize<T extends BaseWorkflowState>(state: T): string {
    if (!this.validateSerializable(state)) {
      throw new Error('State is not serializable');
    }
    return JSON.stringify(state);
  }

  /**
   * 反序列化状态
   */
  static deserialize<T extends BaseWorkflowState>(
    json: string,
    workflowType: string
  ): T {
    try {
      const state = JSON.parse(json) as T;

      // 验证 workflowType
      if ((state as any).workflowType !== workflowType) {
        throw new Error(
          `Workflow type mismatch: expected ${workflowType}, got ${(state as any).workflowType}`
        );
      }

      return state;
    } catch (error) {
      logger.error('Failed to deserialize state', {
        workflowType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 创建检查点快照（只保存必要字段）
   */
  static createCheckpoint<T extends BaseWorkflowState>(
    state: T
  ): Partial<T> {
    const checkpoint: any = {
      currentStep: state.currentStep,
      retryCount: state.retryCount,
      version: state.version,
      error: state.error,
      metadata: state.metadata,
    };

    // 包含时间戳
    if (state.startTime) {
      checkpoint.startTime = state.startTime;
    }
    if (state.endTime) {
      checkpoint.endTime = state.endTime;
    }

    return checkpoint as Partial<T>;
  }

  /**
   * 计算执行时长
   */
  static getDuration(state: BaseWorkflowState): number {
    const endTime = state.endTime || Date.now();
    const startTime = state.startTime || endTime;
    return endTime - startTime;
  }

  /**
   * 检查是否完成
   */
  static isComplete(state: BaseWorkflowState): boolean {
    return state.currentStep === 'complete' || !!state.endTime;
  }

  /**
   * 检查是否有错误
   */
  static hasError(state: BaseWorkflowState): boolean {
    return !!state.error;
  }

  /**
   * 获取状态摘要（用于日志）
   */
  static getSummary(state: BaseWorkflowState): Record<string, any> {
    return {
      taskId: state.taskId,
      workflowType: state.workflowType,
      mode: state.mode,
      currentStep: state.currentStep,
      retryCount: state.retryCount,
      version: state.version,
      hasError: !!state.error,
      isComplete: this.isComplete(state),
      duration: this.getDuration(state),
    };
  }
}

/**
 * 工作流状态转换器
 *
 * 用于在不同工作流状态之间进行转换
 */
export class WorkflowStateTransformer {
  /**
   * 将 BaseWorkflowState 转换为特定工作流状态
   *
   * @example
   * ```typescript
   * const contentState = WorkflowStateTransformer.toSpecificState<
   *   ContentCreatorState
   * >(baseState, {
   *   topic: 'AI',
   *   requirements: 'Write article',
   * });
   * ```
   */
  static toSpecificState<T extends BaseWorkflowState>(
    baseState: BaseWorkflowState,
    extensions: Partial<T>
  ): T {
    return WorkflowStateFactory.extendState(baseState, extensions);
  }

  /**
   * 从特定工作流状态提取基础状态
   */
  static toBaseState<T extends BaseWorkflowState>(state: T): BaseWorkflowState {
    return {
      taskId: state.taskId,
      workflowType: state.workflowType,
      mode: state.mode,
      currentStep: state.currentStep,
      retryCount: state.retryCount,
      version: state.version,
      startTime: state.startTime,
      endTime: state.endTime,
      error: state.error,
      metadata: state.metadata,
    };
  }
}

/**
 * 类型守卫：检查状态是否为特定工作流类型
 */
export function isWorkflowType<T extends BaseWorkflowState>(
  state: BaseWorkflowState,
  workflowType: string,
  guard: (state: any) => state is T
): state is T {
  return state.workflowType === workflowType && guard(state);
}

/**
 * 创建类型守卫的辅助函数
 */
export function createTypeGuard<T extends BaseWorkflowState>(
  workflowType: string,
  requiredFields: (keyof T)[]
): (state: any) => state is T {
  return (state: any): state is T => {
    if (state.workflowType !== workflowType) {
      return false;
    }

    for (const field of requiredFields) {
      if (state[field] === undefined || state[field] === null) {
        return false;
      }
    }

    return true;
  };
}
