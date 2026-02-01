/**
 * Workflow State - 工作流状态定义
 *
 * 定义 LangGraph 工作流的状态结构
 * 每个节点接收完整的 State，返回要更新的字段（Partial<State>）
 */

import { ExecutionMode } from '../entities/Task.js';
import type { BaseWorkflowState } from './BaseWorkflowState.js';

// 重新导出 ExecutionMode 以便外部使用
export { ExecutionMode };

/**
 * 搜索结果项
 */
export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
  publishedDate?: string;
  author?: string;
}

/**
 * 整理后的信息
 */
export interface OrganizedInfo {
  outline: string;          // 文章大纲
  keyPoints: string[];      // 关键点列表
  summary: string;          // 摘要
}

/**
 * 质检报告
 */
import type { QualityCheckDetails } from '../entities/QualityCheck.js';

export interface QualityReport {
  score: number;            // 评分（1-10）
  passed: boolean;          // 是否通过
  hardConstraintsPassed: boolean; // 硬性约束是否通过
  modelName?: string;       // 使用的模型名称
  details: QualityCheckDetails; // 质检详情
  fixSuggestions?: string[]; // 改进建议（用于重写/重生成）
  checkedAt?: number;       // 检查时间戳
}

/**
 * 图片生成结果
 */
export interface GeneratedImage {
  url: string;              // 图片 URL
  prompt: string;           // 使用的提示词
  width?: number;           // 宽度
  height?: number;          // 高度
  format?: string;          // 格式
}

/**
 * 工作流状态
 *
 * 注意：
 * - State 必须可序列化（JSON.stringify）
 * - 不能包含函数、循环引用
 * - 大对象使用引用（避免重复）
 * - WorkflowState 继承自 BaseWorkflowState，包含所有工作流通用字段
 */
export interface WorkflowState extends BaseWorkflowState {
  // ========== 工作流类型标识 ==========
  workflowType: 'content-creator';       // 工作流类型（固定值）

  // ========== ContentCreator 特定输入参数 ==========
  topic: string;                         // 选题
  requirements: string;                  // 写作要求
  hardConstraints: {                     // 硬性约束
    minWords?: number;                   // 最小字数
    maxWords?: number;                   // 最大字数
    keywords?: string[];                 // 必须包含的关键词
  };

  // ========== 流程数据（各节点累积） ==========

  // 搜索阶段
  searchQuery?: string;                  // 搜索关键词（由 topic 生成）
  searchResults?: SearchResultItem[];    // 搜索结果列表

  // 整理阶段
  organizedInfo?: OrganizedInfo;         // 整理后的信息

  // 写作阶段
  articleContent?: string;               // 文章内容（Markdown）
  previousContent?: string;              // 上一版内容（用于重写）
  imagePrompts?: string[];               // 配图提示词列表

  // 配图阶段
  images?: GeneratedImage[];             // 生成的配图列表
  previousImages?: GeneratedImage[];     // 上一版配图（用于重生成）

  // 质检阶段
  textQualityReport?: QualityReport;     // 文本质检报告
  imageQualityReport?: QualityReport;    // 配图质检报告

  // ========== ContentCreator 特定控制数据 ==========
  textRetryCount: number;                // 文本质检重试次数
  imageRetryCount: number;               // 配图质检重试次数
}

/**
 * 创建初始状态
 */
export function createInitialState(params: {
  taskId: string;
  mode: ExecutionMode;
  topic: string;
  requirements: string;
  targetAudience?: string;
  keywords?: string[];
  tone?: string;
  hardConstraints?: {
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };
}): WorkflowState {
  return {
    // BaseWorkflowState 字段
    taskId: params.taskId,
    workflowType: 'content-creator',
    mode: params.mode,
    currentStep: 'start',
    retryCount: 0,
    version: 1,
    startTime: Date.now(),
    metadata: {
      targetAudience: params.targetAudience,
      keywords: params.keywords,
      tone: params.tone,
    },

    // ContentCreator 特定字段
    topic: params.topic,
    requirements: params.requirements,
    hardConstraints: params.hardConstraints || {},
    textRetryCount: 0,
    imageRetryCount: 0,
  };
}

