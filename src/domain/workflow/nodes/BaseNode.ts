/**
 * BaseNode - 节点基类
 *
 * 所有工作流节点的基类，提供通用功能：
 * - 错误处理
 * - Token 记录
 * - 日志记录
 * - 状态验证
 * - 重试支持
 */

import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('BaseNode');

/**
 * 节点执行结果
 */
export interface NodeResult<TState extends BaseWorkflowState = BaseWorkflowState> {
  success: boolean;
  stateUpdate: Partial<TState>;
  error?: string;
  tokenUsage?: {
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
  };
  duration: number; // 执行时长（毫秒）
}

/**
 * 节点配置
 */
export interface NodeConfig {
  name: string;              // 节点名称
  retryCount?: number;       // 重试次数（默认 0）
  timeout?: number;          // 超时时间（毫秒，默认 60000）
}

/**
 * 节点基类
 */
export abstract class BaseNode<TState extends BaseWorkflowState = BaseWorkflowState> {
  protected readonly name: string;
  protected readonly retryCount: number;
  protected readonly timeout: number;
  protected readonly logger;

  constructor(config: NodeConfig) {
    this.name = config.name;
    this.retryCount = config.retryCount ?? 0;
    this.timeout = config.timeout ?? 300000; // 300 秒默认超时
    this.logger = createLogger(`Node:${this.name}`);
  }

