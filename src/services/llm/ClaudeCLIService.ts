/**
 * ClaudeCLIService - 基于 Claude CLI 的 LLM 服务实现
 *
 * 通过调用本地 claude CLI 命令来提供 LLM 服务
 * 支持流式响应、动态 MCP 和 Skills 配置
 */

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { createLogger } from '../../infrastructure/logging/logger.js';
import { config } from '../../config/index.js';
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
  type: 'stream_event' | 'assistant' | 'result' | 'system';
  event?: {
    type: string;
    delta?: {
      type: string;
      text?: string;
    };
  };
  message?: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
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

      // 在 debug 模式下自动启用流式显示
      const shouldEnableStreamDisplay = config.logging.level === 'debug';
      if (shouldEnableStreamDisplay && request.stream && !request.enableStreamDisplay) {
        request.enableStreamDisplay = true;
        logger.debug('Auto-enabled stream display for debug mode');
      }

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
  private buildCLICommand(request: ChatRequest): { command: string[]; prompt: string } {
    const cmd = [
      'claude',
      '-p',                                    // print 模式
      '--output-format', 'stream-json',        // 流式 JSON 输出
      '--include-partial-messages',           // 包含部分消息
      '--model', request.model || this.config.defaultModel || 'sonnet',
    ];

    // TODO: 添加 MCP 配置支持
    // if (this.config.enableMCP && request.mcpConfigPath) {
    //   cmd.push('--mcp-config', request.mcpConfigPath);
    // }

    // TODO: 添加 Skills 配置支持
    // if (request.pluginDirs?.length) {
    //   request.pluginDirs.forEach(dir => cmd.push('--plugin-dir', dir));
    // }

    // 构建用户提示（合并所有消息）
    let userPrompt = this.buildUserPrompt(request.messages);

    // Claude CLI 不直接支持 --max-tokens 参数
    // 如果请求中指定了 maxTokens，在 prompt 中添加输出长度要求
    const maxTokens = request.maxTokens || 4000; // 默认 4000 tokens
    const estimatedChars = Math.round(maxTokens * 1.5); // 粗略估算：1 token ≈ 1.5 字符

    userPrompt += `\n\n⚠️ 输出长度要求：请将回复控制在 ${estimatedChars} 字符以内（约 ${maxTokens} tokens）。`;

    logger.debug('Claude CLI max tokens setting', {
      maxTokens,
      estimatedChars,
    });

    return { command: cmd, prompt: userPrompt };
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
    commandAndPrompt: { command: string[]; prompt: string },
    request: ChatRequest
  ): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
    return new Promise((resolve, reject) => {
      const timeout = this.config.defaultTimeout || 120000;

      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      const { command, prompt } = commandAndPrompt;

      // 打印完整命令（便于调试）
      const formattedCommand = [...command, `"${prompt}"`].join(' ');

      logger.info('🔧 Executing Claude CLI command', {
        command: formattedCommand,
        timeout: `${timeout}ms`,
      });

      if (request.enableStreamDisplay) {
        console.log(`\n📋 Claude CLI Command:\n   ${formattedCommand}\n`);
      }

      // 启动子进程（使用 shell 模式）
      const proc: ChildProcess = spawn(command[0] as string, command.slice(1) as string[], {
        shell: true,
        env: { ...process.env, PATH: process.env.PATH }
      });

      // 通过 stdin 写入提示词
      if (proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
      }

      // 设置超时
      const timer = setTimeout(() => {
        if (proc.pid) {
          proc.kill('SIGTERM');
        }
        reject(new Error(`Claude CLI request timeout after ${timeout}ms`));
      }, timeout);

      // 处理标准输出（流式 JSON）
      if (proc.stdout) {
        proc.stdout.on('data', (chunk: Buffer) => {
          const data = chunk.toString();
          const lines = data.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const json = JSON.parse(line) as StreamChunk;

              // 跳过系统初始化消息
              if (json.type === 'system') {
                logger.debug('Skipping system message');
                continue;
              }

              // 处理流式事件
              if (json.type === 'stream_event') {
                if (json.event?.type === 'content_block_delta' && json.event?.delta?.text) {
                  const text = json.event.delta.text;
                  fullContent += text;

                  // 实时显示流式输出
                  if (request.enableStreamDisplay && request.stream) {
                    process.stdout.write(text);
                  }
                }
              }

              // 处理完整消息（备用方案）
              else if (json.type === 'assistant' && json.message?.content) {
                const textContent = json.message.content.find((c: any) => c.type === 'text');
                if (textContent?.text) {
                  fullContent = textContent.text;
                }
              }

              // 处理最终结果（提取统计信息）
              else if (json.type === 'result') {
                if (json.usage) {
                  inputTokens = json.usage.input_tokens || 0;
                  outputTokens = json.usage.output_tokens || 0;
                }
              }
            } catch (e) {
              logger.debug('Failed to parse stream line', { line: line.substring(0, 100) });
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

        if (code !== 0 && fullContent.length === 0) {
          logger.error('Claude CLI process failed', { code });
          reject(new Error(`Claude CLI process exited with code ${code}`));
          return;
        }

        // 如果成功退出或有内容，视为成功
        if (!fullContent) {
          reject(new Error('Claude CLI returned empty response'));
          return;
        }

        // 如果启用了流式显示，打印换行符
        if (request.enableStreamDisplay && request.stream) {
          console.log(); // 换行
        }

        // 使用 CLI 返回的 token 数量（如果有），否则估算
        promptTokens = inputTokens > 0 ? inputTokens : this.estimateTokens(this.buildUserPrompt(request.messages));
        completionTokens = outputTokens > 0 ? outputTokens : this.estimateTokens(fullContent);

        resolve({
          content: fullContent,
          promptTokens,
          completionTokens,
        });
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