/**
 * 状态更新辅助函数
 */
export class StateUpdater {
  /**
   * 创建状态更新（类型安全的 Partial）
   */
  static update<T extends keyof WorkflowState>(
    field: T,
    value: WorkflowState[T]
  ): Partial<WorkflowState> {
    return { [field]: value } as Partial<WorkflowState>;
  }

  /**
   * 批量更新状态
   */
  static updates(updates: Partial<WorkflowState>): Partial<WorkflowState> {
    return updates;
  }

  /**
   * 更新当前步骤
   */
  static updateStep(stepName: string): Partial<WorkflowState> {
    return {
      currentStep: stepName,
    };
  }

  /**
   * 增加重试计数
   */
  static incrementTextRetry(state: WorkflowState): Partial<WorkflowState> {
    return {
      textRetryCount: state.textRetryCount + 1,
    };
  }

  static incrementImageRetry(state: WorkflowState): Partial<WorkflowState> {
    return {
      imageRetryCount: state.imageRetryCount + 1,
    };
  }

  /**
   * 标记错误
   */
  static markError(error: string): Partial<WorkflowState> {
    return {
      error,
      endTime: Date.now(),
    };
  }

  /**
   * 标记完成
   */
  static markComplete(): Partial<WorkflowState> {
    return {
      currentStep: 'complete',
      endTime: Date.now(),
    };
  }
}

/**
 * 状态验证工具
 */
export class StateValidator {
  /**
   * 验证状态是否可序列化
   */
  static validateSerializable(state: WorkflowState): boolean {
    try {
      JSON.stringify(state);
      return true;
    } catch (error) {
      console.error('State is not serializable:', error);
      return false;
    }
  }

  /**
   * 验证必需字段
   */
  static validateRequired(state: WorkflowState): boolean {
    const required: Array<keyof WorkflowState> = [
      'taskId',
      'mode',
      'topic',
      'requirements',
      'hardConstraints',
      'currentStep',
      'textRetryCount',
      'imageRetryCount',
      'version',
    ];

    for (const field of required) {
      if (state[field] === undefined || state[field] === null) {
        console.error(`Missing required field: ${field}`);
        return false;
      }
    }

    return true;
  }

  /**
   * 验证状态完整性
   */
  static validate(state: WorkflowState): boolean {
    return this.validateSerializable(state) && this.validateRequired(state);
  }
}

/**
 * State 快照管理
 */
export class StateSnapshotManager {
  /**
   * 序列化状态
   */
  static serialize(state: WorkflowState): string {
    if (!StateValidator.validateSerializable(state)) {
      throw new Error('State is not serializable');
    }
    return JSON.stringify(state);
  }

  /**
   * 反序列化状态
   */
  static deserialize(json: string): WorkflowState {
    try {
      const state = JSON.parse(json) as WorkflowState;
      if (!StateValidator.validate(state)) {
        throw new Error('Invalid state structure');
      }
      return state;
    } catch (error) {
      console.error('Failed to deserialize state:', error);
      throw error;
    }
  }

  /**
   * 克隆状态（深拷贝）
   */
  static clone(state: WorkflowState): WorkflowState {
    return JSON.parse(JSON.stringify(state)) as WorkflowState;
  }

  /**
   * 创建检查点快照（只保存必要字段）
   */
  static createCheckpoint(state: WorkflowState): Partial<WorkflowState> {
    return {
      searchResults: state.searchResults,
      organizedInfo: state.organizedInfo,
      articleContent: state.articleContent,
      imagePrompts: state.imagePrompts,
      images: state.images,
      textQualityReport: state.textQualityReport,
      imageQualityReport: state.imageQualityReport,
      currentStep: state.currentStep,
      textRetryCount: state.textRetryCount,
      imageRetryCount: state.imageRetryCount,
      version: state.version,
    };
  }
}
