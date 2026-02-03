/**
 * AI Neural Understanding Engine - AI 需求理解引擎
 *
 * 核心功能：
 * 1. 将自然语言描述转换为结构化的工作流需求
 * 2. 验证需求完整性和合理性
 * 3. 优化需求设计
 *
 * 依赖：
 * - ILLMService：LLM 服务接口
 * - WorkflowRequirementSchema：需求 Schema 验证
 * - Context Builder：项目上下文构建
 */

import type { ILLMService } from '../../../../services/llm/ILLMService.js';
import { LLMServiceFactory } from '../../../../services/llm/LLMServiceFactory.js';
import { createLogger } from '../../../../infrastructure/logging/logger.js';
import {
  WorkflowRequirementSchema,
  type WorkflowRequirement,
  type ValidationResult,
  validateWorkflowRequirement,
} from '../schemas/WorkflowRequirementSchema.js';
import { buildProjectContext } from '../utils/contextBuilder.js';
import { buildWorkflowUnderstandingPrompt, buildOptimizationPrompt } from './prompts/understanding.js';

const logger = createLogger('AIUnderstandingEngine');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 上下文配置
 */
export interface ContextConfig {
  /** 是否自动构建上下文（默认 true） */
  autoBuild?: boolean;
  /** 自定义代码模式（可选） */
  codePatterns?: string;
  /** 自定义最佳实践（可选） */
  bestPractices?: string;
  /** 自定义常用节点（可选） */
  commonNodes?: string;
}

/**
 * 理解结果
 */
export interface UnderstandingResult {
  /** 是否成功 */
  success: boolean;
  /** 工作流需求（成功时） */
  requirement?: WorkflowRequirement;
  /** 验证结果 */
  validation: ValidationResult;
  /** 错误信息（失败时） */
  error?: string;
  /** 使用的 LLM 模型 */
  model?: string;
  /** Token 使用情况 */
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 优化结果
 */
export interface OptimizationResult {
  /** 优化后的需求 */
  requirement: WorkflowRequirement;
  /** 优化说明 */
  optimizations: string[];
}

// ============================================================================
// AI 理解引擎类
// ============================================================================

/**
 * AI 需求理解引擎
 *
 * 使用 LLM 将自然语言描述转换为结构化的工作流需求
 */
export class AINeuralUnderstandingEngine {
  private llmService: ILLMService;
  private contextCache?: {
    context: Awaited<ReturnType<typeof buildProjectContext>>;
    timestamp: number;
  };
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 分钟缓存

  constructor(llmService?: ILLMService) {
    this.llmService = llmService || LLMServiceFactory.create();
    logger.info('AI Neural Understanding Engine initialized');
  }

