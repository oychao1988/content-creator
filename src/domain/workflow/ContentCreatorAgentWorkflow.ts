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
import { AIMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
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
 *
 * 注意：LangGraph 的 ReAct Agent 期望状态中有 `messages` 字段
 */
export interface AgentState extends BaseWorkflowState {
  // ========== 输入参数 ==========
  topic: string;                          // 主题
  requirements: string;                   // 要求

  // ========== Agent 消息（必须使用 messages 字段名）==========
  messages: Array<any>;                   // LangChain 消息数组（Agent 会自动管理）

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
      const tools = [searchTool, writeTool];

      logger.debug('Agent tools configured', {
        toolCount: tools.length,
        toolNames: tools.map((t: any) => t.name),
      });

      // System Prompt - 定义 Agent 的角色和行为
      const systemPrompt = `你是一个专业的内容创作助手。你的任务是根据用户需求创建高质量的内容。

【核心原则】
1. **限制搜索次数**：最多进行2-3次搜索，搜索后立即调用write_content
2. **必须调用工具**：严禁直接输出文本，所有操作必须通过工具完成
3. **搜索→写作流程**：搜索后必须调用write_content，没有其他选择

可用工具：
1. search_content - 搜索网络信息
   参数：query（搜索关键词）
   限制：最多使用2-3次

2. write_content - 撰写文章内容（这是完成任务的唯一方式）
   必需参数：
   * topic：文章主题（从用户输入获取）
   * requirements：写作要求（从用户输入获取）
   可选参数：
   * context：搜索结果摘要（如果进行了搜索）

【执行流程】
第1步：进行1-3次搜索（每次搜索不同角度的信息）
第2步：**立即**调用write_content工具，传递以下参数：
  - topic: 用户提供的主题
  - requirements: 用户提供的写作要求
  - context: 简要总结搜索结果（可选，但建议提供）
第3步：任务完成

【重要示例】
用户输入：主题="TypeScript"，要求="写一篇800字介绍"

正确的执行序列：
1. {"tool":"search_content","arguments":{"query":"TypeScript 类型系统"}}
2. {"tool":"search_content","arguments":{"query":"TypeScript 优势特点"}}
3. {"tool":"write_content","arguments":{"topic":"TypeScript","requirements":"写一篇800字介绍","context":"TypeScript是微软开发的...（搜索结果摘要）"}}

错误的执行：
❌ 搜索5次以上
❌ 搜索后不调用write_content
❌ 直接输出文章文本而不调用工具
❌ 说"我已收集足够信息，现在开始写作"（应该直接调用工具）

【关键点】
- 搜索2-3次后，立即停止搜索并调用write_content
- 不要担心context参数太简单，简单的总结即可
- write_content是完成任务的唯一途径
- 任何直接输出文本的行为都是错误的

现在开始执行任务！记住：搜索2-3次后必须调用write_content。`;

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
   * - 将 ILLMService 接口适配为 LangChain 期望的 BaseChatModel 接口
   * - 保持与现有架构的完全兼容
   *
   * @returns LangChain 兼容的 LLM 对象
   */
  private createLangChainCompatibleLLM(): BaseChatModel {
    logger.debug('Creating LangChain-compatible LLM adapter');

    // 获取现有的 LLM 服务实例
    const llmService = LLMServiceFactory.create();

    // 创建自定义 LLM 适配器类，继承 BaseChatModel
    class CustomLLMAdapter extends BaseChatModel {
      private llmService: any;
      private tools: any[] = [];
      private toolDescriptions: string = '';

      constructor(fields: { llmService: any }) {
        super(fields);
        this.llmService = fields.llmService;
      }

      /**
       * _generate 方法 - BaseChatModel 要求实现的方法
       *
       * 将 LangChain 的消息格式转换为 ILLMService 的格式
       * 并处理工具调用
       */
      async _generate(messages: any[], options?: any) {
        logger.debug('CustomLLMAdapter._generate called', {
          messageCount: messages.length,
          hasTools: this.tools.length > 0,
          messages: messages.map((m: any) => ({
            type: m._getType?.() || typeof m,
            content: m.content?.substring(0, 100) || '(no content)',
            constructor: m.constructor?.name,
          })),
        });

        try {
          // 转换消息格式
          let chatMessages = messages.map((m: any) => {
            const messageType = m._getType();
            const validRoles = ['system', 'user', 'assistant', 'tool'];
            const role = validRoles.includes(messageType) ? messageType : 'user';

            // 对于 AIMessage，检查是否有工具调用
            if (messageType === 'assistant') {
              // tool_calls 可能在 m.tool_calls 或 m.additional_kwargs.tool_calls 中
              const toolCalls = m.tool_calls || m.additional_kwargs?.tool_calls;

              // 如果content为空或只是"(no content)"，添加占位符
              let content = m.content;
              if ((!content || content.trim().length === 0 || content === '(no content)')) {
                if (toolCalls && toolCalls.length > 0) {
                  content = `[调用工具: ${toolCalls.map((tc: any) => tc.name || tc.function?.name || 'unknown').join(', ')}]`;
                } else {
                  content = '[已处理]';
                }
              }

              const result: any = {
                role,
                content,
              };

              // 保留工具调用信息
              if (toolCalls && toolCalls.length > 0) {
                result.toolCalls = toolCalls;
              }

              return result;
            }

            return {
              role,
              content: m.content as string,
            };
          }).filter(msg => {
            // 保留有内容的消息，或者是有工具调用的 AIMessage
            if (msg.toolCalls && msg.toolCalls.length > 0) {
              return true;  // 保留有工具调用的消息
            }
            return msg.content && msg.content.trim().length > 0;
          });

          // 如果有工具，增强 system prompt
          if (this.tools.length > 0 && chatMessages.length > 0 && chatMessages[0].role === 'system') {
            chatMessages[0].content = this.enhanceSystemPrompt(chatMessages[0].content);
          }

          logger.debug('CustomLLMAdapter converted messages', {
            originalCount: messages.length,
            filteredCount: chatMessages.length,
            assistantCount: chatMessages.filter(m => m.role === 'assistant').length,
            toolCount: chatMessages.filter(m => m.role === 'tool').length,
            chatMessages: chatMessages.map((m: any) => ({
              role: m.role,
              contentLength: m.content?.length || 0,
              hasToolCalls: !!(m.toolCalls && m.toolCalls.length > 0),
            })),
          });

          // 调用 LLM 服务
          const result = await this.llmService.chat({
            messages: chatMessages,
            stream: false,
            tools: this.tools.length > 0 ? this.convertToolsToAPIFormat() : undefined,
          });

          // 解析工具调用
          let toolCalls = undefined;
          let content = result.content;

          // 优先使用 DeepSeek 返回的工具调用
          if (result.toolCalls && result.toolCalls.length > 0) {
            toolCalls = result.toolCalls.map((tc: any) => ({
              id: tc.id,
              name: tc.name,
              args: tc.arguments,
            }));
            content = ''; // 工具调用时不返回文本内容
            logger.debug('Tool calls from API', {
              count: toolCalls.length,
              tools: toolCalls.map((t: any) => t.name),
            });
          } else if (this.tools.length > 0) {
            // 如果 API 没有返回工具调用，尝试从文本中解析
            const parsed = this.parseToolCalls(result.content);
            if (parsed && parsed.length > 0) {
              toolCalls = parsed;
              content = '';
              logger.debug('Tool calls parsed from text', {
                count: parsed.length,
                tools: parsed.map(t => t.name),
              });
            }
          }

          // 返回 LangChain 期望的格式
          return {
            generations: [{
              message: new AIMessage({
                content,
                name: 'content-creator-agent',
                usage_metadata: {
                  input_tokens: result.usage.promptTokens,
                  output_tokens: result.usage.completionTokens,
                  total_tokens: result.usage.totalTokens,
                },
                response_metadata: {
                  cost: result.cost,
                },
                additional_kwargs: toolCalls ? {
                  tool_calls: toolCalls,
                } : {},
                tool_calls: toolCalls || [],
              }),
            }],
            llmOutput: {
              cost: result.cost,
            },
          };
        } catch (error) {
          logger.error('CustomLLMAdapter._generate failed', error as Error);
          throw error;
        }
      }

      /**
       * 增强 system prompt，添加工具描述
       */
      private enhanceSystemPrompt(originalPrompt: string): string {
        if (this.tools.length === 0) return originalPrompt;

        const toolDesc = this.toolDescriptions || this.buildToolDescriptions();
        return `${originalPrompt}

${toolDesc}

重要：当你需要使用工具时，请直接调用工具。不要输出 "我需要搜索" 或 "让我写一篇文章" 这样的描述，而是直接使用工具。`;
      }

      /**
       * 构建工具描述
       */
      private buildToolDescriptions(): string {
        this.toolDescriptions = this.tools.map((tool: any) => {
          const schema = tool.schema;
          const desc = schema?._rawSchema?.description || tool.description || '';
          return `- ${tool.name}: ${desc}`;
        }).join('\n');
        return this.toolDescriptions;
      }

      /**
       * 转换工具为 API 格式
       */
      private convertToolsToAPIFormat() {
        return this.tools.map((tool: any) => {
          const schema = tool.schema;
          return {
            name: tool.name,
            description: tool.description || schema?._rawSchema?.description || '',
            inputSchema: schema?._rawSchema || schema,
          };
        });
      }

      /**
       * 从响应中解析工具调用
       * 支持多种格式：
       * 1. DeepSeek/OpenAI 的原生工具调用（通过 result.toolCalls）
       * 2. 文本格式的工具调用描述
       */
      private parseToolCalls(content: string): any[] | undefined {
        // 如果响应中已经包含工具调用（DeepSeek 返回的）
        // 这里我们无法直接访问，因为已经解构了
        // 所以我们依赖文本解析作为后备方案

        // 尝试解析 JSON 格式的工具调用
        const toolCallPatterns = [
          // 模式 1: JSON 格式
          /```json\s*\n([\s\S]*?)\n```/g,
          // 模式 2: 工具调用描述
          /(?:调用|使用|调用工具)[：:]\s*(\w+)/gi,
        ];

        // 尝试提取 JSON
        const jsonMatch = /\{[\s\S]*"name"[\s\S]*\}/.exec(content);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.name && this.tools.some((t: any) => t.name === parsed.name)) {
              return [{
                id: `call_${Date.now()}`,
                name: parsed.name,
                args: parsed.arguments || parsed.parameters || parsed.args || {},
              }];
            }
          } catch {
            // JSON 解析失败，继续尝试其他模式
          }
        }

        return undefined;
      }

      /**
       * 返回 LLM 类型标识符
       */
      _llmType() {
        return 'content-creator-agent-llm';
      }

      /**
       * 绑定工具（LangGraph 需要的方法）
       *
       * 保存工具定义供后续使用
       */
      bindTools(tools: any[]) {
        logger.debug('CustomLLMAdapter: bindTools called', {
          toolCount: tools.length,
          toolNames: tools.map((t: any) => t.name),
        });
        this.tools = tools;
        this.buildToolDescriptions();
        return this;
      }
    }

    // 创建并返回适配器实例
    const adapter = new CustomLLMAdapter({ llmService });

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

          // 初始化 Agent 消息数组
          // LangGraph 的 Agent 会自动管理这个数组
          messages: [
            // 用户消息 - 包含任务要求
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

    parts.push('\n【重要】你必须按照以下步骤完成任务：');
    parts.push('1. 先调用 search_content 工具搜索1-2次');
    parts.push('2. 然后必须调用 write_content 工具生成文章');
    parts.push('3. 不要直接输出文本，只调用工具即可');

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
