/**
 * ContentCreatorWorkflowAdapter - 内容创作者工作流适配器
 *
 * 将现有的 ContentCreatorGraph 适配到新的扩展架构中
 * 实现 WorkflowFactory 接口，确保向后兼容
 */

import type {
  WorkflowFactory,
  WorkflowGraph,
  WorkflowParams,
  WorkflowMetadata,
} from '../WorkflowRegistry.js';
import type { WorkflowState } from '../State.js';
import { createSimpleContentCreatorGraph } from '../ContentCreatorGraph.js';
import { createInitialState } from '../State.js';
import { ExecutionMode } from '../../entities/Task.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('ContentCreatorWorkflowAdapter');

/**
 * ContentCreator 工作流参数
 */
export interface ContentCreatorParams extends WorkflowParams {
  topic: string;                   // 选题（必需）
  requirements: string;            // 写作要求（必需）
  imageSize?: string;              // 图片尺寸，如 "1920x1080"
  targetAudience?: string;         // 目标受众
  keywords?: string[];             // 关键词
  tone?: string;                   // 语调
  hardConstraints?: {              // 硬性约束
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };
}

/**
 * 将字符串 mode 转换为 ExecutionMode
 */
function stringToExecutionMode(mode: string): ExecutionMode {
  return mode === 'async' ? ExecutionMode.ASYNC : ExecutionMode.SYNC;
}

/**
 * ContentCreator 工作流适配器
 *
 * 实现 WorkflowFactory 接口，作为 ContentCreator 工作流的统一入口
 */
export class ContentCreatorWorkflowAdapter implements WorkflowFactory<WorkflowState> {
  // ========== 工作流标识（只读） ==========

  readonly type = 'content-creator';
  readonly version = '1.0.0';
  readonly name = 'Content Creator';
  readonly description = 'AI-driven intelligent content creation system, supporting search, organization, writing, and quality inspection';

  // ========== 核心方法 ==========