  /**
   * 理解自然语言需求
   *
   * @param naturalLanguageDescription - 自然语言描述
   * @param contextConfig - 上下文配置
   * @returns 理解结果
   */
  async understandRequirement(
    naturalLanguageDescription: string,
    contextConfig: ContextConfig = {}
  ): Promise<UnderstandingResult> {
    const startTime = Date.now();
    const {
      autoBuild = true,
      codePatterns: customCodePatterns,
      bestPractices: customBestPractices,
      commonNodes: customCommonNodes,
    } = contextConfig;

    logger.info('Starting requirement understanding', {
      descriptionLength: naturalLanguageDescription.length,
      autoBuild,
    });

    try {
      // 1. 构建或使用自定义上下文
      const context = await this.getBuildContext(
        autoBuild,
        customCodePatterns,
        customBestPractices,
        customCommonNodes
      );

      // 2. 构建完整 Prompt
      const prompt = buildWorkflowUnderstandingPrompt(
        {
          codePatterns: context.codePatterns,
          bestPractices: context.bestPractices,
          commonNodes: context.commonNodes,
        },
        context.existingWorkflows
      );

      // 3. 调用 LLM
      logger.debug('Calling LLM for requirement understanding');

      const fullPrompt = `${prompt}\n\n## User Input\n\n${naturalLanguageDescription}`;

      const llmResponse = await this.llmService.chat({
        messages: [
          {
            role: 'system',
            content: '你是一位专业的 LangGraph 工作流架构专家。请严格按照 JSON Schema 输出结果。',
          },
          {
            role: 'user',
            content: fullPrompt,
          },
        ],
        temperature: 0.3, // 较低温度以获得更确定的结果
        stream: false,
      });

      // 4. 解析 LLM 返回的 JSON
      let requirement: WorkflowRequirement;
      try {
        const jsonContent = this.extractJSON(llmResponse.content);
        requirement = JSON.parse(jsonContent) as WorkflowRequirement;
      } catch (error) {
        logger.error('Failed to parse LLM response as JSON', {
          error: error instanceof Error ? error.message : String(error),
          content: llmResponse.content.substring(0, 500),
        });

        return {
          success: false,
          validation: {
            success: false,
            errors: ['Failed to parse LLM response as valid JSON'],
            warnings: [],
          },
          error: 'Invalid JSON response from LLM',
          model: 'unknown',
        };
      }

      // 5. 使用 Zod 验证
      const validationResult = validateWorkflowRequirement(requirement);

      if (!validationResult.success) {
        logger.warn('LLM response failed validation', {
          errors: validationResult.errors,
        });
      } else {
        logger.info('Requirement validated successfully', {
          type: requirement.type,
          nodeCount: requirement.nodes.length,
          connectionCount: requirement.connections.length,
        });
      }

      // 6. 返回结果
      const duration = Date.now() - startTime;

      logger.info('Requirement understanding completed', {
        success: validationResult.success,
        duration,
        tokenUsage: llmResponse.usage.totalTokens,
      });

      return {
        success: validationResult.success,
        requirement: validationResult.success ? requirement : undefined,
        validation: validationResult,
        model: 'llm-service',
        tokenUsage: llmResponse.usage,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Requirement understanding failed', {
        error: errorMessage,
        duration,
      });

      return {
        success: false,
        validation: {
          success: false,
          errors: [errorMessage],
          warnings: [],
        },
        error: errorMessage,
      };
    }
  }

  /**
   * 验证需求完整性
   *
   * @param requirement - 工作流需求
   * @returns 验证结果
   */
  validateRequirement(requirement: WorkflowRequirement): ValidationResult {
    logger.debug('Validating requirement', {
      type: requirement.type,
    });

    // 使用 Schema 验证
    const validationResult = validateWorkflowRequirement(requirement);

    // 额外的业务逻辑验证
    const additionalErrors: string[] = [];
    const warnings: string[] = [...validationResult.warnings];

    // 1. 检查工作流类型的唯一性（在实际使用时需要检查与现有工作流的冲突）
    // 这里暂时只记录警告
    if (!requirement.type || requirement.type.trim().length === 0) {
      additionalErrors.push('Workflow type cannot be empty');
    }

    // 2. 检查是否有循环依赖
    const hasCircularDeps = this.checkCircularDependencies(requirement);
    if (hasCircularDeps) {
      additionalErrors.push('Workflow contains circular dependencies');
    }

    // 3. 检查是否有未连接的节点
    const connectedNodes = new Set<string>();
    requirement.connections.forEach((c) => {
      connectedNodes.add(c.from);
      connectedNodes.add(c.to);
    });

    const unconnectedNodes = requirement.nodes.filter(
      (n) => !connectedNodes.has(n.name) && !connectedNodes.has(`START_${n.name}`)
    );

    if (unconnectedNodes.length > 0) {
      warnings.push(
        `Found unconnected nodes: ${unconnectedNodes.map((n) => n.name).join(', ')}`
      );
    }

    // 4. 检查 LLM 节点是否都有系统提示词
    const llmNodesWithoutPrompt = requirement.nodes.filter(
      (n) => n.useLLM && !n.llmSystemPrompt
    );

    if (llmNodesWithoutPrompt.length > 0) {
      additionalErrors.push(
        `LLM nodes without system prompt: ${llmNodesWithoutPrompt.map((n) => n.name).join(', ')}`
      );
    }

    // 5. 检查质检节点是否都有质检提示词
    const qualityNodesWithoutPrompt = requirement.nodes.filter(
      (n) => n.enableQualityCheck && !n.qualityCheckPrompt
    );

    if (qualityNodesWithoutPrompt.length > 0) {
      additionalErrors.push(
        `Quality check nodes without prompt: ${qualityNodesWithoutPrompt.map((n) => n.name).join(', ')}`
      );
    }

    // 6. 检查超时时间是否合理
    const unreasonableTimeouts = requirement.nodes.filter(
      (n) => n.timeout < 5000 || n.timeout > 600000
    );

    if (unreasonableTimeouts.length > 0) {
      warnings.push(
        `Some nodes have unreasonable timeouts (should be 5-600 seconds): ${unreasonableTimeouts.map((n) => n.name).join(', ')}`
      );
    }

    // 7. 检查是否有起始和结束连接
    const hasStart = requirement.connections.some(
      (c) => c.from === 'START' || c.from === '__start__'
    );
    const hasEnd = requirement.connections.some(
      (c) => c.to === 'END' || c.to === '__end__'
    );

    if (!hasStart) {
      additionalErrors.push('Workflow must have a START connection');
    }

    if (!hasEnd) {
      additionalErrors.push('Workflow must have an END connection');
    }

    return {
      success: validationResult.success && additionalErrors.length === 0,
      errors: [...validationResult.errors, ...additionalErrors],
      warnings,
    };
  }

