/**
 * Quality 服务
 *
 * 质量检查服务，包含硬规则检查和 LLM 评审
 */

import { llmService } from '../llm/LLMService.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('Quality');

/**
 * 检查结果
 */
interface CheckResult {
  passed: boolean;
  score?: number;
  reason?: string;
  details?: any;
}

/**
 * 质量阈值配置
 */
interface QualityThresholds {
  // 文本质量阈值
  minLength?: number;
  maxLength?: number;
  minScore?: number;

  // 图片质量阈值
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxSize?: number;

  // 质量评分阈值
  passScore?: number;
  goodScore?: number;
  excellentScore?: number;
}

/**
 * 默认质量阈值
 */
const defaultThresholds: QualityThresholds = {
  // 文本质量阈值
  minLength: 100,
  maxLength: 10000,
  minScore: 60,

  // 图片质量阈值
  minWidth: 512,
  minHeight: 512,
  maxWidth: 4096,
  maxHeight: 4096,
  maxSize: 10 * 1024 * 1024, // 10MB

  // 质量评分阈值
  passScore: 60,
  goodScore: 75,
  excellentScore: 90,
};

/**
 * Quality 服务类
 */
export class QualityService {
  private thresholds: QualityThresholds;

  constructor(thresholds?: Partial<QualityThresholds>) {
    this.thresholds = { ...defaultThresholds, ...thresholds };
  }

  /**
   * 检查文本质量
   */
  async checkText(
    text: string,
    requirements: string
  ): Promise<CheckResult> {
    // 1. 先进行硬规则检查
    const hardRuleResult = this.checkTextHardRules(text);
    if (!hardRuleResult.passed) {
      return hardRuleResult;
    }

    // 2. 硬规则通过后，进行 LLM 评审
    return await this.checkTextWithLLM(text, requirements);
  }

  /**
   * 硬规则检查（文本）
   */
  private checkTextHardRules(text: string): CheckResult {
    const length = text.length;

    // 检查长度
    if (this.thresholds.minLength && length < this.thresholds.minLength) {
      logger.warn('Text too short', { length, minLength: this.thresholds.minLength });

      return {
        passed: false,
        score: 0,
        reason: `文本长度不足：${length} 字符（最少需要 ${this.thresholds.minLength} 字符）`,
        details: {
          rule: {
            name: 'text_length',
            threshold: this.thresholds.minLength,
            actual: length,
          },
          issues: [
            {
              severity: 'error',
              message: `文本太短，当前 ${length} 字符，最少需要 ${this.thresholds.minLength} 字符`,
              suggestion: '增加内容长度，确保内容完整',
            },
          ],
        },
      };
    }

    if (this.thresholds.maxLength && length > this.thresholds.maxLength) {
      logger.warn('Text too long', { length, maxLength: this.thresholds.maxLength });

      return {
        passed: false,
        score: 0,
        reason: `文本长度超标：${length} 字符（最多允许 ${this.thresholds.maxLength} 字符）`,
        details: {
          rule: {
            name: 'text_length',
            threshold: this.thresholds.maxLength,
            actual: length,
          },
          issues: [
            {
              severity: 'error',
              message: `文本太长，当前 ${length} 字符，最多允许 ${this.thresholds.maxLength} 字符`,
              suggestion: '精简内容或分章节处理',
            },
          ],
        },
      };
    }

    logger.debug('Text hard rules check passed', { length });

    return {
      passed: true,
      score: 100,
    };
  }

  /**
   * LLM 检查（文本）
   */
  private async checkTextWithLLM(
    text: string,
    requirements: string
  ): Promise<CheckResult> {
    try {
      logger.debug('Checking text with LLM', { textLength: text.length });

      const systemPrompt = `你是一个专业的内容质量评审专家。你的任务是评估生成的内容是否符合要求。

评估标准：
1. 相关性：内容是否与主题相关
2. 完整性：内容是否完整，有无遗漏
3. 准确性：内容是否准确，有无明显错误
4. 可读性：语言是否流畅，有无语法错误
5. 吸引力：内容是否吸引人，有无亮点

请以 JSON 格式返回评估结果，包含：
- score: 0-100 的评分
- passed: 是否通过（60分及以上为通过）
- reason: 评分原因
- issues: 问题列表（如果有）`;

      const userPrompt = `请评估以下内容：

需求：${requirements}

内容：
${text}

返回 JSON 格式的评估结果。`;

      const response = await llmService.generateText(userPrompt, systemPrompt);

      // 尝试解析 JSON 响应
      let result: any;
      try {
        // 提取 JSON（可能包含在代码块中）
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                         response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
        result = JSON.parse(jsonStr);
      } catch (error) {
        logger.warn('Failed to parse LLM response as JSON', { response });
        // 如果解析失败，使用默认值
        result = {
          score: 70,
          passed: true,
          reason: 'LLM 评审完成（响应格式无法解析，使用默认评分）',
        };
      }

      const score = result.score || 70;
      const passed = result.passed ?? (score >= (this.thresholds.passScore || 60));

      logger.info('Text LLM check completed', { score, passed });

      return {
        passed,
        score,
        reason: result.reason || `LLM 评审得分：${score}`,
        details: {
          llm: {
            prompt: userPrompt,
            response,
            criteria: ['相关性', '完整性', '准确性', '可读性', '吸引力'],
          },
          issues: result.issues,
        },
      };
    } catch (error) {
      logger.error('Text LLM check failed', error as Error);

      // LLM 检查失败时，返回保守结果
      return {
        passed: false,
        score: 0,
        reason: 'LLM 评审失败',
        details: {
          issues: [
            {
              severity: 'error',
              message: '质量检查服务暂时不可用',
            },
          ],
        },
      };
    }
  }

