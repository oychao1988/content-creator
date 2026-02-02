/**
 * ContentCreatorGraph - 内容创作者工作流图
 *
 * 基于 LangGraph 构建的完整工作流，包含：
 * - 搜索 → 整理 → 写作 → 文本质检 → 生成配图 → 配图质检
 * - 支持质检失败重试
 * - 支持断点续传
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import type { WorkflowState } from './State.js';
import { checkpointManager } from './CheckpointManager.js';
import { ExecutionMode } from '../entities/Task.js';
import {
  searchNode,
  organizeNode,
  writeNode,
  checkTextNode,
  generateImageNode,
  checkImageNode,
  postProcessNode,
} from './nodes/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('ContentCreatorGraph');

/**
 * 文本质检后的路由函数
 *
 * 优化后流程：write 生成 articleContent + imagePrompts
 * → generate_image 使用 imagePrompts 生成 images
 * → checkImage 检查 images 质量并提供建议
 */
function routeAfterCheckText(state: WorkflowState): string {
  logger.debug('Routing after check text', {
    taskId: state.taskId,
    passed: state.textQualityReport?.passed,
    retryCount: state.textRetryCount,
  });

  // 如果质检通过，生成配图（使用 WriteNode 生成的 imagePrompts）
  if (state.textQualityReport?.passed) {
    logger.info('Text quality check passed, proceeding to image generation', {
      taskId: state.taskId,
      score: state.textQualityReport.score,
      imagePromptCount: state.imagePrompts?.length || 0,
    });
    return 'generate_image';  // 使用 WriteNode 生成的 imagePrompts 生成图片
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

  // 如果质检通过，进行后处理（替换图片占位符）
  if (state.imageQualityReport?.passed) {
    logger.info('Image quality check passed, proceeding to post-processing', {
      taskId: state.taskId,
      score: state.imageQualityReport.score,
      imageCount: state.images?.length || 0,
    });
    return 'post_process';  // 后处理节点替换图片占位符
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

      const nextState = {
        ...state,
        ...result,
        currentStep: nodeName,
      } as unknown as WorkflowState;

      // 保存检查点
      const nextVersion = await checkpointManager.saveCheckpoint(
        state.taskId,
        nodeName,
        nextState
      );

      // 更新步骤
      return {
        ...result,
        currentStep: nodeName,
        ...(nextVersion !== null ? { version: nextVersion } : {}),
      } as unknown as Partial<WorkflowState>;
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
export function createContentCreatorGraph(): any {
  logger.info('Creating content creator workflow graph');

  // 创建节点实例（获取 LangGraph 节点函数）
  const searchNodeFn = searchNode.toLangGraphNode();
  const organizeNodeFn = organizeNode.toLangGraphNode();
  const writeNodeFn = writeNode.toLangGraphNode();
  const checkTextNodeFn = checkTextNode.toLangGraphNode();
  const generateImageNodeFn = generateImageNode.toLangGraphNode();
  const checkImageNodeFn = checkImageNode.toLangGraphNode();
  const postProcessNodeFn = postProcessNode.toLangGraphNode();

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
    'generate_image',
    generateImageNodeFn
  );
  const checkImageNodeWithCheckpoint = wrapNodeWithCheckpoint(
    'checkImage',
    checkImageNodeFn
  );
  const postProcessNodeWithCheckpoint = wrapNodeWithCheckpoint(
    'post_process',
    postProcessNodeFn
  );

  // 创建 StateGraph
  const graph = new StateGraph<WorkflowState>({
    channels: {
      // 输入参数（BaseWorkflowState）
      taskId: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      workflowType: {
        default: () => 'content-creator' as const,
        reducer: (x?: 'content-creator', y?: 'content-creator') => (y ?? x ?? 'content-creator') as 'content-creator',
      },
      mode: {
        default: () => ExecutionMode.SYNC,
        reducer: (x?: ExecutionMode, y?: ExecutionMode) => y ?? x ?? ExecutionMode.SYNC,
      },
      retryCount: {
        default: () => 0,
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 0),
      },

      // 输入参数（ContentCreator 特定）
      topic: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      requirements: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      hardConstraints: {
        default: () => ({}),
        reducer: (x?: any, y?: any) => y ?? x ?? {},
      },

      // 流程数据
      searchQuery: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      searchResults: {
        default: () => undefined,
        reducer: (x?: any[], y?: any[]) => y ?? x,
      },
      organizedInfo: {
        default: () => undefined,
        reducer: (x?: any, y?: any) => y ?? x,
      },
      articleContent: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      images: {
        default: () => undefined,
        reducer: (x?: any[], y?: any[]) => y ?? x,
      },
      imagePrompts: {
        default: () => undefined,
        reducer: (x?: string[], y?: string[]) => y ?? x,
      },
      finalArticleContent: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      previousContent: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      previousImages: {
        default: () => undefined,
        reducer: (x?: any[], y?: any[]) => y ?? x,
      },

      // 质检数据
      textQualityReport: {
        default: () => undefined,
        reducer: (x?: any, y?: any) => y ?? x,
      },
      imageQualityReport: {
        default: () => undefined,
        reducer: (x?: any, y?: any) => y ?? x,
      },

      // 控制数据
      currentStep: {
        default: () => 'start',
        reducer: (x?: string, y?: string) => y ?? x ?? 'start',
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
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 1),
      },
      startTime: {
        default: () => Date.now(),
        reducer: (x?: number, y?: number) => y ?? x ?? Date.now(),
      },
    },
  }) as any;

  // 添加节点
  graph.addNode('search', searchNodeWithCheckpoint);
  graph.addNode('organize', organizeNodeWithCheckpoint);
  graph.addNode('write', writeNodeWithCheckpoint);
  graph.addNode('checkText', checkTextNodeWithCheckpoint);
  graph.addNode('generate_image', generateImageNodeWithCheckpoint);
  graph.addNode('checkImage', checkImageNodeWithCheckpoint);
  graph.addNode('post_process', postProcessNodeWithCheckpoint);

  // 设置入口点和边（线性流程）
  graph.addEdge(START as any, 'search');
  graph.addEdge('search' as any, 'organize');
  graph.addEdge('organize' as any, 'write');
  graph.addEdge('write' as any, 'checkText');
  // 注意: checkText 的出边由条件边控制，不要添加默认边
  // 阶段二优化：checkText 直接路由到 checkImage，checkImage 会自动生成图片
  // graph.addEdge('checkText', 'checkImage'); // 已通过条件边实现
  // generate_image 节点只在 checkImage 失败重试时使用
  graph.addEdge('generate_image' as any, 'checkImage');
  // 注意: checkImage 的出边由条件边控制，不要添加默认边
  // graph.addEdge('checkImage', END); // 已移除，避免与条件边冲突

  // 后处理节点到结束的边
  graph.addEdge('post_process' as any, END);

  // 添加条件边（文本质检后的路由）
  graph.addConditionalEdges(
    'checkText' as any,
    routeAfterCheckText,
    {
      write: 'write',
      generate_image: 'generate_image',  // 使用 WriteNode 生成的 imagePrompts 生成图片
    }
  );

  // 添加条件边（配图质检后的路由）
  graph.addConditionalEdges(
    'checkImage' as any,
    routeAfterCheckImage,
    {
      generate_image: 'generate_image',
      post_process: 'post_process',  // 后处理节点替换图片占位符
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
  const postProcessNodeFn = postProcessNode.toLangGraphNode();

  // 创建 StateGraph
  const graph = new StateGraph<WorkflowState>({
    channels: {
      // 输入参数（BaseWorkflowState）
      taskId: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      workflowType: {
        default: () => 'content-creator' as const,
        reducer: (x?: 'content-creator', y?: 'content-creator') => (y ?? x ?? 'content-creator') as 'content-creator',
      },
      mode: {
        default: () => ExecutionMode.SYNC,
        reducer: (x?: ExecutionMode, y?: ExecutionMode) => y ?? x ?? ExecutionMode.SYNC,
      },
      retryCount: {
        default: () => 0,
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 0),
      },

      // 输入参数（ContentCreator 特定）
      topic: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      requirements: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      hardConstraints: {
        default: () => ({}),
        reducer: (x?: any, y?: any) => y ?? x ?? {},
      },

      // 流程数据
      searchQuery: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      searchResults: {
        default: () => undefined,
        reducer: (x?: any[], y?: any[]) => y ?? x,
      },
      organizedInfo: {
        default: () => undefined,
        reducer: (x?: any, y?: any) => y ?? x,
      },
      articleContent: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      images: {
        default: () => undefined,
        reducer: (x?: any[], y?: any[]) => y ?? x,
      },
      imagePrompts: {
        default: () => undefined,
        reducer: (x?: string[], y?: string[]) => y ?? x,
      },
      finalArticleContent: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      previousContent: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      textQualityReport: {
        default: () => undefined,
        reducer: (x?: any, y?: any) => y ?? x,
      },
      imageQualityReport: {
        default: () => undefined,
        reducer: (x?: any, y?: any) => y ?? x,
      },

      // 控制数据
      currentStep: {
        default: () => 'start',
        reducer: (x?: string, y?: string) => y ?? x ?? 'start',
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
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 1),
      },
      startTime: {
        default: () => Date.now(),
        reducer: (x?: number, y?: number) => y ?? x ?? Date.now(),
      },
      endTime: {
        default: () => undefined,
        reducer: (x?: number, y?: number) => y ?? x,
      },
      error: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      metadata: {
        default: () => undefined,
        reducer: (x?: any, y?: any) => y ?? x,
      },
    },
  }) as any;

  // 添加节点
  graph.addNode('search', searchNodeFn);
  graph.addNode('organize', organizeNodeFn);
  graph.addNode('write', writeNodeFn);
  graph.addNode('checkText', checkTextNodeFn);
  graph.addNode('generate_image', generateImageNodeFn);
  graph.addNode('checkImage', checkImageNodeFn);
  graph.addNode('post_process', postProcessNodeFn);

  // 设置入口点和边
  graph.addEdge(START as any, 'search');
  graph.addEdge('search' as any, 'organize');
  graph.addEdge('organize' as any, 'write');
  graph.addEdge('write' as any, 'checkText');
  // 注意: checkText 的出边由条件边控制，不要添加默认边
  // 优化后流程：checkText → generate_image → checkImage
  // graph.addEdge('checkText', 'generate_image'); // 已通过条件边实现
  graph.addEdge('generate_image' as any, 'checkImage');
  // 注意: checkImage 的出边由条件边控制，不要添加默认边
  // graph.addEdge('checkImage', END); // 已移除，避免与条件边冲突

  // 后处理节点到结束的边
  graph.addEdge('post_process' as any, END);

  // 添加条件边
  graph.addConditionalEdges('checkText' as any, routeAfterCheckText, {
    write: 'write',
    generate_image: 'generate_image',  // 使用 WriteNode 生成的 imagePrompts 生成图片
  });

  graph.addConditionalEdges('checkImage' as any, routeAfterCheckImage, {
    generate_image: 'generate_image',
    post_process: 'post_process',  // 后处理节点替换图片占位符
  });

  logger.info('Simple content creator workflow graph created successfully');

  return graph.compile();
}
