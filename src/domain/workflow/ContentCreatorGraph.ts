/**
 * ContentCreatorGraph - 内容创作者工作流图
 *
 * 基于 LangGraph 构建的完整工作流，包含：
 * - 搜索 → 整理 → 写作 → 文本质检 → 生成配图 → 配图质检
 * - 支持质检失败重试
 * - 支持断点续传
 */

import { StateGraph, END } from '@langchain/langgraph';
import type { WorkflowState } from './State.js';
import { checkpointManager } from './CheckpointManager.js';
import {
  searchNode,
  organizeNode,
  writeNode,
  checkTextNode,
  generateImageNode,
  checkImageNode,
} from './nodes/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('ContentCreatorGraph');

/**
 * 文本质检后的路由函数
 */
function routeAfterCheckText(state: WorkflowState): string {
  logger.debug('Routing after check text', {
    taskId: state.taskId,
    passed: state.textQualityReport?.passed,
    retryCount: state.textRetryCount,
  });

  // 如果质检通过，生成配图
  if (state.textQualityReport?.passed) {
    logger.info('Text quality check passed, proceeding to image generation', {
      taskId: state.taskId,
      score: state.textQualityReport.score,
    });
    return 'generate_image';
  }

  // 如果质检失败但重试次数未满，重试写作
  if (state.textRetryCount < 3) {
    logger.info('Text quality check failed, retrying write', {
      taskId: state.taskId,
      retryCount: state.textRetryCount,
      maxRetries: 3,
    });
    return 'write';
  }

  // 重试次数已满，抛出错误
  logger.error('Text quality check failed after max retries', {
    taskId: state.taskId,
    retryCount: state.textRetryCount,
  });
  throw new Error('Text quality check failed after 3 attempts');
}

/**
 * 配图质检后的路由函数
 */
function routeAfterCheckImage(state: WorkflowState): string {
  logger.debug('Routing after check image', {
    taskId: state.taskId,
    passed: state.imageQualityReport?.passed,
    retryCount: state.imageRetryCount,
  });

  // 如果质检通过，结束
  if (state.imageQualityReport?.passed) {
    logger.info('Image quality check passed, workflow completed', {
      taskId: state.taskId,
      score: state.imageQualityReport.score,
    });
    return '__end__';
  }

  // 如果质检失败但重试次数未满，重试生成配图
  if (state.imageRetryCount < 2) {
    logger.info('Image quality check failed, retrying image generation', {
      taskId: state.taskId,
      retryCount: state.imageRetryCount,
      maxRetries: 2,
    });
    return 'generate_image';
  }

  // 重试次数已满，抛出错误
  logger.error('Image quality check failed after max retries', {
    taskId: state.taskId,
    retryCount: state.imageRetryCount,
  });
  throw new Error('Image quality check failed after 2 attempts');
}

/**
 * 创建带检查点保存的节点包装器
 */
