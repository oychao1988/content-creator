/**
 * ContentCreatorAgentWorkflow - AI Agent 内容创作工作流
 *
 * 基于 LangGraph ReAct Agent 实现的智能内容创作工作流
 * 使用 LLM 驱动的工具选择，提供更灵活的内容生成能力
 *
 * 核心特性：
 * - 使用 createReactAgent 创建 ReAct 模式 Agent
 * - 集成搜索、写作、图片生成三个核心工具
 * - LLM 动态决策工具调用顺序和参数
 * - 与现有 LLM 服务架构完全兼容
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type {
  WorkflowFactory,
  WorkflowGraph,
  WorkflowParams,
  WorkflowMetadata,
} from './WorkflowRegistry.js';
import type { BaseWorkflowState } from './BaseWorkflowState.js';
import { WorkflowStateFactory } from './BaseWorkflowState.js';
import { LLMServiceFactory } from '../../services/llm/LLMServiceFactory.js';
import { searchTool, writeTool, generateImageTool } from './tools/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('ContentCreatorAgent');

/**
 * Agent 状态定义
 *
 * 扩展 BaseWorkflowState，添加 Agent 特有的字段
 */
export interface AgentState extends BaseWorkflowState {
  // ========== 输入参数 ==========
  topic: string;                          // 主题
  requirements: string;                   // 要求

  // ========== Agent 交互 ==========
  agentMessages: Array<{                  // Agent 对话历史
    role: string;                         // 角色（user/assistant/system）
    content: string;                      // 内容
  }>;

  // ========== 中间结果 ==========
  searchResults?: any;                    // 搜索结果
  articleContent?: string;                // 文章内容
  images?: any[];                         // 生成的图片

  // ========== 扩展字段 ==========
  targetAudience?: string;                // 目标受众（可选）
  tone?: string;                          // 语气（可选）
  imageSize?: string;                     // 图片尺寸（可选）
}

/**
 * LangChain 兼容的 LLM 接口
 *
 * 适配器模式：将现有的 ILLMService 包装为 LangChain 期望的接口
 */
interface LangChainCompatibleLLM {
  /**
   * 调用 LLM（LangChain 标准接口）
   */
  invoke(messages: any[]): Promise<{
    content: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;

  /**
   * 绑定工具（LangChain 标准接口）
   *
   * 注：当前实现不需要真正绑定工具，因为工具是通过 createReactAgent 单独传入的
   */
  bind(tools: any[]): LangChainCompatibleLLM;

  /**
   * 流式调用（可选，用于流式响应）
   */
  stream?(messages: any[]): AsyncIterable<{
    content: string;
  }>;
}

/**
 * ContentCreatorAgent Workflow
 *
 * 基于 LangGraph ReAct Agent 实现的内容创作工作流
 * 实现 WorkflowFactory 接口，可注册到 WorkflowRegistry
 */
export class ContentCreatorAgentWorkflow implements WorkflowFactory<AgentState> {
  // ========== WorkflowFactory 接口实现 ==========

  readonly type = 'content-creator-agent';
  readonly version = '1.0.0';
  readonly name = 'Content Creator Agent';
  readonly description =
    'AI Agent-powered content creation using LangChain ReAct pattern';

