/**
 * 统一的测试数据 Fixtures
 *
 * 提供标准化的测试数据，减少重复代码，提高测试可维护性
 */

import type {
  WorkflowState,
  SearchResultItem,
  OrganizedInfo,
  QualityCheckResult,
  TaskJobData,
} from '../../src/domain/workflow/State.js';
import { ExecutionMode } from '../../src/domain/workflow/State.js';

// ============================================================================
// 任务相关 Fixtures
// ============================================================================

export const taskFixtures = {
  /** 有效的同步任务 */
  validSyncTask: {
    mode: 'sync' as const,
    topic: 'AI 技术的发展',
    requirements: '写一篇关于 AI 技术发展的文章，包括最新进展和应用场景',
  },

  /** 有效的异步任务 */
  validAsyncTask: {
    mode: 'async' as const,
    topic: '机器学习基础',
    requirements: '介绍机器学习的基本概念和常用算法',
  },

  /** 带硬约束的任务 */
  taskWithConstraints: {
    mode: 'async' as const,
    topic: '深度学习应用',
    requirements: '讨论深度学习在各领域的应用',
    hardConstraints: {
      minWords: 800,
      maxWords: 1500,
      keywords: ['深度学习', '神经网络', 'AI应用'],
      requireAllKeywords: false,
      requireTitle: true,
      requireIntro: true,
      requireConclusion: true,
      minSections: 5,
    },
  },

  /** 无效任务 - 空主题 */
  invalidTaskEmptyTopic: {
    mode: 'async' as const,
    topic: '',
    requirements: '测试要求',
  },

  /** 无效任务 - 空要求 */
  invalidTaskEmptyRequirements: {
    mode: 'async' as const,
    topic: '测试主题',
    requirements: '',
  },

  /** 无效任务 - min > max */
  invalidTaskMinMax: {
    mode: 'async' as const,
    topic: '测试',
    requirements: '测试',
    hardConstraints: {
      minWords: 1000,
      maxWords: 500,
    },
  },

  /** 批量任务 */
  batchTasks: [
    {
      mode: 'async' as const,
      topic: '任务1',
      requirements: '第一个任务',
    },
    {
      mode: 'async' as const,
      topic: '任务2',
      requirements: '第二个任务',
    },
    {
      mode: 'async' as const,
      topic: '任务3',
      requirements: '第三个任务',
    },
  ],
};

// ============================================================================
// 工作流状态 Fixtures
// ============================================================================

export function createWorkflowState(overrides?: Partial<WorkflowState>): WorkflowState {
  return {
    taskId: 'test-task-' + Math.random().toString(36).substr(2, 9),
    workflowType: 'content-creator',
    mode: ExecutionMode.ASYNC,
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

export const workflowStateFixtures = {
  /** 初始状态 */
  initialState: createWorkflowState(),

  /** 带搜索结果的状态 */
  stateWithSearchResults: createWorkflowState({
    searchResults: createMockSearchResults(5),
    searchQuery: 'AI 技术发展',
  }),

  /** 带组织信息的状态 */
  stateWithOrganizedInfo: createWorkflowState({
    searchResults: createMockSearchResults(5),
    organizedInfo: createMockOrganizedInfo(),
  }),

  /** 重写模式状态 */
  rewriteState: createWorkflowState({
    organizedInfo: createMockOrganizedInfo(),
    searchResults: createMockSearchResults(5),
    previousContent: '需要改进的内容',
    textQualityReport: createMockQualityCheckReport({
      score: 6.0,
      passed: false,
      fixSuggestions: ['加强论证', '增加实例'],
    }),
  }),

  /** 完成状态 */
  completedState: createWorkflowState({
    searchResults: createMockSearchResults(5),
    organizedInfo: createMockOrganizedInfo(),
    articleContent: createMockArticleContent(),
    textQualityReport: createMockQualityCheckReport({
      score: 8.5,
      passed: true,
    }),
    images: createMockImages(2),
    currentStep: 'end',
  }),
};

// ============================================================================
// 搜索结果 Fixtures
// ============================================================================

export function createMockSearchResults(count: number = 5): SearchResultItem[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `AI 技术发展相关文章 ${i + 1}`,
    url: `https://example.com/article-${i + 1}`,
    content: `这是第 ${i + 1} 条搜索结果的内容。AI 技术正在快速发展，大语言模型、计算机视觉、自动驾驶等领域都取得了重大突破。`,
    score: 0.95 - i * 0.05,
    publishedDate: '2025-01-18',
    author: `技术专家 ${i + 1}`,
  }));
}