function wrapNodeWithCheckpoint(
  nodeName: string,
  node: ReturnType<typeof searchNode.toLangGraphNode>
) {
  return async (state: WorkflowState): Promise<Partial<WorkflowState>> => {
    logger.info(`Executing node: ${nodeName}`, {
      taskId: state.taskId,
    });

    try {
      // 执行节点逻辑
      const result = await node(state);

      // 保存检查点
      await checkpointManager.saveCheckpoint(state.taskId, nodeName, {
        ...state,
        ...result,
      });

      // 更新步骤
      return {
        ...result,
        currentStep: nodeName,
      };
    } catch (error) {
      logger.error(`Node ${nodeName} failed`, {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

/**
 * 创建内容创作者工作流图
 */
export function createContentCreatorGraph(): StateGraph<WorkflowState> {
  logger.info('Creating content creator workflow graph');

  // 创建节点实例（获取 LangGraph 节点函数）
  const searchNodeFn = searchNode.toLangGraphNode();
  const organizeNodeFn = organizeNode.toLangGraphNode();
  const writeNodeFn = writeNode.toLangGraphNode();
  const checkTextNodeFn = checkTextNode.toLangGraphNode();
  const generateImageNodeFn = generateImageNode.toLangGraphNode();
  const checkImageNodeFn = checkImageNode.toLangGraphNode();

  // 包装节点以添加检查点保存
  const searchNodeWithCheckpoint = wrapNodeWithCheckpoint('search', searchNodeFn);
  const organizeNodeWithCheckpoint = wrapNodeWithCheckpoint(
    'organize',
    organizeNodeFn
  );
  const writeNodeWithCheckpoint = wrapNodeWithCheckpoint('write', writeNodeFn);
  const checkTextNodeWithCheckpoint = wrapNodeWithCheckpoint(
    'checkText',
    checkTextNodeFn
  );
  const generateImageNodeWithCheckpoint = wrapNodeWithCheckpoint(
    'generateImage',
    generateImageNodeFn
  );
  const checkImageNodeWithCheckpoint = wrapNodeWithCheckpoint(
    'checkImage',
    checkImageNodeFn
  );

  // 创建 StateGraph
  const graph = new StateGraph<WorkflowState>({
    channels: {
      // 输入参数
      taskId: {
        default: () => '',
      },
      mode: {
        default: () => 'sync' as const,
      },
      topic: {
        default: () => '',
      },
      requirements: {
        default: () => '',
      },
      hardConstraints: {
        default: () => ({}),
      },

      // 流程数据
      searchQuery: {
        default: () => undefined,
      },
      searchResults: {
        default: () => undefined,
      },
      organizedInfo: {
        default: () => undefined,
      },
      articleContent: {
        default: () => undefined,
      },
      images: {
        default: () => undefined,
      },
      imagePrompts: {
        default: () => undefined,
      },
      previousContent: {
        default: () => undefined,
      },
      previousImages: {
        default: () => undefined,
      },

      // 质检数据
      textQualityReport: {
        default: () => undefined,
      },
      imageQualityReport: {
        default: () => undefined,
      },

      // 控制数据
      currentStep: {
        default: () => 'start',
      },
      textRetryCount: {
        default: () => 0,
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 0),
      },
      imageRetryCount: {
        default: () => 0,
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 0),
      },
      version: {
        default: () => 1,
      },
      startTime: {
        default: () => Date.now(),
      },
    },
  });

  // 添加节点
  graph.addNode('search', searchNodeWithCheckpoint);
  graph.addNode('organize', organizeNodeWithCheckpoint);
  graph.addNode('write', writeNodeWithCheckpoint);
  graph.addNode('checkText', checkTextNodeWithCheckpoint);
  graph.addNode('generate_image', generateImageNodeWithCheckpoint);
  graph.addNode('checkImage', checkImageNodeWithCheckpoint);

  // 设置入口点
  graph.setEntryPoint('search');

  // 添加边（线性流程）
  graph.addEdge('search', 'organize');
  graph.addEdge('organize', 'write');
  graph.addEdge('write', 'checkText');
  // 注意: checkText 的出边由条件边控制，不要添加默认边
  // graph.addEdge('checkText', 'generate_image'); // 已移除，避免与条件边冲突
  graph.addEdge('generate_image', 'checkImage');
  // 注意: checkImage 的出边由条件边控制，不要添加默认边
  // graph.addEdge('checkImage', '__end__'); // 已移除，避免与条件边冲突

  // 添加条件边（文本质检后的路由）
  graph.addConditionalEdges(
    'checkText',
    routeAfterCheckText,
    {
      write: 'write',
      generate_image: 'generate_image',
    }
  );

  // 添加条件边（配图质检后的路由）
  graph.addConditionalEdges(
    'checkImage',
    routeAfterCheckImage,
    {
      generate_image: 'generate_image',
      __end__: END,
    }
  );

  logger.info('Content creator workflow graph created successfully');

  // 编译并返回图
  return graph.compile();
}

/**
 * 创建内容创作者工作流图（简化版，不带检查点）
 */
export function createSimpleContentCreatorGraph(): any {
  logger.info('Creating simple content creator workflow graph (no checkpoints)');

  // 创建节点实例
  const searchNodeFn = searchNode.toLangGraphNode();
  const organizeNodeFn = organizeNode.toLangGraphNode();
  const writeNodeFn = writeNode.toLangGraphNode();
  const checkTextNodeFn = checkTextNode.toLangGraphNode();
  const generateImageNodeFn = generateImageNode.toLangGraphNode();
  const checkImageNodeFn = checkImageNode.toLangGraphNode();

  // 创建 StateGraph
  const graph = new StateGraph<WorkflowState>({
    channels: {
      taskId: {
        default: () => '',
      },
      mode: {
        default: () => 'sync' as const,
      },
      topic: {
        default: () => '',
      },
      requirements: {
        default: () => '',
      },
      hardConstraints: {
        default: () => ({}),
      },
      searchQuery: {
        default: () => undefined,
      },
      searchResults: {
        default: () => undefined,
      },
      organizedInfo: {
        default: () => undefined,
      },
      articleContent: {
        default: () => undefined,
      },
      images: {
        default: () => undefined,
      },
      imagePrompts: {
        default: () => undefined,
      },
      previousContent: {
        default: () => undefined,
      },
      textQualityReport: {
        default: () => undefined,
      },
      imageQualityReport: {
        default: () => undefined,
      },
      currentStep: {
        default: () => 'start',
      },
      textRetryCount: {
        default: () => 0,
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 0),
      },
      imageRetryCount: {
        default: () => 0,
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 0),
      },
      version: {
        default: () => 1,
      },
      startTime: {
        default: () => Date.now(),
      },
      endTime: {
        default: () => undefined,
      },
      error: {
        default: () => undefined,
      },
    },
  });

  // 添加节点
  graph.addNode('search', searchNodeFn);
  graph.addNode('organize', organizeNodeFn);
  graph.addNode('write', writeNodeFn);
  graph.addNode('checkText', checkTextNodeFn);
  graph.addNode('generate_image', generateImageNodeFn);
  graph.addNode('checkImage', checkImageNodeFn);

  // 设置入口点和边
  graph.setEntryPoint('search');
  graph.addEdge('search', 'organize');
  graph.addEdge('organize', 'write');
  graph.addEdge('write', 'checkText');
  // 注意: checkText 的出边由条件边控制，不要添加默认边
  // graph.addEdge('checkText', 'generate_image'); // 已移除，避免与条件边冲突
  graph.addEdge('generate_image', 'checkImage');
  // 注意: checkImage 的出边由条件边控制，不要添加默认边
  // graph.addEdge('checkImage', '__end__'); // 已移除，避免与条件边冲突

  // 添加条件边
  graph.addConditionalEdges('checkText', routeAfterCheckText, {
    write: 'write',
    generate_image: 'generate_image',
  });

  graph.addConditionalEdges('checkImage', routeAfterCheckImage, {
    generate_image: 'generate_image',
    __end__: END,
  });

  logger.info('Simple content creator workflow graph created successfully');

  return graph.compile();
}
