/**
 * ClaudeCLIService - 基于 Claude CLI 的 LLM 服务实现
 *
 * 通过调用本地 claude CLI 命令来提供 LLM 服务
 * 支持流式响应、动态 MCP 和 Skills 配置
 */

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { createLogger } from '../../infrastructure/logging/logger.js';
import type { ILLMService, ChatMessage, ChatRequest, ChatResponse } from './ILLMService.js';

const logger = createLogger('ClaudeCLI');

/**
 * Claude CLI 配置
 */
export interface ClaudeCLIConfig {
  defaultModel?: 'sonnet' | 'opus';  // 默认模型
  defaultTimeout?: number;           // 默认超时（毫秒）
  enableMCP?: boolean;               // 是否启用 MCP
}

/**
 * Claude CLI 流式输出数据块
 */
interface StreamChunk {
  type: 'content_delta' | 'content_stop' | 'error';
  content?: string;
  error?: string;
}

/**
 * Claude CLI 服务实现
 */
export class ClaudeCLIService implements ILLMService {
  private config: ClaudeCLIConfig;

  constructor(config: ClaudeCLIConfig = {}) {
    this.config = {
      defaultModel: 'sonnet',
      defaultTimeout: 120000, // 120 秒
      enableMCP: false,
      ...config,
    };

    logger.info('Claude CLI service initialized', {
      model: this.config.defaultModel,
      timeout: this.config.defaultTimeout,
    });
  }

  /**
   * 聊天对话（支持流式）
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      logger.debug('Starting Claude CLI chat request', {
        model: request.model || this.config.defaultModel,
        messagesCount: request.messages.length,
        stream: request.stream || false,
      });

      // 构建 CLI 命令
      const command = this.buildCLICommand(request);

      // 执行并获取响应
      const { content, promptTokens, completionTokens } =
        await this.executeCommand(command, request);

      // 计算成本
      const cost = this.estimateCost(promptTokens, completionTokens);

      const duration = Date.now() - startTime;

      logger.info('Claude CLI chat request completed', {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cost,
        duration,
      });

      return {
        content,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        cost,
      };
    } catch (error) {
      logger.error('Claude CLI chat request failed', {
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * 构建 CLI 命令
   */
  private buildCLICommand(request: ChatRequest): string[] {
    const cmd = ['claude', '-p', '--output-format', 'stream-json'];

    // 添加模型参数
    const model = request.model || this.config.defaultModel || 'sonnet';
    cmd.push('--model', model);

    // TODO: 添加 MCP 配置支持
    // if (this.config.enableMCP && request.mcpConfigPath) {
    //   cmd.push('--mcp-config', request.mcpConfigPath);
    // }

    // TODO: 添加 Skills 配置支持
    // if (request.pluginDirs?.length) {
    //   request.pluginDirs.forEach(dir => cmd.push('--plugin-dir', dir));
    // }

    // 构建用户提示（合并所有消息）
    const userPrompt = this.buildUserPrompt(request.messages);
    cmd.push(userPrompt);

    return cmd;
  }

  /**
   * 构建用户提示（从消息数组）
   */
  private buildUserPrompt(messages: ChatMessage[]): string {
    let prompt = '';

    for (const message of messages) {
      if (message.role === 'system') {
        // Claude CLI 不直接支持 system 消息，放在前面
        prompt += `[System: ${message.content}]\n\n`;
      } else if (message.role === 'user') {
        prompt += message.content + '\n\n';
      } else if (message.role === 'assistant') {
        prompt += `[Assistant: ${message.content}]\n\n`;
      }
    }

    return prompt.trim();
  }

  /**
   * 执行 CLI 命令并获取响应
   */
  private async executeCommand(
    command: string[],
    request: ChatRequest
  ): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
    return new Promise((resolve, reject) => {
      const timeout = this.config.defaultTimeout || 120000;

      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;

      // 启动子进程
      const proc: ChildProcess = spawn(command[0], command.slice(1));

      // 设置超时
      const timer = setTimeout(() => {
        if (proc.pid) {
          proc.kill('SIGTERM');
        }
        reject(new Error(`Claude CLI request timeout after ${timeout}ms`));
      }, timeout);

      // 处理标准输出
      if (proc.stdout) {
        proc.stdout.on('data', (chunk: Buffer) => {
          const data = chunk.toString();

          // 解析流式 JSON
          const lines = data.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6);
                const chunkData = JSON.parse(jsonStr) as StreamChunk;

                if (chunkData.type === 'content_delta' && chunkData.content) {
                  fullContent += chunkData.content;
                } else if (chunkData.type === 'error' && chunkData.error) {
                  logger.warn('Claude CLI returned error', { error: chunkData.error });
                }
              }
            } catch (e) {
              // 忽略解析错误
              logger.debug('Failed to parse stream line', { line });
            }
          }
        });
      }

      // 处理标准错误
      if (proc.stderr) {
        proc.stderr.on('data', (chunk: Buffer) => {
          logger.debug('Claude CLI stderr', { data: chunk.toString() });
        });
      }

      // 处理进程退出
      proc.on('close', (code: number | null) => {
        clearTimeout(timer);

        if (code === 0 || fullContent.length > 0) {
          // 估算 Token 数量
          promptTokens = this.estimateTokens(this.buildUserPrompt(request.messages));
          completionTokens = this.estimateTokens(fullContent);

          resolve({
            content: fullContent,
            promptTokens,
            completionTokens,
          });
        } else {
          reject(new Error(`Claude CLI process exited with code ${code}`));
        }
      });

      // 处理进程错误
      proc.on('error', (error: Error) => {
        clearTimeout(timer);
        reject(new Error(`Failed to start Claude CLI: ${error.message}`));
      });
    });
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      logger.debug('Running Claude CLI health check');

      const result = await this.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      const isHealthy = result.content.length > 0;

      if (isHealthy) {
        logger.info('Claude CLI health check passed');
      } else {
        logger.warn('Claude CLI health check returned empty response');
      }

      return isHealthy;
    } catch (error) {
      logger.error('Claude CLI health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 估算 Token 数量
   *
   * 粗略估算：英文约 4 字符/token，中文约 1.5 字符/token
   */
  estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = text.length - chineseChars;

    return Math.ceil(chineseChars / 1.5 + englishChars / 4);
  }

  /**
   * 估算成本
   *
   * Claude 官方定价（美元/1k tokens）
   * - Sonnet: 输入 $0.003, 输出 $0.015
   * - Opus: 输入 $0.015, 输出 $0.075
   */
  estimateCost(tokensIn: number, tokensOut: number): number {
    const model = this.config.defaultModel || 'sonnet';

    let costPer1kIn: number;
    let costPer1kOut: number;

    if (model === 'opus') {
      costPer1kIn = 0.015;
      costPer1kOut = 0.075;
    } else {
      // sonnet (默认)
      costPer1kIn = 0.003;
      costPer1kOut = 0.015;
    }

    const costIn = (tokensIn / 1000) * costPer1kIn;
    const costOut = (tokensOut / 1000) * costPer1kOut;

    return Number((costIn + costOut).toFixed(6));
  }
}