export const searchResultFixtures = {
  /** 标准搜索结果 */
  standard: createMockSearchResults(5),

  /** 单条结果 */
  singleResult: createMockSearchResults(1),

  /** 空结果 */
  empty: [],

  /** 大量结果 */
  manyResults: createMockSearchResults(20),
};

// ============================================================================
// 组织信息 Fixtures
// ============================================================================

export function createMockOrganizedInfo(): OrganizedInfo {
  return {
    outline: `# AI 技术的发展

## 引言
- AI 技术的重要性
- 本文的主要内容

## 大语言模型
- GPT 系列模型
- Claude 模型
- 应用场景

## 计算机视觉
- 图像识别
- 目标检测
- 视频分析

## 未来展望
- 技术挑战
- 发展方向

## 结语
- 总结全文
- 思考与启示`,
    keyPoints: [
      '大语言模型是当前 AI 领域的热点',
      '计算机视觉技术日益成熟',
      'AI 将改变各行各业的运作方式',
      '需要关注 AI 的伦理和安全问题',
      '未来 AI 将更加普及和智能化',
      '多模态 AI 是下一个发展趋势',
    ],
    summary: '本文全面介绍了 AI 技术的最新发展趋势，重点讨论了大语言模型和计算机视觉两大领域的突破性进展，并展望了未来的发展方向和面临的挑战。',
  };
}

export const organizedInfoFixtures = {
  standard: createMockOrganizedInfo(),

  simpleOutline: {
    outline: '# 简单主题\n\n## 引言\n## 正文\n## 结语',
    keyPoints: ['要点1', '要点2', '要点3'],
    summary: '简要总结',
  },
};

// ============================================================================
// 文章内容 Fixtures
// ============================================================================

export function createMockArticleContent(): string {
  return `# AI 技术的发展趋势与未来展望

人工智能（AI）技术正在以前所未有的速度发展，深刻改变着我们的生活和工作方式。近年来，大语言模型（LLM）取得了重大突破，GPT 系列、Claude 等模型展现出了惊人的理解和生成能力，正在革命性地改变各行各业。

## 技术发展的里程碑

AI 技术的发展经历了多个重要阶段。从早期的符号主义到连接主义，再到现在的深度学习时代，每一次突破都推动了技术的进步。特别是 2022 年以来，以 ChatGPT 为代表的大语言模型横空出世，让人类社会首次真正领略到通用人工智能的雏形。

计算机视觉技术也在不断进步，图像识别、目标检测、视频分析等技术已经广泛应用于医疗诊断、自动驾驶、安防监控等领域。卷积神经网络（CNN）和 Vision Transformer 等架构的创新，使得机器在视觉任务上的表现已经接近甚至超越人类水平。

## 技术发展的应用场景

AI 技术的应用已经渗透到我们生活的方方面面。在医疗领域，AI 辅助诊断系统能够帮助医生更准确地发现疾病，提高诊断效率。在金融领域，AI 算法能够预测市场趋势，辅助投资决策，降低风险。在制造业，AI 驱动的机器人正在取代人工完成重复性工作，提高生产效率。

在内容创作领域，AI 展现出了惊人的能力。从自动生成文章、创作音乐，到生成逼真的图像和视频，AI 正在重新定义创作的边界。这些技术的快速发展正在改变各行各业的运作方式，带来前所未有的机遇和挑战。

## 技术发展的未来趋势

随着 AI 技术的快速发展，我们也面临着诸多挑战。多模态 AI、通用人工智能（AGI）等前沿技术正在孕育更大的突破。未来几年，我们有望看到更加智能、更加通用的 AI 系统出现。

技术发展的同时，我们也需要关注伦理和安全问题。如何确保 AI 系统的可解释性、公平性和安全性，如何防止 AI 技术被滥用，这些都是我们需要认真思考和解决的问题。只有在技术发展和伦理约束之间找到平衡，AI 才能真正造福人类。

## 结语

AI 技术的发展将为社会带来巨大的变革，我们正处于这个激动人心的时代。未来的技术发展将更加注重可解释性、安全性和普惠性，让 AI 真正成为人类的助手。作为这个时代的参与者和见证者，我们需要不断学习、适应变化，共同迎接 AI 带来的机遇和挑战。`;
}