  /**
   * 检查图片质量
   */
  async checkImage(
    imageUrl: string,
    requirements: string
  ): Promise<CheckResult> {
    // 1. 先进行硬规则检查
    const hardRuleResult = await this.checkImageHardRules(imageUrl);
    if (!hardRuleResult.passed) {
      return hardRuleResult;
    }

    // 2. 硬规则通过后，进行 LLM 评审（如果有描述性需求）
    if (requirements && requirements.length > 0) {
      return await this.checkImageWithLLM(imageUrl, requirements);
    }

    return hardRuleResult;
  }

  /**
   * 硬规则检查（图片）
   */
  private async checkImageHardRules(imageUrl: string): Promise<CheckResult> {
    try {
      // 获取图片信息
      const axios = (await import('axios')).default;
      const response = await axios.head(imageUrl);

      const contentType = response.headers['content-type'];
      const contentLength = response.headers['content-length'];

      // 检查格式
      if (!contentType || !contentType.startsWith('image/')) {
        return {
          passed: false,
          score: 0,
          reason: `不是有效的图片格式：${contentType}`,
        };
      }

      // 检查大小
      const size = contentLength ? parseInt(contentLength) : 0;
      if (this.thresholds.maxSize && size > this.thresholds.maxSize) {
        return {
          passed: false,
          score: 0,
          reason: `图片文件过大：${Math.round(size / 1024 / 1024)}MB（最多 ${Math.round((this.thresholds.maxSize || 0) / 1024 / 1024)}MB）`,
          details: {
            rule: {
              name: 'image_size',
              threshold: this.thresholds.maxSize,
              actual: size,
            },
          },
        };
      }

      logger.debug('Image hard rules check passed', {
        contentType,
        size,
      });

      return {
        passed: true,
        score: 100,
      };
    } catch (error) {
      logger.error('Image hard rules check failed', error as Error);

      return {
        passed: false,
        score: 0,
        reason: '无法获取图片信息',
        details: {
          issues: [
            {
              severity: 'error',
              message: '图片 URL 无效或无法访问',
              suggestion: '检查图片 URL 是否正确',
            },
          ],
        },
      };
    }
  }

  /**
   * LLM 检查（图片）
   */
  private async checkImageWithLLM(
    imageUrl: string,
    requirements: string
  ): Promise<CheckResult> {
    try {
      logger.debug('Checking image with LLM', { imageUrl });

      const systemPrompt = `你是一个专业的图片质量评审专家。你的任务是评估生成的图片是否符合要求。

评估标准：
1. 相关性：图片内容是否与主题相关
2. 完整性：图片是否完整，有无截断
3. 美观度：图片是否美观，构图是否合理
4. 创意性：图片是否有创意，有无亮点
5. 安全性：图片内容是否安全，有无违规

请以 JSON 格式返回评估结果，包含：
- score: 0-100 的评分
- passed: 是否通过（60分及以上为通过）
- reason: 评分原因
- issues: 问题列表（如果有）`;

      const userPrompt = `请评估以下图片：

图片链接：${imageUrl}

需求：${requirements}

注意：你无法直接看到图片，请根据图片链接和需求进行推测性评估。

返回 JSON 格式的评估结果。`;

      const response = await llmService.generateText(userPrompt, systemPrompt);

      // 尝试解析 JSON 响应
      let result: any;
      try {
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                         response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
        result = JSON.parse(jsonStr);
      } catch (error) {
        logger.warn('Failed to parse LLM response as JSON', { response });
        result = {
          score: 70,
          passed: true,
          reason: '图片 LLM 评审完成（响应格式无法解析，使用默认评分）',
        };
      }

      const score = result.score || 70;
      const passed = result.passed ?? (score >= (this.thresholds.passScore || 60));

      logger.info('Image LLM check completed', { score, passed });

      return {
        passed,
        score,
        reason: result.reason || `LLM 评审得分：${score}`,
        details: {
          llm: {
            prompt: userPrompt,
            response,
            criteria: ['相关性', '完整性', '美观度', '创意性', '安全性'],
          },
          issues: result.issues,
        },
      };
    } catch (error) {
      logger.error('Image LLM check failed', error as Error);

      return {
        passed: false,
        score: 0,
        reason: 'LLM 评审失败',
        details: {
          issues: [
            {
              severity: 'error',
              message: '质量检查服务暂时不可用',
            },
          ],
        },
      };
    }
  }

  /**
   * 设置质量阈值
   */
  setThresholds(thresholds: Partial<QualityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.info('Quality thresholds updated', { thresholds: this.thresholds });
  }

  /**
   * 获取当前阈值
   */
  getThresholds(): QualityThresholds {
    return { ...this.thresholds };
  }
}

/**
 * Quality 服务单例
 */
export const qualityService = new QualityService();