  /**
   * 创建工作流图（核心方法）
   *
   * 使用 createReactAgent 创建 ReAct Agent
   * Agent 会根据 System Prompt 和用户输入，自主决定调用哪些工具
   *
   * @returns 编译后的工作流图
   */
  createGraph(): WorkflowGraph {
    logger.info('Creating content-creator-agent workflow graph');

    try {
      // 创建 LangChain 兼容的 LLM
      const llm = this.createLangChainCompatibleLLM();

      // 定义工具集
      const tools = [searchTool, writeTool, generateImageTool];

      logger.debug('Agent tools configured', {
        toolCount: tools.length,
        toolNames: tools.map((t: any) => t.name),
      });

      // System Prompt - 定义 Agent 的角色和行为
      const systemPrompt = `你是一个专业的内容创作助手。你的任务是根据用户需求创建高质量的内容。

可用工具：
1. search_content - 搜索网络信息，收集背景资料和参考内容
2. write_content - 基于主题和要求撰写文章内容，支持 Markdown 格式
3. generate_images - 根据描述生成配图

工作流程建议：
1. 首先使用 search_content 搜索相关信息，收集可靠的参考资料
2. 然后使用 write_content 基于搜索结果撰写文章，确保内容准确、有深度
3. 最后使用 generate_images 生成与文章内容相关的配图

注意事项：
- 确保引用可靠来源
- 保持内容逻辑清晰
- 生成高质量的配图描述
- 以 Markdown 格式输出文章内容
- 包含适当的标题结构和段落组织

请始终以专业、准确的方式完成任务。`;

      // 创建 ReAct Agent
      // createReactAgent 会自动处理工具调用、推理循环等
      const agent = createReactAgent({
        llm,
        tools,
        prompt: systemPrompt,
      });

      logger.info('Content-creator-agent workflow graph created successfully', {
        agentType: 'ReAct',
        toolsConfigured: tools.length,
      });

      return agent;
    } catch (error) {
      logger.error('Failed to create agent workflow graph', error as Error);
      throw error;
    }
  }

  /**
   * 创建 LangChain 兼容的 LLM（适配器方法）
   *
   * 核心设计：
   * - 使用现有的 LLMServiceFactory 获取 LLM 服务
   * - 将 ILLMService 接口适配为 LangChain 期望的接口
   * - 保持与现有架构的完全兼容
   *
   * @returns LangChain 兼容的 LLM 对象
   */
  private createLangChainCompatibleLLM(): LangChainCompatibleLLM {
    logger.debug('Creating LangChain-compatible LLM adapter');

    // 获取现有的 LLM 服务实例
    const llmService = LLMServiceFactory.create();

    // 创建适配器
    const adapter: LangChainCompatibleLLM = {
      /**
       * invoke 方法 - LangChain 标准调用接口
       *
       * 将 LangChain 的消息格式转换为 ILLMService 的格式
       */
      invoke: async (messages: any[]) => {
        logger.debug('LLM adapter: invoke called', {
          messageCount: messages.length,
        });

        try {
          // 转换消息格式
          // LangChain 格式 -> ILLMService 格式
          const chatMessages = messages.map((m: any) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content as string,
          }));

          // 调用现有的 LLM 服务
          const result = await llmService.chat({
            messages: chatMessages,
            stream: false, // Agent 模式下使用非流式
          });

          // 返回 LangChain 期望的格式
          return {
            content: result.content,
            usage: {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens,
            },
          };
        } catch (error) {
          logger.error('LLM adapter: invoke failed', error as Error);
          throw error;
        }
      },

      /**
       * bind 方法 - LangChain 工具绑定接口
       *
       * 注：在 createReactAgent 模式下，工具是单独传入的
       * 因此这个方法只需要返回适配器本身
       */
      bind: (tools: any[]) => {
        logger.debug('LLM adapter: bind called', { toolCount: tools.length });
        // 返回适配器本身，不需要实际绑定工具
        return adapter;
      },
    };