export const articleContentFixtures = {
  /** 标准文章 (约800字) */
  standard: createMockArticleContent(),

  /** 短文章 (不符合字数要求) */
  tooShort: '这是一篇很短的文章。',

  /** 长文章 (超过字数限制) */
  tooLong: '很长的文章内容。'.repeat(500),

  /** 缺少关键词的文章 */
  missingKeywords: '这是一篇关于普通技术的文章，没有涉及AI和人工智能。',

  /** 包含所有必需元素的文章 */
  withAllElements: createMockArticleContent(),
};

// ============================================================================
// 质量检查报告 Fixtures
// ============================================================================

export function createMockQualityCheckReport(overrides?: Partial<QualityCheckResult>): QualityCheckResult {
  return {
    score: 8.5,
    passed: true,
    hardConstraintsPassed: true,
    details: {
      hardRuleCheck: {
        passed: true,
        score: 100,
        details: {
          wordCount: { count: 850, min: 500, max: 1000, passed: true },
          keywords: {
            passed: true,
            found: ['AI', '人工智能', '技术发展'],
            required: ['AI', '人工智能', '技术发展'],
            missing: [],
          },
          structure: {
            passed: true,
            hasTitle: true,
            hasIntro: true,
            hasBody: true,
            hasConclusion: true,
            minSections: 5,
            actualSections: 6,
          },
          forbiddenWords: { passed: true, found: [] },
        },
        issues: [],
        checkedAt: Date.now(),
      },
      llmEvaluation: {
        passed: true,
        score: 8.5,
        dimensions: {
          relevance: 9,
          coherence: 8,
          completeness: 8.5,
          readability: 8.5,
        },
        details: {
          strengths: ['内容紧扣主题', '结构清晰完整', '论证充分有力'],
          weaknesses: [],
          suggestions: [],
          reasoning: '整体质量优秀，符合所有要求',
        },
        metadata: {
          evaluatedAt: Date.now(),
          model: 'deepseek-chat',
          tokensUsed: 1500,
        },
      },
    },
    fixSuggestions: [],
    checkedAt: Date.now(),
    ...overrides,
  };
}

export const qualityCheckFixtures = {
  /** 优秀的质量报告 */
  excellent: createMockQualityCheckReport({ score: 9.5, passed: true }),

  /** 良好的质量报告 */
  good: createMockQualityCheckReport({ score: 8.0, passed: true }),

  /** 及格的质量报告 */
  passing: createMockQualityCheckReport({ score: 7.0, passed: true }),

  /** 不及格的质量报告 - 硬规则失败 */
  failedHardRules: createMockQualityCheckReport({
    score: 0,
    passed: false,
    hardConstraintsPassed: false,
    fixSuggestions: ['字数不足', '缺少必需关键词'],
  }),

  /** 不及格的质量报告 - 软评分失败 */
  failedSoftScore: createMockQualityCheckReport({
    score: 5.5,
    passed: false,
    hardConstraintsPassed: true,
    fixSuggestions: ['论证不够深入', '缺乏实例支持'],
  }),

  /** 需要重写的报告 */
  needsRewrite: createMockQualityCheckReport({
    score: 6.0,
    passed: false,
    fixSuggestions: ['加强内容深度', '增加具体案例', '优化结构安排'],
  }),
};

// ============================================================================
// 图片 Fixtures
// ============================================================================

export function createMockImages(count: number = 2) {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://example.com/mock-image-${i + 1}.png`,
    prompt: `AI 技术相关的科技感配图 ${i + 1}，蓝色调，现代风格`,
    width: 1024,
    height: 1024,
    format: 'png' as const,
  }));
}

export const imageFixtures = {
  single: createMockImages(1),
  standard: createMockImages(2),
  many: createMockImages(5),
};

// ============================================================================
// API Key Fixtures
// ============================================================================