  /**
   * 执行节点（带重试和错误处理）
   *
   * @param state - 当前工作流状态
   * @returns 节点执行结果
   */
  async execute(state: TState): Promise<NodeResult<TState>> {
    const startTime = Date.now();
    const attempt = this.getAttemptCount(state);

    this.logger.info('Node execution started', {
      nodeId: this.name,
      taskId: state.taskId,
      attempt: attempt + 1,
    });

    try {
      // 验证状态
      this.validateState(state);

      // 执行节点逻辑（带超时）
      const stateUpdate = await this.executeWithTimeout(state);

      // 计算执行时长
      const duration = Date.now() - startTime;

      // 记录成功日志
      this.logger.info('Node execution completed', {
        nodeId: this.name,
        taskId: state.taskId,
        duration,
      });

      // 返回结果
      return {
        success: true,
        stateUpdate: {
          ...stateUpdate,
          currentStep: this.name,
        },
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 记录错误日志
      this.logger.error('Node execution failed', {
        nodeId: this.name,
        taskId: state.taskId,
        error: errorMessage,
        duration,
      });

      // 返回错误结果
      return {
        success: false,
        stateUpdate: {
          error: errorMessage,
        } as unknown as Partial<TState>,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * 抽象方法：节点具体逻辑（由子类实现）
   *
   * @param state - 当前工作流状态
   * @returns 状态更新（Partial<WorkflowState>）
   */
  protected abstract executeLogic(state: TState): Promise<Partial<TState>>;

  /**
   * 验证状态（可选，由子类重写）
   *
   * @param state - 当前工作流状态
   * @throws Error 如果状态无效
   */
  protected validateState(state: TState): void {
    // 默认验证：检查是否有错误
    if (state.error) {
      throw new Error(`Previous error: ${state.error}`);
    }
  }

  /**
   * 获取当前尝试次数（可选，由子类重写）
   *
   * @param state - 当前工作流状态
   * @returns 尝试次数
   */
  protected getAttemptCount(_state: TState): number {
    // 默认：返回 0
    // 子类可以根据 state 中的重试计数器返回实际值
    return 0;
  }

  /**
   * 执行节点逻辑（带超时控制）
   *
   * @param state - 当前工作流状态
   * @returns 状态更新
   */
  private async executeWithTimeout(state: TState): Promise<Partial<TState>> {
    return Promise.race([
      this.executeLogic(state),
      this.createTimeoutPromise(),
    ]);
  }

  /**
   * 创建超时 Promise
   */
  private createTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Node timeout: ${this.name} exceeded ${this.timeout}ms`));
      }, this.timeout);
    });
  }

  /**
   * 记录 LLM Token 使用（可选，由子类调用）
   *
   * @param state - 工作流状态
   * @param tokensIn - 输入 Token 数量
   * @param tokensOut - 输出 Token 数量
   */
  protected recordTokenUsage(
    state: TState,
    tokensIn: number,
    tokensOut: number
  ): void {
    this.logger.debug('Token usage recorded', {
      nodeId: this.name,
      taskId: state.taskId,
      tokensIn,
      tokensOut,
      totalTokens: tokensIn + tokensOut,
    });

    // TODO: 保存到数据库（后续实现）
    // await tokenUsageRepo.create({
    //   taskId: state.taskId,
    //   traceId: generateTraceId(),
    //   stepName: this.name,
    //   apiName: 'deepseek',
    //   modelName: 'deepseek-chat',
    //   tokensIn,
    //   tokensOut,
    //   totalTokens: tokensIn + tokensOut,
    //   ...
    // });
  }

  /**
   * 创建状态更新辅助函数
   */
  protected updateState<T extends keyof TState>(
    field: T,
    value: TState[T]
  ): Partial<TState> {
    return { [field]: value } as unknown as Partial<TState>;
  }

  /**
   * 从 LLM 输出中提取 JSON
   *
   * 处理以下情况：
   * 1. Markdown 代码块（```json 或 ```）
   * 2. JSON 前后的额外文字说明
   * 3. 提取第一个完整的 JSON 对象
   *
   * @param content - LLM 返回的内容
   * @returns 提取出的 JSON 字符串
   * @throws Error 如果无法找到有效的 JSON
   */
  protected extractJSON(content: string): string {
    let text = content.trim();

    // 1. 去除 Markdown 代码块标记
    if (text.startsWith('```json')) {
      text = text.slice(7);
    } else if (text.startsWith('```')) {
      text = text.slice(3);
    }
    if (text.endsWith('```')) {
      text = text.slice(0, -3);
    }
    text = text.trim();

    // 2. 尝试直接解析（如果内容本身就是纯 JSON）
    try {
      JSON.parse(text);
      return text;
    } catch {
      // 不是纯 JSON，继续尝试提取
    }

    // 3. 查找第一个 { 或 [ 的位置
    const startIndex = text.indexOf('{');
    const arrayIndex = text.indexOf('[');

    let jsonStart = -1;
    if (startIndex !== -1 && arrayIndex !== -1) {
      jsonStart = Math.min(startIndex, arrayIndex);
    } else if (startIndex !== -1) {
      jsonStart = startIndex;
    } else if (arrayIndex !== -1) {
      jsonStart = arrayIndex;
    }

    if (jsonStart === -1) {
      throw new Error('No JSON object found in content');
    }

    // 4. 查找匹配的结束括号
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEnd = -1;

    for (let i = jsonStart; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{' || char === '[') {
          bracketCount++;
        } else if (char === '}' || char === ']') {
          bracketCount--;
          if (bracketCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    if (jsonEnd === -1) {
      throw new Error('Incomplete JSON object found');
    }

    const extracted = text.substring(jsonStart, jsonEnd);

    // 5. 验证提取的内容是否是有效的 JSON
    try {
      JSON.parse(extracted);
      return extracted;
    } catch (error) {
      throw new Error(`Extracted content is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 转换为 LangGraph 节点
   *
   * @returns LangGraph 节点函数
   */
  toLangGraphNode(): (state: TState) => Promise<Partial<TState>> {
    return async (state: TState) => {
      logger.debug(`Node ${this.name} received state`, {
        taskId: state.taskId,
        stateKeys: Object.keys(state),
      });

      const result = await this.execute(state);

      if (!result.success) {
        throw new Error(result.error || 'Node execution failed');
      }

      return result.stateUpdate;
    };
  }
}

/**
 * 节点执行上下文
 *
 * 提供额外的工具和方法供节点使用
 */
export class NodeContext {
  protected readonly logger;

  constructor(nodeName: string) {
    this.logger = createLogger(`Node:${nodeName}`);
  }

  /**
   * 生成 Trace ID（用于链路追踪）
   */
  generateTraceId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 延迟执行（毫秒）
   */
  async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 计算文本的 Token 数量（估算）
   */
  estimateTokens(text: string): number {
    // 粗略估算：英文约 4 字符/token，中文约 1.5 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = text.length - chineseChars;

    return Math.ceil(chineseChars / 1.5 + englishChars / 4);
  }

  /**
   * 截断文本到指定 Token 数量
   */
  truncateToTokens(text: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokens(text);

    if (estimatedTokens <= maxTokens) {
      return text;
    }

    // 粗略截断：按比例缩短
    const ratio = maxTokens / estimatedTokens;
    const truncatedLength = Math.floor(text.length * ratio);
    return text.substring(0, truncatedLength);
  }

  /**
   * 安全地解析 JSON
   */
  safeParseJSON<T>(json: string, fallback: T): T {
    try {
      return JSON.parse(json) as T;
    } catch (error) {
      this.logger.warn('Failed to parse JSON, using fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    }
  }

  /**
   * 从 LLM 输出中提取 JSON
   *
   * 处理以下情况：
   * 1. Markdown 代码块（```json 或 ```）
   * 2. JSON 前后的额外文字说明
   * 3. 提取第一个完整的 JSON 对象
   *
   * @param content - LLM 返回的内容
   * @returns 提取出的 JSON 字符串
   * @throws Error 如果无法找到有效的 JSON
   */
  protected extractJSON(content: string): string {
    let text = content.trim();

    // 1. 去除 Markdown 代码块标记
    if (text.startsWith('```json')) {
      text = text.slice(7);
    } else if (text.startsWith('```')) {
      text = text.slice(3);
    }
    if (text.endsWith('```')) {
      text = text.slice(0, -3);
    }
    text = text.trim();

    // 2. 尝试直接解析（如果内容本身就是纯 JSON）
    try {
      JSON.parse(text);
      return text;
    } catch {
      // 不是纯 JSON，继续尝试提取
    }

    // 3. 查找第一个 { 或 [ 的位置
    const startIndex = text.indexOf('{');
    const arrayIndex = text.indexOf('[');

    let jsonStart = -1;
    if (startIndex !== -1 && arrayIndex !== -1) {
      jsonStart = Math.min(startIndex, arrayIndex);
    } else if (startIndex !== -1) {
      jsonStart = startIndex;
    } else if (arrayIndex !== -1) {
      jsonStart = arrayIndex;
    }

    if (jsonStart === -1) {
      throw new Error('No JSON object found in content');
    }

    // 4. 查找匹配的结束括号
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEnd = -1;

    for (let i = jsonStart; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{' || char === '[') {
          bracketCount++;
        } else if (char === '}' || char === ']') {
          bracketCount--;
          if (bracketCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    if (jsonEnd === -1) {
      throw new Error('Incomplete JSON object found');
    }

    const extracted = text.substring(jsonStart, jsonEnd);

    // 5. 验证提取的内容是否是有效的 JSON
    try {
      JSON.parse(extracted);
      return extracted;
    } catch (error) {
      throw new Error(`Extracted content is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 格式化错误消息
   */
  formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
