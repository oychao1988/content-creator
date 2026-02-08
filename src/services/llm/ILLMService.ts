/**
 * ILLMService - 统一 LLM 服务接口
 *
 * 定义统一的 LLM 服务接口，支持多种实现方式：
 * - API 方式（如 DeepSeek、OpenAI）
 * - CLI 方式（如 Claude CLI）
 *
 * 所有 LLM 服务实现必须实现此接口
 */

/**
 * Chat 消息
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;      // 工具调用 ID（role='tool' 时使用）
  toolCalls?: ToolCall[];   // 工具调用列表（role='assistant' 时使用）
}

/**
 * 工具定义
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>; // JSON Schema 格式的参数定义
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>; // 工具参数
}

/**
 * 工具响应
 */
export interface ToolResponse {
  toolCallId: string;
  content: string;
}

/**
 * Chat 请求参数
 */
export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: Tool[];          // 可用工具列表
  taskId?: string;          // 任务 ID（用于 Token 记录）
  stepName?: string;         // 步骤名称（用于 Token 记录）
}

/**
 * Chat 响应（统一格式）
 */
export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];   // 如果 LLM 调用了工具
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
}

/**
 * LLM 服务统一接口
 *
 * 所有 LLM 服务实现（API、CLI）必须实现此接口
 */
export interface ILLMService {
  /**
   * 聊天对话（支持流式）
   *
   * @param request - 聊天请求参数
   * @returns 聊天响应，包含内容、Token 使用情况和成本
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * 健康检查
   *
   * @returns 服务是否可用
   */
  healthCheck(): Promise<boolean>;

  /**
   * 估算 Token 数量
   *
   * @param text - 要估算的文本
   * @returns 估算的 Token 数量
   */
  estimateTokens(text: string): number;

  /**
   * 估算成本
   *
   * @param tokensIn - 输入 Token 数量
   * @param tokensOut - 输出 Token 数量
   * @returns 估算的成本（元）
   */
  estimateCost(tokensIn: number, tokensOut: number): number;
}