export const apiKeyFixtures = {
  /** 有效的 API Key */
  validKey: 'ccak_' + Date.now().toString(36) + '_0123456789abcdef0123456789abcdef',

  /** 被禁用的 API Key */
  disabledKey: 'ccak_disabled_0123456789abcdef0123456789abcdef',

  /** 过期的 API Key */
  expiredKey: 'ccak_expired_0123456789abcdef0123456789abcdef',

  /** API Key 创建请求 */
  createRequest: {
    userId: 'user-123',
    name: 'Test API Key',
    description: '用于测试的 API Key',
    scopes: ['read', 'write'] as const,
  },

  /** 过期的 API Key 数据 */
  expiredKeyData: {
    id: 'key-expired',
    key_hash: 'expired_hash',
    user_id: 'user-123',
    metadata: { name: 'Expired Key' },
    is_active: true,
    expires_at: new Date(Date.now() - 10000), // 10秒前过期
    last_used_at: null,
    created_at: new Date(),
    usage_count: 0,
  },
};

// ============================================================================
// 配额 Fixtures
// ============================================================================

export const quotaFixtures = {
  /** 正常用户的配额 */
  normalUser: {
    user_id: 'user-123',
    quota_daily: 100,
    quota_used_today: 20,
    quota_reserved: 10,
    last_reset_at: new Date(),
    // quotaAvailable = 100 - 20 - 10 = 70
  },

  /** 配额不足的用户 */
  lowQuotaUser: {
    user_id: 'user-456',
    quota_daily: 100,
    quota_used_today: 95,
    quota_reserved: 5,
    last_reset_at: new Date(),
    // quotaAvailable = 100 - 95 - 5 = 0
  },

  /** 未设置配额的用户 (使用默认值) */
  noQuotaUser: {
    user_id: 'user-789',
    quota_daily: null, // 未设置
    quota_used_today: 0,
    quota_reserved: 0,
    last_reset_at: new Date(),
  },

  /** 超额使用的用户 */
  overQuotaUser: {
    user_id: 'user-999',
    quota_daily: 50,
    quota_used_today: 30,
    quota_reserved: 25, // 总共超出
    last_reset_at: new Date(),
    // quotaAvailable = 50 - 30 - 25 = -5
  },
};

// ============================================================================
// 缓存 Fixtures
// ============================================================================

export const cacheFixtures = {
  /** 字符串数据 */
  stringData: 'test string data',

  /** 数字数据 */
  numberData: 42,

  /** 布尔数据 */
  booleanData: true,

  /** 数组数据 */
  arrayData: [1, 2, 3, 4, 5],

  /** 对象数据 */
  objectData: {
    id: 1,
    name: 'test',
    nested: { value: 123 },
  },

  /** 复杂嵌套数据 */
  complexData: {
    users: [
      { id: 1, name: 'Alice', roles: ['admin', 'user'] },
      { id: 2, name: 'Bob', roles: ['user'] },
    ],
    metadata: {
      created: Date.now(),
      updated: Date.now(),
    },
  },

  /** 大数据 (1MB) */
  largeData: 'x'.repeat(1000000),
};

// ============================================================================
// 速率限制 Fixtures
// ============================================================================

export const rateLimitFixtures = {
  /** 标准限制配置 */
  standardLimit: {
    limit: 10,
    window: 60, // 60秒
  },

  /** 严格限制 */
  strictLimit: {
    limit: 5,
    window: 60,
  },

  /** 宽松限制 */
  looseLimit: {
    limit: 100,
    window: 60,
  },

  /** 令牌桶配置 */
  tokenBucketConfig: {
    limit: 10,
    window: 60,
    burst: 20, // 突发容量
  },
};

// ============================================================================
// 性能测试数据 Fixtures
// ============================================================================

export const performanceFixtures = {
  /** 小数据集 */
  smallDataset: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` })),

  /** 中等数据集 */
  mediumDataset: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` })),

  /** 大数据集 */
  largeDataset: Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` })),

  /** 超大数据集 */
  hugeDataset: Array.from({ length: 10000 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` })),
};

// ============================================================================
// 错误场景 Fixtures
// ============================================================================

export const errorFixtures = {
  /** 数据库连接错误 */
  databaseConnectionError: new Error('Database connection failed'),

  /** Redis 连接错误 */
  redisConnectionError: new Error('Redis connection failed'),

  /** LLM API 错误 */
  llmApiError: new Error('LLM API rate limit exceeded'),

  /** 验证错误 */
  validationError: new Error('Validation failed: Topic is required'),

  /** 超时错误 */
  timeoutError: new Error('Request timeout after 30000ms'),

  /** 权限错误 */
  unauthorizedError: new Error('Unauthorized: Invalid API key'),
};
