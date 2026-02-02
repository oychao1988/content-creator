/**
 * 测试工具和 Mock 函数
 *
 * 提供测试所需的 Mock 对象和辅助函数
 */

import type { WorkflowState, SearchResultItem, OrganizedInfo, GeneratedImage } from '../../src/domain/workflow/State.js';
import { ExecutionMode } from '../../src/domain/workflow/State.js';

/**
 * 创建测试用的初始状态
 */
export function createTestInitialState(overrides?: Partial<WorkflowState>): WorkflowState {
  return {
    taskId: 'test-task-123',
    workflowType: 'content-creator',
    mode: ExecutionMode.SYNC,
    topic: 'AI 技术的发展',
    requirements: '写一篇关于 AI 技术发展的文章',
    hardConstraints: {
      minWords: 500,
      maxWords: 1000,
      keywords: ['AI', '人工智能', '技术发展'],
    },

    // 流程数据
    searchQuery: undefined,
    searchResults: undefined,
    organizedInfo: undefined,
    articleContent: undefined,
    images: undefined,
    imagePrompts: undefined,
    previousContent: undefined,

    // 质检数据
    textQualityReport: undefined,
    imageQualityReport: undefined,

    // 控制数据
    currentStep: 'start',
    textRetryCount: 0,
    imageRetryCount: 0,
    version: 1,
    startTime: Date.now(),

    ...overrides,
  };
}

/**
 * 创建 Mock 搜索结果
 */
export function createMockSearchResults(count: number = 5): SearchResultItem[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `搜索结果 ${i + 1}`,
    url: `https://example.com/article-${i + 1}`,
    content: `这是第 ${i + 1} 条搜索结果的内容。AI 技术正在快速发展，大语言模型、计算机视觉、自动驾驶等领域都取得了重大突破。`,
    score: 0.9 - i * 0.1,
    publishedDate: '2025-01-18',
    author: `作者 ${i + 1}`,
  }));
}

/**
 * 创建 Mock 组织信息
 */
export function createMockOrganizedInfo(): OrganizedInfo {
  return {
    outline: `# AI 技术的发展

## 引言
- AI 技术的重要性
- 本文的主要内容

## 大语言模型
- GPT 系列模型
- 应用场景

## 计算机视觉
- 图像识别
- 视频分析

## 结语
- 未来展望
- 总结`,
    keyPoints: [
      '大语言模型是当前 AI 领域的热点',
      '计算机视觉技术日益成熟',
      'AI 将改变各行各业的运作方式',
      '需要关注 AI 的伦理和安全问题',
      '未来 AI 将更加普及和智能化',
    ],
    summary: '本文介绍了 AI 技术的最新发展趋势，重点讨论了大语言模型和计算机视觉两大领域的突破，并展望了未来的发展方向。',
  };
}

/**
 * 创建 Mock 文章内容
 */
export function createMockArticleContent(): string {
  return `# AI 技术的发展趋势

人工智能（AI）技术正在以前所未有的速度发展，深刻改变着我们的生活和工作方式。近年来，大语言模型（LLM）取得了重大突破，GPT 系列、Claude 等模型展现出了惊人的理解和生成能力，正在 revolutionize 各行各业。

## 技术发展的里程碑

AI 技术的发展经历了多个重要阶段。从早期的符号主义到连接主义，再到现在的深度学习时代，每一次突破都推动了技术的进步。计算机视觉技术也在不断进步，图像识别、目标检测、视频分析等技术已经广泛应用于医疗诊断、自动驾驶、安防监控等领域。

## 技术发展的应用场景

AI 技术的应用已经渗透到我们生活的方方面面。在医疗领域，AI 辅助诊断系统能够帮助医生更准确地发现疾病。在金融领域，AI 算法能够预测市场趋势，辅助投资决策。在制造业，AI 驱动的机器人正在取代人工完成重复性工作。这些技术的快速发展正在改变各行各业的运作方式。

## 技术发展的挑战与机遇

随着 AI 技术的快速发展，我们也面临着诸多挑战。多模态 AI、通用人工智能（AGI）等前沿技术正在孕育更大的突破。技术发展的同时，我们也需要关注伦理和安全问题，确保 AI 造福人类。人工智能的发展将带来新的就业机会，同时也需要我们不断提升技能以适应变化。

## 技术发展的未来展望

AI 技术的发展将为社会带来巨大的变革，我们正处于这个激动人心的时代。未来的技术发展将更加注重可解释性、安全性和普惠性，让 AI 真正成为人类的助手。人工智能将在教育、医疗、交通、环保等领域发挥更大的作用，为人类创造更美好的未来。

## 结语

总之，AI 技术的发展是不可逆转的趋势。我们需要积极拥抱这一变革，同时保持理性和谨慎，确保人工智能技术的发展能够真正造福人类社会。通过不断学习和创新，我们将迎来更加智能化的未来。`;
}