  /**
   * 创建工作流图
   *
   * @returns 编译后的 LangGraph 工作流图
   */
  createGraph(): WorkflowGraph {
    logger.info('Creating content-creator workflow graph');

    try {
      const graph = createSimpleContentCreatorGraph();
      logger.info('Content-creator workflow graph created successfully');
      return graph;
    } catch (error) {
      logger.error('Failed to create content-creator workflow graph', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 创建工作流状态
   *
   * @param params - 工作流参数
   * @returns 初始化的工作流状态
   */
  createState(params: WorkflowParams): WorkflowState {
    logger.info('Creating content-creator workflow state', {
      taskId: params.taskId,
      mode: params.mode,
    });

    try {
      // 转换参数类型
      const contentParams = this.convertParams(params);

      // 调用现有的 createInitialState 函数
      const state = createInitialState({
        ...contentParams,
        mode: stringToExecutionMode(params.mode),
      });

      logger.info('Content-creator workflow state created successfully', {
        taskId: state.taskId,
        workflowType: state.workflowType,
        topic: state.topic,
      });

      return state;
    } catch (error) {
      logger.error('Failed to create content-creator workflow state', {
        taskId: params.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 验证工作流参数
   *
   * @param params - 待验证的参数
   * @returns 是否有效
   */
  validateParams(params: WorkflowParams): boolean {
    logger.debug('Validating content-creator workflow params', {
      taskId: params.taskId,
    });

    try {
      // 验证基础参数
      if (!params.taskId || typeof params.taskId !== 'string') {
        logger.error('Invalid taskId', { taskId: params.taskId });
        return false;
      }

      if (!params.mode || !['sync', 'async'].includes(params.mode)) {
        logger.error('Invalid mode', { mode: params.mode });
        return false;
      }

      // 转换并验证 ContentCreator 特定参数
      const contentParams = this.convertParams(params);

      // 验证 topic（必需）
      if (!contentParams.topic || typeof contentParams.topic !== 'string') {
        logger.error('Invalid topic', { topic: contentParams.topic });
        return false;
      }

      // 验证 requirements（必需）
      if (!contentParams.requirements || typeof contentParams.requirements !== 'string') {
        logger.error('Invalid requirements', {
          requirements: contentParams.requirements,
        });
        return false;
      }

      // 验证 hardConstraints（可选）
      if (contentParams.hardConstraints) {
        const constraints = contentParams.hardConstraints;

        if (constraints.minWords !== undefined && typeof constraints.minWords !== 'number') {
          logger.error('Invalid minWords', { minWords: constraints.minWords });
          return false;
        }

        if (constraints.maxWords !== undefined && typeof constraints.maxWords !== 'number') {
          logger.error('Invalid maxWords', { maxWords: constraints.maxWords });
          return false;
        }

        if (constraints.keywords !== undefined && !Array.isArray(constraints.keywords)) {
          logger.error('Invalid keywords', { keywords: constraints.keywords });
          return false;
        }
      }

      // 验证 imageSize（可选，格式如 1920x1080）
      if (contentParams.imageSize !== undefined) {
        if (typeof contentParams.imageSize !== 'string') {
          logger.error('Invalid imageSize', { imageSize: contentParams.imageSize });
          return false;
        }
        if (!/^\d+x\d+$/.test(contentParams.imageSize)) {
          logger.error('Invalid imageSize format', { imageSize: contentParams.imageSize });
          return false;
        }
      }

      logger.debug('Content-creator workflow params validated successfully', {
        taskId: params.taskId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to validate content-creator workflow params', {
        taskId: params.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 获取工作流元数据
   *
   * @returns 工作流元数据
   */
  getMetadata(): WorkflowMetadata {
    return {
      type: this.type,
      version: this.version,
      name: this.name,
      description: this.description,
      category: 'content',
      tags: ['ai', 'content-creation', 'writing', 'quality-check'],
      author: 'ContentCreator Team',
      createdAt: '2025-01-01',
      docsUrl: 'https://github.com/your-repo/content-creator',
      icon: '✍️',
      requiredParams: ['taskId', 'mode', 'topic', 'requirements'],
      optionalParams: ['targetAudience', 'keywords', 'tone', 'hardConstraints', 'imageSize'],
      examples: [
        {
          name: '基础示例',
          description: '创建一篇关于 AI 技术的科普文章',
          params: {
            taskId: 'task-001',
            mode: 'sync',
            topic: '人工智能技术发展史',
            requirements: '写一篇 2000 字的科普文章，介绍人工智能的发展历程',
            imageSize: '1920x1920',
          },
        },
        {
          name: '高级示例',
          description: '创建带约束条件的文章',
          params: {
            taskId: 'task-002',
            mode: 'async',
            topic: '区块链技术原理',
            requirements: '深入浅出地讲解区块链技术',
            targetAudience: '技术爱好者',
            keywords: ['区块链', '去中心化', '加密算法'],
            tone: '专业但不晦涩',
            imageSize: '1920x1080',
            hardConstraints: {
              minWords: 3000,
              maxWords: 5000,
              keywords: ['区块链', '共识机制', '智能合约'],
            },
          },
        },
      ],
      // 新增：详细参数定义
      paramDefinitions: [
        {
          name: 'topic',
          description: '文章主题',
          type: 'string',
          required: true,
          examples: ['人工智能技术发展', '区块链原理'],
        },
        {
          name: 'requirements',
          description: '创作要求',
          type: 'string',
          required: true,
          examples: ['写一篇2000字的科普文章'],
        },
        {
          name: 'targetAudience',
          description: '目标受众',
          type: 'string',
          required: false,
          defaultValue: '普通读者',
        },
        {
          name: 'keywords',
          description: '关键词列表（逗号分隔）',
          type: 'array',
          required: false,
          examples: ['AI,机器学习,深度学习'],
        },
        {
          name: 'tone',
          description: '语气风格',
          type: 'string',
          required: false,
          defaultValue: '专业',
          examples: ['专业', '轻松', '幽默'],
        },
        {
          name: 'hardConstraints',
          description: '硬性约束（JSON 格式）',
          type: 'object',
          required: false,
        },
        {
          name: 'imageSize',
          description: '图片尺寸（格式如 1920x1080）',
          type: 'string',
          required: false,
          defaultValue: '1920x1920',
          examples: ['1920x1920', '1920x1080'],
        },
      ],
      // 步骤名称映射
      stepNames: {
        'search': '搜索内容',
        'organize': '组织信息',
        'write': '撰写内容',
        'check_text': '文本质检',
        'generate_image': '生成配图',
        'check_image': '图片质检',
      },
      // 重试计数字段
      retryFields: [
        { name: 'textRetryCount', displayName: '文本重试' },
        { name: 'imageRetryCount', displayName: '图片重试' },
      ],
    };
  }

  /**
   * 创建默认参数
   *
   * @returns 默认参数
   */
  createDefaultParams(): ContentCreatorParams {
    return {
      taskId: `task-${Date.now()}`,
      mode: ExecutionMode.SYNC,
      topic: 'AI 技术简介',
      requirements: '写一篇关于 AI 的科普文章',
      targetAudience: '大众',
      keywords: [],
      tone: '轻松易懂',
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 转换通用参数为 ContentCreator 参数
   *
   * @param params - 通用工作流参数
   * @returns ContentCreator 参数
   */
  private convertParams(params: WorkflowParams): ContentCreatorParams {
    return {
      taskId: params.taskId,
      mode: params.mode,
      topic: (params as any).topic || '',
      requirements: (params as any).requirements || '',
      imageSize: (params as any).imageSize,
      targetAudience: (params as any).targetAudience,
      keywords: (params as any).keywords,
      tone: (params as any).tone,
      hardConstraints: (params as any).hardConstraints,
    };
  }
}

/**
 * 导出单例实例
 */
export const contentCreatorWorkflowAdapter = new ContentCreatorWorkflowAdapter();
