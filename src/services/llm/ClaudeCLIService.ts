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
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
  type: 'system' | 'assistant' | 'result' | string;
  message?: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  result?: any;
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
        hasTools: !!(request.tools && request.tools.length > 0),
      });

      // 构建 CLI 命令
      const { command } = this.buildCLICommand(request);

      // 执行并获取响应
      const { content, promptTokens, completionTokens } =
        await this.executeCommand(command, request);

      // 计算成本
      const cost = this.estimateCost(promptTokens, completionTokens);

      // 尝试解析工具调用
      let toolCalls = undefined;
      let finalContent = content;

      if (request.tools && request.tools.length > 0) {
        const parsed = this.parseToolCallsFromContent(content, request.tools);
        if (parsed && parsed.length > 0) {
          toolCalls = parsed;
          finalContent = `[调用工具: ${parsed.map(t => t.name).join(', ')}]`;
          logger.debug('Tool calls parsed from content', {
            count: parsed.length,
            tools: parsed.map(t => t.name),
          });
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Claude CLI chat request completed', {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cost,
        hasToolCalls: !!toolCalls,
        toolCallsCount: toolCalls?.length || 0,
        duration,
      });

      return {
        content: finalContent,
        toolCalls,
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
   * 从内容中解析工具调用
   */
  private parseToolCallsFromContent(content: string, tools: any[]): any[] | undefined {
    // 尝试提取 JSON 格式的工具调用
    const jsonMatch = content.match(/```json\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);

        // 检查是否包含 tool 字段
        if (parsed.tool && tools.some(t => t.name === parsed.tool)) {
          return [{
            id: `call_${Date.now()}`,
            name: parsed.tool,
            arguments: parsed.arguments || {},
          }];
        }
      } catch {
        // JSON 解析失败，继续尝试其他格式
      }
    }

    // 尝试直接搜索 JSON 对象
    const directJsonMatch = content.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
    if (directJsonMatch) {
      try {
        const parsed = JSON.parse(directJsonMatch[0]);
        if (parsed.tool && tools.some(t => t.name === parsed.tool)) {
          return [{
            id: `call_${Date.now()}`,
            name: parsed.tool,
            arguments: parsed.arguments || {},
          }];
        }
      } catch {
        // 忽略解析错误
      }
    }

    return undefined;
  }

  /**
   * 构建 CLI 命令
   */
  private buildCLICommand(request: ChatRequest): {
    command: string[];
    userPrompt: string;
    systemPrompt?: string;
  } {
    const outputFormat = request.stream ? 'stream-json' : 'json';
    const cmd = ['claude', '-p', '--output-format', outputFormat];

    if (request.stream) {
      cmd.push('--include-partial-messages');
    }

    // 添加模型参数
    const model = request.model || this.config.defaultModel || 'sonnet';
    cmd.push('--model', model);

    // 提取 system 消息
    let systemMessage = this.extractSystemMessage(request.messages);

    // 如果有工具定义，将其添加到 system prompt 中
    if (request.tools && request.tools.length > 0) {
      systemMessage = this.enhanceSystemPromptWithTools(systemMessage, request.tools);
      logger.debug('Tools added to system prompt', { toolCount: request.tools.length });
    }

    // TODO: 添加 MCP 配置支持
    // if (this.config.enableMCP && request.mcpConfigPath) {
    //   cmd.push('--mcp-config', request.mcpConfigPath);
    // }

    // TODO: 添加 Skills 配置支持
    // if (request.pluginDirs?.length) {
    //   request.pluginDirs.forEach(dir => cmd.push('--plugin-dir', dir));
    // }

    // 构建用户提示（只包含 user 和 assistant 消息）
    const userPrompt = this.buildUserPrompt(request.messages);

    return { command: cmd, userPrompt, systemPrompt: systemMessage || undefined };
  }

  /**
   * 增强 system prompt，添加工具定义
   */
  private enhanceSystemPromptWithTools(systemPrompt: string, tools: any[]): string {
    if (!systemPrompt) {
      systemPrompt = '你是一个专业的助手。';
    }

    const toolDefinitions = tools.map(tool => {
      const schema = tool.inputSchema;
      const params = this.formatToolParameters(schema);
      return `
**工具: ${tool.name}**
- 描述: ${tool.description}
- 参数: ${params}
`;
    }).join('\n');

    return `${systemPrompt}

## 可用工具

你有以下工具可以使用。当需要使用工具时，请严格按照以下 JSON 格式返回：

\`\`\`json
{
  "tool": "工具名称",
  "arguments": {
    "参数名": "参数值"
  }
}
\`\`\`

${toolDefinitions}

重要：
1. 当用户请求需要使用工具时，你必须调用工具，而不是直接回答
2. 工具调用必须严格按照上述 JSON 格式
3. 每次只能调用一个工具
4. 工具调用的 JSON 必须在回复的开头，然后可以添加解释
`;
  }

  /**
   * 格式化工具参数描述
   */
  private formatToolParameters(schema: any): string {
    if (!schema || !schema.properties) {
      return '无';
    }

    const params = Object.entries(schema.properties || {}).map(([name, info]: [string, any]) => {
      const required = schema.required?.includes(name) ? ' (必需)' : ' (可选)';
      return `- ${name}${required}: ${info.description || '无描述'}`;
    });

    return params.length > 0 ? params.join('\n  ') : '无';
  }

  private extractTopLevelJSONObjects(input: string): { objects: unknown[]; rest: string } {
    const objects: unknown[] = [];

    let i = 0;
    while (i < input.length) {
      while (i < input.length && /\s/.test(input[i]!)) i++;
      if (i >= input.length) break;
      if (input[i] !== '{') {
        i++;
        continue;
      }

      let depth = 0;
      let inString = false;
      let escape = false;
      let start = i;

      for (; i < input.length; i++) {
        const ch = input[i]!;

        if (inString) {
          if (escape) {
            escape = false;
            continue;
          }
          if (ch === '\\') {
            escape = true;
            continue;
          }
          if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === '{') {
          depth++;
          continue;
        }
        if (ch === '}') {
          depth--;
          if (depth === 0) {
            const raw = input.slice(start, i + 1);
            try {
              objects.push(JSON.parse(raw));
            } catch (e) {
              logger.error('Failed to parse stream-json object', {
                error: e instanceof Error ? e.message : String(e),
                data: raw.substring(0, 200),
              });
            }
            i++;
            break;
          }
        }
      }

      if (depth !== 0) {
        return { objects, rest: input.slice(start) };
      }
    }

    return { objects, rest: '' };
  }

  /**
   * 提取 system 消息
   * 如果有多条 system 消息，只返回第一条
   */
  private extractSystemMessage(messages: ChatMessage[]): string | null {
    const systemMsg = messages.find(msg => msg.role === 'system');
    return systemMsg?.content || null;
  }

  /**
   * 构建用户提示（从消息数组）
   * 只处理 user 和 assistant 消息，system 消息通过 --system-prompt 参数传递
   */
  private buildUserPrompt(messages: ChatMessage[]): string {
    let prompt = '';

    for (const message of messages) {
      if (message.role === 'user') {
        prompt += message.content + '\n\n';
      } else if (message.role === 'assistant') {
        prompt += `[Assistant: ${message.content}]\n\n`;
      }
      // system 消息不再在这里处理，已在 buildCLICommand 中通过 --system-prompt 传递
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
      let finished = false;
      const isStream = request.stream === true;

      let stdoutText = '';
      let streamBuffer = '';

      // 构建命令参数
      const { command: cmd, userPrompt, systemPrompt } = this.buildCLICommand(request);

      // 转义用户提示中的特殊字符
      const escapedPrompt = userPrompt
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\$/g, '\\$')
        .replace(/`/g, '\\`')
        .replace(/\n/g, '\\n');

      let fullCommand: string;
      let tempFile: string | null = null;

      if (systemPrompt) {
        // 使用临时文件传递 system prompt，避免 shell 转义问题

        // 创建临时文件
        const tempDir = os.tmpdir();
        tempFile = path.join(tempDir, `claude-system-prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`);
        fs.writeFileSync(tempFile, systemPrompt, 'utf8');

        logger.debug('Created temporary system prompt file', { tempFile });

        // 构建带 system prompt 文件的命令
        // 注意：Claude CLI 可能不支持 --system-prompt-file，所以我们需要用 cat 读取文件
        fullCommand = `echo "${escapedPrompt}" | ${cmd.join(' ')} --system-prompt "$(cat '${tempFile}')"`;
      } else {
        // 没有 system prompt 时的简单命令
        fullCommand = `echo "${escapedPrompt}" | ${cmd.join(' ')}`;
      }

      logger.debug('Executing command', { command: fullCommand.substring(0, 200) });

      // 使用 shell 执行命令
      const proc: ChildProcess = spawn('sh', ['-c', fullCommand], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      // 设置超时
      const timer = setTimeout(() => {
        if (proc.pid) {
          proc.kill('SIGTERM');
        }
        cleanupTempFile(); // 超时时也要清理临时文件
        reject(new Error(`Claude CLI request timeout after ${timeout}ms`));
      }, timeout);

      // 完成请求的辅助函数
      const finishRequest = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);

        // 估算 Token 数量
        promptTokens = this.estimateTokens(this.buildUserPrompt(request.messages));
        completionTokens = this.estimateTokens(fullContent);

        resolve({
          content: fullContent,
          promptTokens,
          completionTokens,
        });
      };

      // 处理标准输出
      if (proc.stdout) {
        proc.stdout.on('data', (chunk: Buffer) => {
          const data = chunk.toString();

          if (!isStream) {
            stdoutText += data;
            return;
          }

          streamBuffer += data;
          const extracted = this.extractTopLevelJSONObjects(streamBuffer);
          streamBuffer = extracted.rest;

          for (const obj of extracted.objects) {
            const chunkData = obj as StreamChunk;
            if (chunkData.type === 'assistant' && chunkData.message?.content) {
              for (const contentItem of chunkData.message.content) {
                if (contentItem.type === 'text' && contentItem.text) {
                  fullContent += contentItem.text;
                }
              }
            } else if (chunkData.type === 'result') {
              logger.debug('Claude CLI result received', {
                cost: (chunkData.result as any)?.cost ?? (chunkData as any)?.total_cost_usd,
                usage: (chunkData.result as any)?.usage ?? (chunkData as any)?.usage,
              });
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

      // 清理临时文件的辅助函数
      const cleanupTempFile = () => {
        if (tempFile) {
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
              logger.debug('Cleaned up temporary system prompt file', { tempFile });
            }
          } catch (error) {
            logger.warn('Failed to clean up temporary file', {
              error: error instanceof Error ? error.message : String(error),
              tempFile,
            });
          }
        }
      };

      // 处理进程退出
      proc.on('close', (code: number | null) => {
        if (finished) return;

        clearTimeout(timer);
        cleanupTempFile(); // 清理临时文件

        if (!isStream) {
          try {
            const parsed = JSON.parse(stdoutText) as unknown;
            const messages = Array.isArray(parsed) ? parsed : [parsed];
            for (const obj of messages) {
              const chunkData = obj as StreamChunk;
              if (chunkData.type === 'assistant' && chunkData.message?.content) {
                for (const contentItem of chunkData.message.content) {
                  if (contentItem.type === 'text' && contentItem.text) {
                    fullContent += contentItem.text;
                  }
                }
              } else if (chunkData.type === 'result') {
                logger.debug('Claude CLI result received', {
                  cost: (chunkData.result as any)?.cost ?? (chunkData as any)?.total_cost_usd,
                  usage: (chunkData.result as any)?.usage ?? (chunkData as any)?.usage,
                });
              }
            }
          } catch (e) {
            logger.error('Failed to parse JSON output', {
              error: e instanceof Error ? e.message : String(e),
              data: stdoutText.substring(0, 200),
            });
            reject(new Error('Failed to parse Claude CLI output'));
            return;
          }
        }

        if (code === 0 || fullContent.length > 0) {
          finishRequest();
        } else {
          reject(new Error(`Claude CLI process exited with code ${code}`));
        }
      });

      // 处理进程错误
      proc.on('error', (error: Error) => {
        if (finished) return;
        clearTimeout(timer);
        cleanupTempFile(); // 错误时也要清理临时文件
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
