/**
 * LLM 评估器
 *
 * 使用 LLM 对内容进行智能评估
 * 包括：相关性、连贯性、完整性、可读性等多维度评分
 */

import { llmService } from '../llm/LLMService.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('LLMEvaluator');

/**
 * 评分维度
 */
export interface EvaluationDimensions {
  relevance: number;     // 相关性（0-10）
  coherence: number;     // 连贯性（0-10）
  completeness: number;  // 完整性（0-10）
  readability: number;   // 可读性（0-10）
}

/**
 * LLM 评估结果
 */
export interface LLMEvaluationResult {
  passed: boolean;
  score: number;  // 总分（0-10）
  dimensions: EvaluationDimensions;
  details: {
    strengths: string[];      // 优点
    weaknesses: string[];     // 缺点
    suggestions: string[];    // 改进建议
    reasoning: string;        // 评估理由
  };
  metadata: {
    evaluatedAt: number;
    model: string;
    tokensUsed: number;
  };
}

/**
 * 评估选项
 */
export interface EvaluateOptions {
  passThreshold?: number;  // 通过阈值（默认 7.0）
  maxAttempts?: number;    // 最大尝试次数（默认 3）
  timeout?: number;        // 超时时间（毫秒，默认 30000）
}

/**
 * 默认评估选项
 */
const defaultOptions: EvaluateOptions = {
  passThreshold: 7.0,
  maxAttempts: 3,
  timeout: 30000,
};

/**
 * LLM 评估器类
 */
export class LLMEvaluator {
  private options: EvaluateOptions;

  constructor(options?: Partial<EvaluateOptions>) {
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * 评估内容
   */
  async evaluate(
    content: string,
    requirements: string,
    options?: Partial<EvaluateOptions>
  ): Promise<LLMEvaluationResult> {
    const opts = { ...this.options, ...options };

    logger.debug('Starting LLM evaluation', {
      contentLength: content.length,
      requirementsLength: requirements.length,
      passThreshold: opts.passThreshold,
    });

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(content, requirements);

      const { text: response, usage } = await llmService.generateTextWithUsage(
        userPrompt,
        systemPrompt
      );

      const result = this.parseResponse(response, usage);

      logger.info('LLM evaluation completed', {
        score: result.score,
        passed: result.passed,
        dimensions: result.dimensions,
        tokensUsed: usage.totalTokens,
      });

      return result;
    } catch (error) {
      logger.error('LLM evaluation failed', error as Error);

      // 返回保守的默认结果
      return {
        passed: false,
        score: 0,
        dimensions: {
          relevance: 0,
          coherence: 0,
          completeness: 0,
          readability: 0,
        },
        details: {
          strengths: [],
          weaknesses: ['评估服务暂时不可用'],
          suggestions: ['请稍后重试'],
          reasoning: 'LLM 评估失败',
        },
        metadata: {
          evaluatedAt: Date.now(),
          model: 'error',
          tokensUsed: 0,
        },
      };
    }
  }