/**
 * 创建 Mock 生成图片
 */
export function createMockImages(count: number = 2): GeneratedImage[] {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://example.com/image-${i + 1}.png`,
    prompt: `AI 技术相关的配图 ${i + 1}`,
    width: 1024,
    height: 1024,
    format: 'png',
  }));
}

/**
 * Mock Search Service
 */
export class MockSearchService {
  async searchWithAnswer(query: string, maxResults: number) {
    return {
      answer: '这是 AI 技术相关的搜索答案',
      results: createMockSearchResults(maxResults),
    };
  }

  async healthCheck() {
    return true;
  }
}

/**
 * Mock LLM Service
 */
export class MockLLMService {
  constructor(private mockResponse?: string) {}

  async chat(request: { messages: Array<{ role: string; content: string }>; taskId: string; stepName: string }) {
    const response = this.mockResponse || this.generateMockResponse(request.stepName, request.taskId);

    return {
      content: response,
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
      },
      cost: 0.001,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  private generateMockResponse(stepName: string, taskId: string): string {
    switch (stepName) {
      case 'organize':
        return JSON.stringify(createMockOrganizedInfo());

      case 'write':
        return createMockArticleContent();

      case 'checkText':
        // 在测试中，当 taskId 包含 'test-fail' 时返回质检失败，用于测试重试逻辑
        if (taskId && taskId.includes('test-fail')) {
          return JSON.stringify({
            score: 4.5, // 低于测试环境的及格分数（5分）
            passed: false,
            hardConstraintsPassed: false,
            details: {
              hardRules: {
                passed: false,
                wordCount: { passed: false, wordCount: 400, minRequired: 500, maxRequired: 1000 },
                keywords: { passed: false, found: ['AI'], required: ['AI', '人工智能', '技术发展'] },
                structure: { passed: false, checks: { hasTitle: true, hasIntro: false, hasBody: true, hasConclusion: true } }
              },
              softScores: {
                relevance: { score: 4, reason: '内容与主题相关性较低' },
                coherence: { score: 5, reason: '逻辑较为混乱' },
                completeness: { score: 4, reason: '结构不完整' },
                readability: { score: 5, reason: '语言表达较差' }
              }
            },
            fixSuggestions: ['增加字数', '补充关键词', '优化结构']
          });
        }
        // 其他情况返回通过的响应
        return JSON.stringify({
          score: 8.5,
          passed: true,
          hardConstraintsPassed: true,
          details: {
            hardRules: {
              passed: true,
              wordCount: { passed: true, wordCount: 650 },
              keywords: { passed: true, found: ['AI', '人工智能', '技术发展'], required: ['AI', '人工智能', '技术发展'] },
              structure: { passed: true, checks: { hasTitle: true, hasIntro: true, hasBody: true, hasConclusion: true } }
            },
            softScores: {
              relevance: { score: 9, reason: '内容完全切题' },
              coherence: { score: 8, reason: '逻辑通顺' },
              completeness: { score: 8.5, reason: '结构完整' },
              readability: { score: 8, reason: '语言流畅' }
            }
          },
          fixSuggestions: []
        });

      case 'generateImagePrompts':
        return JSON.stringify([
          'AI 技术相关的科技感图片，蓝色调',
          '人工智能机器人工作场景',
        ]);

      case 'checkImage':
        return JSON.stringify({
          score: 8.0,
          passed: true,
          details: {
            relevanceScore: 8.5,
            aestheticScore: 7.5,
            promptMatch: 8.0
          },
          fixSuggestions: []
        });

      default:
        return 'Default mock response';
    }
  }

  async calculateCost(tokensIn: number, tokensOut: number) {
    return (tokensIn * 0.001 + tokensOut * 0.002) / 1000;
  }

  async estimateTokens(text: string) {
    return Math.ceil(text.length / 2);
  }

  async estimateCost(text: string) {
    const tokens = await this.estimateTokens(text);
    return await this.calculateCost(tokens, tokens);
  }
}

/**
 * Mock Image Service
 */
export class MockImageService {
  async generateImage(request: { prompt: string; width?: number; height?: number }) {
    return {
      imageUrl: `https://example.com/mock-image-${Date.now()}.png`,
      width: request.width || 1024,
      height: request.height || 1024,
      format: 'png',
      prompt: request.prompt,
    };
  }

  async healthCheck() {
    return true;
  }
}

/**
 * 等待异步操作完成
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 创建失败的 Mock
 */
export function createFailingMock(error: Error) {
  return {
    async execute() {
      throw error;
    },
  };
}
