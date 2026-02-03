# 质量检查服务架构文档

**版本**: 1.0
**日期**: 2026-01-19
**所属阶段**: 阶段 4

---

## 📋 目录

- [概述](#概述)
- [架构设计](#架构设计)
- [硬规则检查](#硬规则检查)
- [LLM 软评分](#llm-软评分)
- [智能反馈](#智能反馈)
- [配置管理](#配置管理)
- [实施指南](#实施指南)
- [测试策略](#测试策略)

---

## 概述

### 目标

构建两层质量检查系统：
1. **硬规则检查** - 确定性规则，快速验证
2. **LLM 软评分** - AI 评估内容质量

### 设计原则

- ✅ **快速失败** - 先检查硬规则，快速发现问题
- ✅ **可配置** - 规则和阈值可灵活配置
- ✅ **可扩展** - 易于添加新的检查规则
- ✅ **可观测** - 详细的检查日志和指标

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────┐
│           QualityCheckService                   │
│  ┌─────────────────────────────────────────┐   │
│  │  1. 硬规则检查器 (HardRuleChecker)      │   │
│  │     - 字数检查                          │   │
│  │     - 关键词检查                        │   │
│  │     - 结构检查                          │   │
│  │     - 禁用词检查                        │   │
│  └──────────────┬──────────────────────────┘   │
│                 ↓ (通过?)                       │
│            ┌──────┴──────┐                      │
│            │             │                      │
│          ❌             ✅                      │
│          ↓              ↓                       │
│      失败返回    ┌─────────────────────────┐  │
│                 │ 2. LLM 评估器 (LLMEvaluator)│ │
│                 │   - 相关性评估            │  │
│                 │   - 连贯性评估            │  │
│                 │   - 完整性评估            │  │
│                 │   - 可读性评估            │  │
│                 └──────────┬──────────────┘  │
│                            ↓                 │
│                    ┌──────┴──────┐          │
│                    │  分数 >= 7? │          │
│                    └──────┬──────┘          │
│                         │                  │
│                    ┌────┴────┐             │
│                    │         │             │
│                  ❌         ✅             │
│                  ↓          ↓              │
│              生成反馈    通过返回           │
└─────────────────────────────────────────────────┘
```

### 数据流

```typescript
// 输入
{
  content: string,
  requirements: string,
  hardConstraints: {
    minWords?: number,
    maxWords?: number,
    keywords?: string[],
    // ...
  }
}

// 输出
{
  passed: boolean,
  score: number,
  hardConstraintsPassed: boolean,
  details: {
    wordCount?: number,
    keywordsFound?: string[],
    structureValid?: boolean,
    relevance?: number,
    coherence?: number,
    completeness?: number,
    readability?: number
  },
  fixSuggestions?: string[],
  checkedAt: number
}
```

---

## 硬规则检查

### 1. 字数检查

```typescript
// 文件: src/services/quality/checkers/WordCountChecker.ts

export class WordCountChecker {
  check(content: string, constraints: WordCountConstraints): CheckResult {
    // 移除空白字符后计算字数
    const text = content.trim();
    const wordCount = text.length; // 中文按字符计算

    // 英文按单词计算
    const englishWords = text.match(/\b\w+\b/g);
    const englishWordCount = englishWords ? englishWords.length : 0;

    const totalCount = wordCount + englishWordCount;

    const passed = totalCount >= constraints.min &&
                   totalCount <= constraints.max;

    return {
      passed,
      details: {
        wordCount: totalCount,
        minWords: constraints.min,
        maxWords: constraints.max,
        deficit: Math.max(0, constraints.min - totalCount),
        excess: Math.max(0, totalCount - constraints.max)
      }
    };
  }

  getFixSuggestions(result: CheckResult): string[] {
    const suggestions: string[] = [];
    const details = result.details;

    if (details.deficit > 0) {
      suggestions.push(
        `字数不足：当前 ${details.wordCount} 字，` +
        `最少需要 ${details.minWords} 字，` +
        `还需补充 ${details.deficit} 字`
      );
    }

    if (details.excess > 0) {
      suggestions.push(
        `字数超出：当前 ${details.wordCount} 字，` +
        `最多允许 ${details.maxWords} 字，` +
        `需要精简 ${details.excess} 字`
      );
    }

    return suggestions;
  }
}
```

### 2. 关键词检查

```typescript
// 文件: src/services/quality/checkers/KeywordChecker.ts

export class KeywordChecker {
  check(content: string, keywords: string[], options: KeywordOptions): CheckResult {
    const found: string[] = [];
    const missing: string[] = [];

    for (const keyword of keywords) {
      // 支持中英文关键词匹配
      const regex = new RegExp(keyword, 'i');
      if (regex.test(content)) {
        found.push(keyword);
      } else {
        missing.push(keyword);
      }
    }

    // 根据配置决定是否需要全部匹配
    const passed = options.matchAll
      ? missing.length === 0
      : found.length > 0;

    return {
      passed,
      details: {
        keywords,
        found,
        missing,
        foundCount: found.length,
        missingCount: missing.length,
        matchRate: found.length / keywords.length
      }
    };
  }

  getFixSuggestions(result: CheckResult): string[] {
    const suggestions: string[] = [];
    const details = result.details;

    if (details.missing.length > 0) {
      suggestions.push(
        `缺少关键词：${details.missing.join('、')}。` +
        `请在文章中自然地融入这些关键词。`
      );
    }

    return suggestions;
  }
}
```

### 3. 结构检查

```typescript
// 文件: src/services/quality/checkers/StructureChecker.ts

export class StructureChecker {
  check(content: string, requirements: StructureRequirements): CheckResult {
    const issues: string[] = [];

    // 检查标题
    if (requirements.requireTitle) {
      const hasTitle = /^#\s+.+/m.test(content);
      if (!hasTitle) {
        issues.push('缺少标题（# 标题）');
      }
    }

    // 检查导语
    if (requirements.requireIntro) {
      const hasIntro = /导语|引言|概述|简介/.test(content);
      if (!hasIntro) {
        issues.push('缺少导语段落');
      }
    }

    // 检查正文
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    if (paragraphs.length < 3) {
      issues.push('正文段落数量过少，建议至少 3 段');
    }

    // 检查结尾
    if (requirements.requireConclusion) {
      const hasConclusion = /总结|结语|结论|结尾/.test(content);
      if (!hasConclusion) {
        issues.push('缺少结尾段落');
      }
    }

    const passed = issues.length === 0;

    return {
      passed,
      details: {
        structureValid: passed,
        issues,
        paragraphCount: paragraphs.length
      }
    };
  }

  getFixSuggestions(result: CheckResult): string[] {
    return result.details.issues.map(issue => {
      switch (issue) {
        case '缺少标题（# 标题）':
          return '请在文章开头添加标题，格式：# 文章标题';
        case '缺少导语段落':
          return '请添加导语段落，简要介绍文章内容';
        case '正文段落数量过少，建议至少 3 段':
          return '请丰富正文内容，增加段落数量';
        case '缺少结尾段落':
          return '请添加结尾段落，总结文章要点';
        default:
          return `结构问题：${issue}`;
      }
    });
  }
}
```

### 4. 禁用词检查

```typescript
// 文件: src/services/quality/checkers/ForbiddenWordsChecker.ts

export class ForbiddenWordsChecker {
  constructor(private forbiddenWords: Set<string>) {}

  check(content: string): CheckResult {
    const found: string[] = [];

    for (const word of this.forbiddenWords) {
      const regex = new RegExp(word, 'gi');
      const matches = content.match(regex);
      if (matches) {
        found.push(...matches);
      }
    }

    const passed = found.length === 0;

    return {
      passed,
      details: {
        forbiddenWordsFound: found,
        count: found.length
      }
    };
  }

  getFixSuggestions(result: CheckResult): string[] {
    if (result.details.count > 0) {
      return [
        `文章包含禁用词：${result.details.forbiddenWordsFound.join('、')}。` +
        `请移除或替换这些词汇。`
      ];
    }
    return [];
  }
}
```

---

## LLM 软评分

### 评估维度

```typescript
// 文件: src/services/quality/evaluators/LLMEvaluator.ts

export interface EvaluationDimensions {
  relevance: number;    // 相关性 (30%)
  coherence: number;    // 连贯性 (30%)
  completeness: number; // 完整性 (20%)
  readability: number;  // 可读性 (20%)
}

export class LLMEvaluator {
  async evaluate(
    content: string,
    requirements: string,
    options: EvaluationOptions
  ): Promise<EvaluationResult> {

    // 1. 构建评估 Prompt
    const prompt = this.buildEvaluationPrompt(content, requirements);

    // 2. 调用 LLM
    const response = await this.llmService.generate(prompt, {
      temperature: 0.3,
      maxTokens: 500,
      responseFormat: 'json_object'
    });

    // 3. 解析响应
    const evaluation = this.parseEvaluationResponse(response);

    // 4. 计算加权总分
    const score = this.calculateScore(evaluation);

    return {
      score,
      passed: score >= options.passThreshold,
      dimensions: evaluation.dimensions,
      reasoning: evaluation.reasoning
    };
  }

  private buildEvaluationPrompt(content: string, requirements: string): string {
    return `
你是一位专业的文章质量评估专家。请根据以下要求评估文章：

## 文章内容
${content}

## 写作要求
${requirements}

## 评估维度
请从以下四个维度评估文章质量（0-10分）：

1. **相关性 (30%)**
   - 内容是否紧扣主题
   - 是否回应了所有写作要求
   - 是否有偏离主题的内容

2. **连贯性 (30%)**
   - 逻辑是否清晰
   - 段落衔接是否自然
   - 论证是否有条理

3. **完整性 (20%)**
   - 内容是否完整
   - 要点是否覆盖
   - 是否有明显遗漏

4. **可读性 (20%)**
   - 语言是否通顺
   - 用词是否准确
   - 是否易于理解

## 输出格式
请以 JSON 格式输出：
{
  "relevance": 分数,
  "coherence": 分数,
  "completeness": 分数,
  "readability": 分数,
  "reasoning": "评估理由（100字以内）"
}
`;
  }

  private calculateScore(evaluation: EvaluationData): number {
    return (
      evaluation.dimensions.relevance * 0.3 +
      evaluation.dimensions.coherence * 0.3 +
      evaluation.dimensions.completeness * 0.2 +
      evaluation.dimensions.readability * 0.2
    ) * 10; // 转换为 0-10 分制
  }

  private parseEvaluationResponse(response: string): EvaluationData {
    try {
      const parsed = JSON.parse(response);
      return {
        dimensions: {
          relevance: parsed.relevance,
          coherence: parsed.coherence,
          completeness: parsed.completeness,
          readability: parsed.readability
        },
        reasoning: parsed.reasoning
      };
    } catch (error) {
      // Fallback: 如果解析失败，返回默认分数
      return {
        dimensions: {
          relevance: 7,
          coherence: 7,
          completeness: 7,
          readability: 7
        },
        reasoning: '无法解析评估结果'
      };
    }
  }
}
```

### 智能重试机制

```typescript
// 文件: src/services/quality/RetryManager.ts

export class RetryManager {
  async shouldRetry(
    content: string,
    evaluation: EvaluationResult,
    attemptNumber: number,
    maxAttempts: number
  ): Promise<boolean> {
    // 达到最大重试次数
    if (attemptNumber >= maxAttempts) {
      return false;
    }

    // 分数足够高
    if (evaluation.score >= 7.0) {
      return false;
    }

    return true;
  }

  getNextRetryPrompt(
    content: string,
    evaluation: EvaluationResult,
    previousContent?: string
  ): string {
    const suggestions = this.generateFixSuggestions(evaluation);

    if (previousContent) {
      // 重写模式
      return `
根据以下质检反馈，修改上一版文章：

## 质检反馈
${suggestions.map(s => `- ${s}`).join('\n')}

## 要求
1. 只修改有问题的部分
2. 保持已经合格的内容不变
3. 确保修改后不引入新问题

## 上一版文章
${previousContent}

请输出修改后的完整文章。
`;
    } else {
      // 首次重试
      return `
请根据以下质检反馈，重新生成文章：

## 质检反馈
${suggestions.map(s => `- ${s}`).join('\n')}

## 原要求
${this.requirements}

请输出改进后的完整文章。
`;
    }
  }

  private generateFixSuggestions(evaluation: EvaluationResult): string[] {
    const suggestions: string[] = [];

    const { dimensions, reasoning } = evaluation;

    if (dimensions.relevance < 7) {
      suggestions.push('相关性不足：请更紧密地围绕主题展开内容');
    }

    if (dimensions.coherence < 7) {
      suggestions.push('连贯性欠佳：请加强段落间的逻辑衔接');
    }

    if (dimensions.completeness < 7) {
      suggestions.push('完整性不够：请补充遗漏的关键要点');
    }

    if (dimensions.readability < 7) {
      suggestions.push('可读性待提升：请优化语言表达，使其更通顺易懂');
    }

    if (suggestions.length === 0) {
      suggestions.push(reasoning || '整体质量需要提升');
    }

    return suggestions;
  }
}
```

---

## 智能反馈

### 反馈生成器

```typescript
// 文件: src/services/quality/FeedbackGenerator.ts

export class FeedbackGenerator {
  generate(
    hardRuleResult: CheckResult,
    llmEvaluation?: EvaluationResult
  ): QualityFeedback {
    const feedback: QualityFeedback = {
      hardConstraints: {
        passed: hardRuleResult.passed,
        issues: [],
        fixSuggestions: []
      },
      softScoring: llmEvaluation ? {
        passed: llmEvaluation.passed,
        score: llmEvaluation.score,
        dimensions: llmEvaluation.dimensions,
        reasoning: llmEvaluation.reasoning
      } : null,
      overall: {
        passed: false,
        score: 0
      }
    };

    // 硬规则反馈
    if (!hardRuleResult.passed) {
      feedback.hardConstraints.fixSuggestions =
        this.getHardRuleFixSuggestions(hardRuleResult);
    }

    // 软评分反馈
    if (llmEvaluation && !llmEvaluation.passed) {
      feedback.softScoring!.fixSuggestions =
        this.getLLMFixSuggestions(llmEvaluation);
    }

    // 整体评估
    feedback.overall = this.calculateOverallFeedback(feedback);

    return feedback;
  }

  private getHardRuleFixSuggestions(result: CheckResult): string[] {
    const suggestions: string[] = [];

    // 字数问题
    if (result.details.wordCount !== undefined) {
      if (result.details.deficit > 0) {
        suggestions.push(`字数不足：还需补充 ${result.details.deficit} 字`);
      }
      if (result.details.excess > 0) {
        suggestions.push(`字数超出：需要精简 ${result.details.excess} 字`);
      }
    }

    // 关键词问题
    if (result.details.missing?.length > 0) {
      suggestions.push(`缺少关键词：${result.details.missing.join('、')}`);
    }

    // 结构问题
    if (result.details.issues?.length > 0) {
      suggestions.push(...result.details.issues);
    }

    return suggestions;
  }

  private getLLMFixSuggestions(evaluation: EvaluationResult): string[] {
    const suggestions: string[] = [];
    const { dimensions } = evaluation;

    if (dimensions.relevance < 7) {
      suggestions.push('加强内容与主题的相关性');
    }

    if (dimensions.coherence < 7) {
      suggestions.push('优化段落间的逻辑衔接');
    }

    if (dimensions.completeness < 7) {
      suggestions.push('补充遗漏的关键要点');
    }

    if (dimensions.readability < 7) {
      suggestions.push('提升语言表达的通顺度');
    }

    return suggestions;
  }

  private calculateOverallFeedback(feedback: QualityFeedback): OverallFeedback {
    // 必须通过硬规则
    if (!feedback.hardConstraints.passed) {
      return {
        passed: false,
        score: 0,
        reason: '硬性约束未通过'
      };
    }

    // 如果没有软评分，硬规则通过即整体通过
    if (!feedback.softScoring) {
      return {
        passed: true,
        score: 8,
        reason: '硬规则检查通过'
      };
    }

    // 综合评估
    return {
      passed: feedback.softScoring.passed,
      score: feedback.softScoring.score,
      reason: feedback.softScoring.reasoning
    };
  }
}
```

---

## 配置管理

### 配置文件

```yaml
# config/quality-check.yaml
quality_check:
  version: "1.0"

  # 硬规则配置
  hard_rules:
    word_count:
      enabled: true
      min: 500
      max: 5000

    keywords:
      enabled: true
      required: true
      match_all: false  # false: 至少匹配一个

    structure:
      enabled: true
      require_title: true
      require_intro: true
      require_body: true
      require_conclusion: false

    forbidden_words:
      enabled: true
      words: []
      # - "违规词1"
      # - "违规词2"

  # 软评分配置
  soft_scoring:
    enabled: true
    provider: llm

    llm_config:
      model: deepseek-chat
      temperature: 0.3
      max_tokens: 500
      timeout: 30000

    dimensions:
      relevance:
        weight: 0.3
        description: "内容与主题的相关性"

      coherence:
        weight: 0.3
        description: "逻辑连贯性"

      completeness:
        weight: 0.2
        description: "内容完整性"

      readability:
        weight: 0.2
        description: "可读性"

    pass_threshold: 7.0

    retry:
      max_attempts: 3
      temperature_schedule: [0.3, 0.5, 0.7]

  # 缓存配置
  cache:
    enabled: true
    ttl: 259200  # 3天（秒）
```

### 配置加载

```typescript
// 文件: src/services/quality/config/QualityCheckConfig.ts

import yaml from 'js-yaml';
import fs from 'fs';

export interface QualityCheckConfig {
  version: string;
  hard_rules: any;
  soft_scoring: any;
  cache: any;
}

export class QualityCheckConfigLoader {
  private config: QualityCheckConfig;

  load(configPath: string): QualityCheckConfig {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    this.config = yaml.load(fileContent);
    return this.config;
  }

  getHardRuleConfig(ruleName: string): any {
    return this.config.hard_rules[ruleName];
  }

  getSoftScoringConfig(): any {
    return this.config.soft_scoring;
  }

  isHardRuleEnabled(ruleName: string): boolean {
    const rule = this.config.hard_rules[ruleName];
    return rule && rule.enabled;
  }

  isSoftScoringEnabled(): boolean {
    return this.config.soft_scoring.enabled;
  }
}
```

---

## 实施指南

### Step 1: 创建基础结构

```bash
# 创建目录
mkdir -p src/services/quality/{checkers,evaluators,config}

# 创建文件
touch src/services/quality/QualityCheckService.ts
touch src/services/quality/checkers/WordCountChecker.ts
touch src/services/quality/checkers/KeywordChecker.ts
touch src/services/quality/checkers/StructureChecker.ts
touch src/services/quality/evaluators/LLMEvaluator.ts
touch src/services/quality/FeedbackGenerator.ts
```

### Step 2: 实现硬规则检查器

```bash
# 按顺序实现
1. WordCountChecker
2. KeywordChecker
3. StructureChecker
4. ForbiddenWordsChecker

# 每个检查器实现后编写测试
pnpm test -- WordCountChecker
```

### Step 3: 实现 LLM 评估器

```bash
1. 创建 LLMEvaluator
2. 实现 Prompt 模板
3. 实现响应解析
4. 编写测试
```

### Step 4: 集成到工作流

```typescript
// 更新 CheckTextNode
import { QualityCheckService } from '../../services/quality/index.js';

export class CheckTextNode extends BaseNode {
  private qualityService = new QualityCheckService();

  async executeLogic(state: State): Promise<Partial<State>> {
    const result = await this.qualityService.check(
      state.articleContent!,
      state.requirements!,
      state.hardConstraints!
    );

    return {
      textQualityReport: result,
      textRetryCount: state.textRetryCount + (result.passed ? 0 : 1)
    };
  }
}
```

---

## 测试策略

### 单元测试

```typescript
// WordCountChecker 测试
describe('WordCountChecker', () => {
  it('should pass when word count in range', () => {
    const checker = new WordCountChecker();
    const result = checker.check('测试内容', { min: 2, max: 100 });
    expect(result.passed).toBe(true);
  });

  it('should fail when word count below min', () => {
    const checker = new WordCountChecker();
    const result = checker.check('测', { min: 10, max: 100 });
    expect(result.passed).toBe(false);
    expect(result.details.deficit).toBe(7);
  });
});

// KeywordChecker 测试
describe('KeywordChecker', () => {
  it('should pass when all keywords found', () => {
    const checker = new KeywordChecker();
    const result = checker.check(
      '人工智能和机器学习',
      ['人工智能', '机器学习'],
      { matchAll: true }
    );
    expect(result.passed).toBe(true);
  });

  it('should pass with matchAll: false', () => {
    const checker = new KeywordChecker();
    const result = checker.check(
      '人工智能很棒',
      ['人工智能', '机器学习'],
      { matchAll: false }
    );
    expect(result.passed).toBe(true);
  });
});
```

### 集成测试

```typescript
describe('QualityCheckService Integration', () => {
  it('should pass both checks', async () => {
    const service = new QualityCheckService();
    const result = await service.check(
      '这是一篇关于人工智能的文章...',
      '写一篇关于AI的文章',
      {
        minWords: 10,
        maxWords: 1000,
        keywords: ['AI']
      }
    );
    expect(result.passed).toBe(true);
  });

  it('should fail hard rule and skip LLM', async () => {
    const service = new QualityCheckService();
    const result = await service.check(
      '短文',
      '写一篇文章',
      { minWords: 100, maxWords: 1000 }
    );
    expect(result.hardConstraintsPassed).toBe(false);
    expect(result.softScoring).toBeNull();
  });
});
```

---

## 性能优化

### 缓存策略

```typescript
// 缓存质量检查结果
async check(content: string, requirements: string, constraints: any) {
  const cacheKey = this.hashContent(content, requirements);

  // 检查缓存
  const cached = await this.cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 执行检查
  const result = await this.performCheck(content, requirements, constraints);

  // 缓存结果（3天）
  await this.cache.set(cacheKey, result, 259200);

  return result;
}
```

### 并行检查

```typescript
// 并行执行多个硬规则检查
async checkHardRules(content: string, constraints: any): Promise<CheckResult[]> {
  const checkers = [
    new WordCountChecker(),
    new KeywordChecker(),
    new StructureChecker(),
    new ForbiddenWordsChecker()
  ];

  const results = await Promise.all(
    checkers.map(checker => checker.check(content, constraints))
  );

  return results;
}
```

---

## 监控指标

### Prometheus 指标

```typescript
// 质量检查指标
const qualityCheckDuration = new Histogram({
  name: 'quality_check_duration_seconds',
  help: 'Quality check execution duration',
  buckets: [0.1, 0.5, 1, 5, 10, 30]
});

const qualityCheckPassRate = new Gauge({
  name: 'quality_check_pass_rate',
  help: 'Quality check pass rate'
});

const qualityCheckScore = new Histogram({
  name: 'quality_check_score',
  help: 'Quality check score distribution',
  buckets: [0, 3, 5, 7, 8, 9, 10]
});
```

---

**文档生成时间**: 2026-01-19
**版本**: 1.0