  /**
   * 批量评估
   */
  async batchEvaluate(
    items: Array<{ content: string; requirements: string }>
  ): Promise<LLMEvaluationResult[]> {
    logger.info('Batch evaluating', { count: items.length });

    const results = await Promise.all(
      items.map(item => this.evaluate(item.content, item.requirements))
    );

    logger.info('Batch evaluation completed', { count: results.length });

    return results;
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(): string {
    return `你是一个专业的内容质量评审专家。你的任务是对生成的内容进行多维度评估。

## 评估维度

请从以下 4 个维度对内容进行评分（每个维度 0-10 分）：

1. **相关性（Relevance）**
   - 内容是否与主题和要求相关
   - 是否偏离主题或包含无关信息
   - 核心观点是否紧扣需求

2. **连贯性（Coherence）**
   - 内容结构是否清晰、逻辑是否严密
   - 段落之间过渡是否自然
   - 论证是否合理、有无自相矛盾

3. **完整性（Completeness）**
   - 内容是否完整、有无遗漏重要信息
   - 是否涵盖了主题的各个方面
   - 开头、主体、结尾是否完整

4. **可读性（Readability）**
   - 语言是否流畅、有无语法错误
   - 用词是否准确、表达是否清晰
   - 是否易于理解和阅读

## 评分标准

- **9-10 分**：优秀 - 完全符合要求，质量很高
- **7-8 分**：良好 - 基本符合要求，有小瑕疵但不影响整体
- **5-6 分**：及格 - 勉强符合要求，有较多问题需要改进
- **0-4 分**：不及格 - 不符合要求，存在严重问题

## 输出格式

请严格按照以下 JSON 格式返回评估结果：

\`\`\`json
{
  "score": 7.5,
  "dimensions": {
    "relevance": 8,
    "coherence": 7,
    "completeness": 8,
    "readability": 7
  },
  "strengths": [
    "内容紧扣主题，观点明确",
    "结构清晰，段落分明"
  ],
  "weaknesses": [
    "部分论证不够深入",
    "缺少具体案例支持"
  ],
  "suggestions": [
    "增加具体案例和数据支持",
    "深入分析部分观点"
  ],
  "reasoning": "整体内容质量良好，但在论证深度和实例支持方面有改进空间。"
}
\`\`\`

注意：
1. 总分 score 是 4 个维度的加权平均：relevance * 0.3 + coherence * 0.3 + completeness * 0.2 + readability * 0.2
2. 必须返回有效的 JSON 格式
3. 评估要客观、公正、具体`;
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(content: string, requirements: string): string {
    // 限制内容长度，避免超过 token 限制
    const maxLength = 3000;
    const truncatedContent =
      content.length > maxLength
        ? content.substring(0, maxLength) + '\n...(内容已截断)'
        : content;

    return `请评估以下内容：

## 需求要求
${requirements}

## 待评估内容
${truncatedContent}

请按照系统提示词的要求进行评估，并返回 JSON 格式的结果。`;
  }

  /**
   * 解析 LLM 响应
   */
  private parseResponse(
    response: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  ): LLMEvaluationResult {
    try {
      // 尝试提取 JSON
      let jsonStr = response;

      // 提取代码块中的 JSON
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        jsonStr = codeBlockMatch[1];
      }
      // 提取花括号中的 JSON
      else {
        const braceMatch = response.match(/\{[\s\S]*\}/);
        if (braceMatch && braceMatch[0]) {
          jsonStr = braceMatch[0];
        }
      }

      const parsed = JSON.parse(jsonStr);

      // 验证并构建结果
      const score = this.parseScore(parsed.score);
      const dimensions = this.parseDimensions(parsed.dimensions);
      const passed = score >= this.options.passThreshold!;

      return {
        passed,
        score,
        dimensions,
        details: {
          strengths: this.parseStringArray(parsed.strengths),
          weaknesses: this.parseStringArray(parsed.weaknesses),
          suggestions: this.parseStringArray(parsed.suggestions),
          reasoning: parsed.reasoning || '无详细说明',
        },
        metadata: {
          evaluatedAt: Date.now(),
          model: 'deepseek-chat',
          tokensUsed: usage.totalTokens,
        },
      };
    } catch (error) {
      logger.warn('Failed to parse LLM response, using default values', {
        error: (error as Error).message,
        response: response.substring(0, 200),
      });

      // 解析失败时返回默认值
      return {
        passed: true,
        score: 7.0,
        dimensions: {
          relevance: 7,
          coherence: 7,
          completeness: 7,
          readability: 7,
        },
        details: {
          strengths: ['评估完成（响应格式无法解析，使用默认评分）'],
          weaknesses: [],
          suggestions: [],
          reasoning: 'LLM 评审完成，但响应格式解析失败',
        },
        metadata: {
          evaluatedAt: Date.now(),
          model: 'deepseek-chat',
          tokensUsed: usage.totalTokens,
        },
      };
    }
  }

  /**
   * 解析分数
   */
  private parseScore(value: any): number {
    const score = typeof value === 'number' ? value : parseFloat(value);
    return Math.max(0, Math.min(10, isNaN(score) ? 7.0 : score));
  }

  /**
   * 解析维度评分
   */
  private parseDimensions(value: any): EvaluationDimensions {
    const dims = value || {};

    return {
      relevance: Math.max(0, Math.min(10, this.parseScore(dims.relevance))),
      coherence: Math.max(0, Math.min(10, this.parseScore(dims.coherence))),
      completeness: Math.max(0, Math.min(10, this.parseScore(dims.completeness))),
      readability: Math.max(0, Math.min(10, this.parseScore(dims.readability))),
    };
  }

  /**
   * 解析字符串数组
   */
  private parseStringArray(value: any): string[] {
    if (Array.isArray(value)) {
      return value.map(item => String(item));
    }
    if (typeof value === 'string') {
      return [value];
    }
    return [];
  }

  /**
   * 计算加权总分
   */
  calculateWeightedScore(dimensions: EvaluationDimensions): number {
    return (
      dimensions.relevance * 0.3 +
      dimensions.coherence * 0.3 +
      dimensions.completeness * 0.2 +
      dimensions.readability * 0.2
    );
  }

  /**
   * 检查是否通过
   */
  checkPassed(score: number, threshold?: number): boolean {
    const passThreshold = threshold ?? this.options.passThreshold!;
    return score >= passThreshold;
  }

  /**
   * 获取通过阈值
   */
  getPassThreshold(): number {
    return this.options.passThreshold!;
  }

  /**
   * 设置通过阈值
   */
  setPassThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 10) {
      throw new Error('Threshold must be between 0 and 10');
    }
    this.options.passThreshold = threshold;
    logger.info('Pass threshold updated', { threshold });
  }
}

/**
 * LLM 评估器单例
 */
export const llmEvaluator = new LLMEvaluator();