    logger.debug('LangChain-compatible LLM adapter created');
    return adapter;
  }

  /**
   * 创建工作流状态
   *
   * @param params - 工作流参数（包含基础参数和扩展参数）
   * @returns 初始化的 Agent 状态
   */
  createState(params: WorkflowParams & {
    topic: string;
    requirements: string;
    targetAudience?: string;
    tone?: string;
    imageSize?: string;
  }): AgentState {
    logger.debug('Creating agent state', {
      taskId: params.taskId,
      topic: (params as any).topic,
    });

    try {
      // 创建基础状态
      const baseState = WorkflowStateFactory.createBaseState({
        taskId: params.taskId,
        workflowType: this.type,
        mode: params.mode,
        initialStep: 'agent_start',
      });

      // 扩展为 Agent 特定状态
      const extendedState = WorkflowStateFactory.extendState<AgentState>(
        baseState,
        {
          topic: (params as any).topic,
          requirements: (params as any).requirements,
          targetAudience: (params as any).targetAudience,
          tone: (params as any).tone,
          imageSize: (params as any).imageSize,

          // 初始化 Agent 对话历史
          agentMessages: [
            {
              role: 'user',
              content: this.buildUserPrompt(params as any),
            },
          ],
        }
      );

      logger.info('Agent state created', {
        taskId: params.taskId,
        topic: (params as any).topic,
        hasTargetAudience: !!(params as any).targetAudience,
        hasTone: !!(params as any).tone,
      });

      return extendedState;
    } catch (error) {
      logger.error('Failed to create agent state', error as Error);
      throw error;
    }
  }

  /**
   * 构建用户提示词
   *
   * @private
   */
  private buildUserPrompt(params: {
    topic: string;
    requirements: string;
    targetAudience?: string;
    tone?: string;
  }): string {
    const parts: string[] = [];

    parts.push(`主题：${params.topic}`);
    parts.push(`要求：${params.requirements}`);

    if (params.targetAudience) {
      parts.push(`目标受众：${params.targetAudience}`);
    }

    if (params.tone) {
      parts.push(`语气风格：${params.tone}`);
    }

    parts.push('\n请使用可用工具完成这个内容创作任务。');

    return parts.join('\n');
  }

  /**
   * 验证工作流参数
   *
   * @param params - 待验证的参数
   * @returns 是否有效
   */
  validateParams(params: WorkflowParams): boolean {
    logger.debug('Validating agent params', {
      taskId: params.taskId,
    });

    const hasTaskId = !!params.taskId;
    const hasTopic = !!(params as any).topic;
    const hasRequirements = !!(params as any).requirements;

    const isValid = hasTaskId && hasTopic && hasRequirements;

    if (!isValid) {
      logger.warn('Agent params validation failed', {
        hasTaskId,
        hasTopic,
        hasRequirements,
      });
    }

    return isValid;
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
      tags: ['agent', 'content-creation', 'react', 'langchain', 'ai', 'llm'],
      author: 'Oychao',
      icon: '🤖',
      requiredParams: ['taskId', 'mode', 'topic', 'requirements'],
      optionalParams: ['imageSize', 'targetAudience', 'tone'],
      examples: [
        {
          name: 'Agent 模式示例 - 科普文章',
          description: '使用 Agent 智能创建科普内容',
          params: {
            taskId: 'agent-001',
            mode: 'sync',
            topic: '量子计算原理',
            requirements: '写一篇 1500 字的科普文章，面向普通读者',
            targetAudience: '普通读者',
            tone: '科普友好',
          },
        },
        {
          name: 'Agent 模式示例 - 技术分析',
          description: '使用 Agent 创建技术分析内容',
          params: {
            taskId: 'agent-002',
            mode: 'sync',
            topic: 'React Server Components',
            requirements: '分析技术架构和最佳实践，包含代码示例',
            targetAudience: '前端开发者',
            tone: '专业深入',
          },
        },
      ],
      paramDefinitions: [
        {
          name: 'topic',
          description: '文章主题',
          type: 'string',
          required: true,
          examples: ['量子计算', '人工智能', 'Web 开发'],
        },
        {
          name: 'requirements',
          description: '创作要求',
          type: 'string',
          required: true,
          examples: [
            '写一篇 1500 字的科普文章',
            '包含实际代码示例和最佳实践',
            '面向初学者，语言通俗易懂',
          ],
        },
        {
          name: 'targetAudience',
          description: '目标受众',
          type: 'string',
          required: false,
          examples: ['普通读者', '技术人员', '决策者'],
        },
        {
          name: 'tone',
          description: '语气风格',
          type: 'string',
          required: false,
          examples: ['专业严肃', '轻松友好', '科普有趣'],
        },
        {
          name: 'imageSize',
          description: '图片尺寸（格式：WIDTHxHEIGHT）',
          type: 'string',
          required: false,
          defaultValue: '1024x1024',
          examples: ['1024x1024', '1920x1080', '800x600'],
        },
      ],
      stepNames: {
        agent_start: 'Agent 启动',
        tool_call: '工具调用',
        reasoning: '推理过程',
        complete: '任务完成',
      },
    };
  }
}

/**
 * 导出单例实例
 *
 * 使用单例模式，确保整个应用只有一个工作流实例
 */
export const contentCreatorAgentWorkflow =
  new ContentCreatorAgentWorkflow();