  /**
   * 优化需求设计
   *
   * @param requirement - 原始需求
   * @returns 优化后的需求
   */
  async optimizeRequirement(requirement: WorkflowRequirement): Promise<OptimizationResult> {
    logger.info('Starting requirement optimization', {
      type: requirement.type,
    });

    try {
      // 1. 构建优化 Prompt
      const prompt = buildOptimizationPrompt(JSON.stringify(requirement, null, 2));

      // 2. 调用 LLM
      const llmResponse = await this.llmService.chat({
        messages: [
          {
            role: 'system',
            content: '你是一位工作流架构优化专家。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2,
        stream: false,
      });

      // 3. 解析响应
      let response: {
        optimizedRequirement: WorkflowRequirement;
        optimizations: string[];
      };

      try {
        const jsonContent = this.extractJSON(llmResponse.content);
        response = JSON.parse(jsonContent);
      } catch (error) {
        logger.error('Failed to parse optimization response', {
          error: error instanceof Error ? error.message : String(error),
        });

        // 如果解析失败，返回基本优化的需求
        return {
          requirement: this.basicOptimization(requirement),
          optimizations: ['Failed to get AI optimizations, applied basic optimizations'],
        };
      }

      // 4. 验证优化后的需求
      const validation = this.validateRequirement(response.optimizedRequirement);

      if (!validation.success) {
        logger.warn('Optimized requirement failed validation, using basic optimization', {
          errors: validation.errors,
        });

        return {
          requirement: this.basicOptimization(requirement),
          optimizations: [
            'AI optimizations failed validation',
            'Applied basic optimizations',
          ],
        };
      }

      logger.info('Requirement optimization completed', {
        optimizationCount: response.optimizations.length,
      });

      return {
        requirement: response.optimizedRequirement,
        optimizations: response.optimizations,
      };
    } catch (error) {
      logger.error('Requirement optimization failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // 返回基本优化版本
      return {
        requirement: this.basicOptimization(requirement),
        optimizations: ['AI optimization failed, applied basic optimizations'],
      };
    }
  }

  /**
   * 获取构建上下文（带缓存）
   */
  private async getBuildContext(
    autoBuild: boolean,
    customCodePatterns?: string,
    customBestPractices?: string,
    customCommonNodes?: string
  ): Awaited<ReturnType<typeof buildProjectContext>> {
    // 如果有自定义内容，使用自定义
    if (customCodePatterns || customBestPractices || customCommonNodes) {
      return {
        existingWorkflows: [],
        codePatterns: customCodePatterns || '',
        bestPractices: customBestPractices || '',
        commonNodes: customCommonNodes || '',
      };
    }

    // 检查缓存
    if (
      this.contextCache &&
      Date.now() - this.contextCache.timestamp < this.cacheTimeout
    ) {
      logger.debug('Using cached context');
      return this.contextCache.context;
    }

    // 构建新上下文
    if (autoBuild) {
      const context = await buildProjectContext();
      this.contextCache = {
        context,
        timestamp: Date.now(),
      };
      return context;
    }

    // 返回默认上下文
    return {
      existingWorkflows: [],
      codePatterns: '',
      bestPractices: '',
      commonNodes: '',
    };
  }

  /**
   * 从 LLM 输出中提取 JSON
   */
  private extractJSON(content: string): string {
    let text = content.trim();

    // 去除 Markdown 代码块标记
    if (text.startsWith('```json')) {
      text = text.slice(7);
    } else if (text.startsWith('```')) {
      text = text.slice(3);
    }
    if (text.endsWith('```')) {
      text = text.slice(0, -3);
    }
    text = text.trim();

    // 查找第一个 { 的位置
    const startIndex = text.indexOf('{');
    if (startIndex === -1) {
      throw new Error('No JSON object found in content');
    }

    // 查找匹配的结束括号
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEnd = -1;

    for (let i = startIndex; i < text.length; i++) {
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
        if (char === '{') {
          bracketCount++;
        } else if (char === '}') {
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

    return text.substring(startIndex, jsonEnd);
  }

  /**
   * 检查循环依赖
   *
   * 检查是否存在无条件的循环路径（不包含条件重试）
   */
  private checkCircularDependencies(requirement: WorkflowRequirement): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    // 构建邻接表（只包含无条件边）
    const adjacency = new Map<string, string[]>();
    for (const conn of requirement.connections) {
      // 忽略有条件的边（这些通常是重试逻辑，不是真正的循环）
      if (!conn.condition) {
        if (!adjacency.has(conn.from)) {
          adjacency.set(conn.from, []);
        }
        adjacency.get(conn.from)!.push(conn.to);
      }
    }

    const hasCycle = (nodeName: string): boolean => {
      if (recursionStack.has(nodeName)) {
        return true;
      }
      if (visited.has(nodeName)) {
        return false;
      }

      visited.add(nodeName);
      recursionStack.add(nodeName);

      const neighbors = adjacency.get(nodeName) || [];
      for (const neighbor of neighbors) {
        // 忽略 START 和 END
        if (neighbor !== 'END' && neighbor !== '__end__') {
          if (hasCycle(neighbor)) {
            return true;
          }
        }
      }

      recursionStack.delete(nodeName);
      return false;
    };

    // 从所有起始节点开始检查
    const startNodes = requirement.connections
      .filter((c) => c.from === 'START' || c.from === '__start__')
      .map((c) => c.to);

    for (const startNode of startNodes) {
      if (hasCycle(startNode)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 基本优化（不依赖 LLM）
   */
  private basicOptimization(requirement: WorkflowRequirement): WorkflowRequirement {
    const optimized = { ...requirement };

    // 1. 优化超时时间
    optimized.nodes = optimized.nodes.map((node) => {
      const optimizedNode = { ...node };

      if (node.nodeType === 'llm') {
        optimizedNode.timeout = Math.max(90000, Math.min(180000, node.timeout));
      } else if (node.nodeType === 'api') {
        optimizedNode.timeout = Math.max(30000, Math.min(60000, node.timeout));
      } else if (node.nodeType === 'transform') {
        optimizedNode.timeout = Math.max(10000, Math.min(30000, node.timeout));
      } else if (node.nodeType === 'quality_check') {
        optimizedNode.timeout = Math.max(60000, Math.min(120000, node.timeout));
      }

      return optimizedNode;
    });

    // 2. 确保合理的重试次数
    optimized.maxRetries = Math.max(1, Math.min(5, optimized.maxRetries));

    // 3. 确保启用检查点
    optimized.enableCheckpoint = true;

    return optimized;
  }
}

// ============================================================================
// 导出
// ============================================================================

export default AINeuralUnderstandingEngine;
