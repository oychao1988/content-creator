# Workflow 架构扩展 - 后续开发指南

**文档版本**: 1.0
**更新时间**: 2026-01-28
**目标读者**: 开发者、架构师、技术负责人

---

## 一、如何添加新的工作流类型

本指南将引导您从头到尾创建一个新的工作流类型。

### 步骤 1: 规划和设计

#### 1.1 定义工作流目标

明确工作流要解决的问题：
- **输入**: 什么数据？
- **输出**: 产生什么结果？
- **流程**: 经历哪些步骤？
- **异常**: 如何处理错误？

**示例**：摘要工作流
```yaml
目标: 将长文章浓缩为结构化摘要
输入:
  - articleContent: string (文章内容)
  - summaryLength: number (摘要长度)
输出:
  - summary: { title, keypoints, conclusion }
流程:
  1. 提取关键信息
  2. 生成摘要
  3. 格式化输出
异常:
  - 文章过短: 返回错误
  - 摘要失败: 重试 2 次
```

#### 1.2 设计状态接口

```typescript
import { BaseWorkflowState } from './BaseWorkflowState.js';

interface SummaryState extends BaseWorkflowState {
  // 输入参数
  articleContent: string;
  summaryLength: number;
  summaryStyle?: 'bullet' | 'paragraph' | 'structured';

  // 中间状态
  extractedInfo?: {
    title: string;
    keypoints: string[];
  };

  // 输出结果
  summary?: {
    title: string;
    keyPoints: string[];
    conclusion: string;
  };

  // 质量检查
  qualityScore?: number;
  qualityReport?: string;
}
```

**设计原则**:
- 继承 BaseWorkflowState 获得通用字段
- 清晰区分输入、中间、输出状态
- 可选字段使用 `?` 标记
- 添加质量相关字段

---

### 步骤 2: 实现工作流节点

#### 2.1 创建基类节点

```typescript
import { BaseNode } from './nodes/BaseNode.js';
import type { SummaryState } from './SummaryState.js';

class ExtractInfoNode extends BaseNode<SummaryState> {
  readonly name = 'extract_info';
  readonly description = 'Extract key information from article';

  async executeLogic(
    state: SummaryState
  ): Promise<Partial<SummaryState>> {
    this.logger.info('Extracting information from article', {
      contentLength: state.articleContent.length,
    });

    // 实现提取逻辑
    const extracted = await this.extractKeyPoints(state.articleContent);

    return {
      extractedInfo: extracted,
      currentStep: 'extract_info',
      updatedAt: new Date(),
    };
  }

  private async extractKeyPoints(content: string): Promise<{
    title: string;
    keypoints: string[];
  }> {
    // 使用 LLM 提取关键信息
    const prompt = `
Extract the title and key points from the following article:

Article:
${content}

Return in JSON format:
{
  "title": "Article title",
  "keypoints": ["point 1", "point 2", ...]
}
`;

    const result = await this.llmService.generate(prompt);
    return JSON.parse(result);
  }
}
```

#### 2.2 创建摘要节点

```typescript
class GenerateSummaryNode extends BaseNode<SummaryState> {
  readonly name = 'generate_summary';
  readonly description = 'Generate article summary';

  async executeLogic(
    state: SummaryState
  ): Promise<Partial<SummaryState>> {
    this.logger.info('Generating summary', {
      style: state.summaryStyle || 'structured',
    });

    const summary = await this.generateSummary(
      state.extractedInfo!,
      state.summaryLength,
      state.summaryStyle
    );

    return {
      summary,
      currentStep: 'generate_summary',
      updatedAt: new Date(),
    };
  }

  private async generateSummary(
    info: { title: string; keypoints: string[] },
    length: number,
    style?: string
  ): Promise<{
    title: string;
    keyPoints: string[];
    conclusion: string;
  }> {
    // 实现摘要生成逻辑
    // ...
  }
}
```

#### 2.3 创建质检节点

```typescript
class QualityCheckNode extends BaseNode<SummaryState> {
  readonly name = 'quality_check';
  readonly description = 'Check summary quality';

  async executeLogic(
    state: SummaryState
  ): Promise<Partial<SummaryState>> {
    this.logger.info('Checking summary quality');

    const qualityResult = await this.checkQuality(state.summary!);

    return {
      qualityScore: qualityResult.score,
      qualityReport: qualityResult.report,
      currentStep: 'quality_check',
      updatedAt: new Date(),
    };
  }

  private async checkQuality(summary: any): Promise<{
    score: number;
    report: string;
  }> {
    // 实现质量检查逻辑
    // ...
  }
}
```

**节点开发原则**:
- 继承 BaseNode 获得通用功能
- 实现 executeLogic 方法
- 使用 logger 记录日志
- 返回部分状态更新
- 处理异常情况

---

### 步骤 3: 创建工作流图

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';
import type { CompiledGraph } from '@langchain/langgraph';
import type { SummaryState } from './SummaryState.js';
import { ExtractInfoNode } from './nodes/ExtractInfoNode.js';
import { GenerateSummaryNode } from './nodes/GenerateSummaryNode.js';
import { QualityCheckNode } from './nodes/QualityCheckNode.js';

export function createSummaryGraph(): CompiledGraph<SummaryState> {
  // 创建节点实例
  const extractNode = new ExtractInfoNode();
  const generateNode = new GenerateSummaryNode();
  const qualityNode = new QualityCheckNode();

  // 创建状态图
  const graph = new StateGraph<SummaryState>({
    channels: {
      // 定义所有状态字段
      taskId: { value: null, default: () => '' },
      mode: { value: null, default: () => 'sync' as const },
      workflowType: { value: null, default: () => 'summary' },
      currentStep: { value: null, default: () => 'start' },
      retryCount: { value: null, default: () => 0 },
      version: { value: null, default: () => 1 },
      createdAt: { value: null, default: () => new Date() },
      updatedAt: { value: null, default: () => new Date() },
      articleContent: { value: null },
      summaryLength: { value: null },
      summaryStyle: { value: null },
      extractedInfo: { value: null },
      summary: { value: null },
      qualityScore: { value: null },
      qualityReport: { value: null },
    },
  });

  // 添加节点
  graph.addNode('extract', extractNode);
  graph.addNode('generate', generateNode);
  graph.addNode('quality_check', qualityNode);

  // 添加边
  graph.addEdge(START, 'extract');
  graph.addEdge('extract', 'generate');
  graph.addEdge('generate', 'quality_check');

  // 添加条件边（质量检查后的路由）
  graph.addConditionalEdges(
    'quality_check',
    (state: SummaryState) => {
      // 质量分数 >= 8 通过，否则重试
      if (state.qualityScore && state.qualityScore >= 8) {
        return 'pass';
      }
      if (state.retryCount && state.retryCount < 2) {
        return 'retry';
      }
      return 'fail';
    },
    {
      pass: END,
      retry: 'generate', // 重试生成
      fail: END, // 失败也结束
    }
  );

  return graph.compile();
}
```

**工作流图设计原则**:
- 明确定义所有状态字段
- 节点命名清晰简洁
- 边的连接逻辑清晰
- 条件路由函数简单明了
- 添加必要的重试逻辑

---

### 步骤 4: 实现工作流工厂

```typescript
import type {
  WorkflowFactory,
  WorkflowMetadata,
  WorkflowExample,
} from '../WorkflowRegistry.js';
import type { SummaryState } from './SummaryState.js';
import { createSummaryGraph } from './createSummaryGraph.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('SummaryWorkflow');

const summaryWorkflowFactory: WorkflowFactory<SummaryState> = {
  // 基本信息
  type: 'summary',
  version: '1.0.0',
  name: '文章摘要',
  description: '将长文章浓缩为结构化摘要，包含标题、关键点和结论',

  // 元数据
  category: 'content-processing',
  tags: ['summary', 'nlp', 'content-analysis'],
  author: 'Your Name',
  createdAt: '2026-01-28',
  docsUrl: 'https://your-docs-url.com/summary-workflow',

  // 创建图
  createGraph: () => {
    logger.debug('Creating summary workflow graph');
    return createSummaryGraph();
  },

  // 创建初始状态
  createState: (params: any): SummaryState => {
    logger.debug('Creating summary workflow state', { params });

    return {
      // 基础字段
      taskId: params.taskId || '',
      mode: params.mode || 'sync',
      workflowType: 'summary',
      currentStep: 'start',
      retryCount: 0,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),

      // 工作流特定字段
      articleContent: params.articleContent,
      summaryLength: params.summaryLength || 300,
      summaryStyle: params.summaryStyle || 'structured',
    };
  },

  // 验证参数
  validateParams: (params: any): boolean => {
    logger.debug('Validating summary workflow params', { params });

    // 必需参数检查
    if (!params.articleContent || typeof params.articleContent !== 'string') {
      logger.error('Invalid articleContent', { params });
      return false;
    }

    if (!params.summaryLength || typeof params.summaryLength !== 'number') {
      logger.error('Invalid summaryLength', { params });
      return false;
    }

    // 可选参数验证
    if (params.summaryStyle) {
      const validStyles = ['bullet', 'paragraph', 'structured'];
      if (!validStyles.includes(params.summaryStyle)) {
        logger.error('Invalid summaryStyle', { params });
        return false;
      }
    }

    logger.info('Summary workflow params validated successfully');
    return true;
  },

  // 获取元数据
  getMetadata: (): WorkflowMetadata => {
    return {
      type: 'summary',
      version: '1.0.0',
      name: '文章摘要',
      description: '将长文章浓缩为结构化摘要',
      category: 'content-processing',
      tags: ['summary', 'nlp', 'content-analysis'],
      author: 'Your Name',
      createdAt: '2026-01-28',
      docsUrl: 'https://your-docs-url.com/summary-workflow',

      requiredParams: [
        'articleContent (string): 文章内容',
        'summaryLength (number): 摘要长度（字数）',
      ],

      optionalParams: [
        'summaryStyle (string): 摘要样式 - bullet/paragraph/structured',
      ],

      examples: [
        {
          name: '基础用法',
          description: '生成结构化摘要',
          params: {
            articleContent: '这是一篇关于 AI 的长文章...',
            summaryLength: 300,
            summaryStyle: 'structured',
          },
        },
        {
          name: '简短摘要',
          description: '生成简短的要点摘要',
          params: {
            articleContent: '这是一篇关于 AI 的长文章...',
            summaryLength: 100,
            summaryStyle: 'bullet',
          },
        },
      ],
    };
  },
};

export { summaryWorkflowFactory };
```

**工厂实现原则**:
- 实现所有接口方法
- 详细的日志记录
- 完整的参数验证
- 丰富的元数据信息
- 提供多个使用示例

---

### 步骤 5: 注册工作流

#### 5.1 方式一：手动注册

```typescript
import { WorkflowRegistry } from './WorkflowRegistry.js';
import { summaryWorkflowFactory } from './workflows/SummaryWorkflow/summaryWorkflowFactory.js';

// 注册工作流
WorkflowRegistry.register(summaryWorkflowFactory);

logger.info('Summary workflow registered successfully');
```

#### 5.2 方式二：自动注册（推荐）

```typescript
// src/domain/workflow/workflows/index.ts
export * from './SummaryWorkflow/summaryWorkflowFactory.js';

// src/domain/workflow/index.ts
import './workflows/index.js'; // 自动注册所有工作流
```

**注册最佳实践**:
- 在应用启动时注册
- 使用统一的注册入口
- 记录注册日志
- 处理注册冲突

---

### 步骤 6: 编写测试

#### 6.1 单元测试

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { summaryWorkflowFactory } from '../summaryWorkflowFactory.js';

describe('SummaryWorkflowFactory', () => {
  beforeEach(() => {
    // 初始化测试环境
  });

  describe('createState', () => {
    it('should create initial state with required params', () => {
      const params = {
        taskId: 'test-123',
        articleContent: 'Test article content',
        summaryLength: 300,
      };

      const state = summaryWorkflowFactory.createState(params);

      expect(state.workflowType).toBe('summary');
      expect(state.articleContent).toBe(params.articleContent);
      expect(state.summaryLength).toBe(params.summaryLength);
      expect(state.summaryStyle).toBe('structured'); // 默认值
    });

    it('should use default values for optional params', () => {
      const params = {
        taskId: 'test-123',
        articleContent: 'Test',
        summaryLength: 200,
      };

      const state = summaryWorkflowFactory.createState(params);

      expect(state.summaryStyle).toBe('structured');
      expect(state.mode).toBe('sync');
    });
  });

  describe('validateParams', () => {
    it('should validate required params', () => {
      const validParams = {
        articleContent: 'Test content',
        summaryLength: 300,
      };

      expect(summaryWorkflowFactory.validateParams(validParams)).toBe(true);
    });

    it('should reject invalid params', () => {
      const invalidParams = {
        articleContent: null, // 无效
        summaryLength: '300', // 应该是数字
      };

      expect(summaryWorkflowFactory.validateParams(invalidParams)).toBe(false);
    });

    it('should validate optional params', () => {
      const params = {
        articleContent: 'Test',
        summaryLength: 300,
        summaryStyle: 'invalid', // 无效样式
      };

      expect(summaryWorkflowFactory.validateParams(params)).toBe(false);
    });
  });

  describe('createGraph', () => {
    it('should create compiled graph', () => {
      const graph = summaryWorkflowFactory.createGraph();

      expect(graph).toBeDefined();
      expect(graph.name).toBeDefined();
    });
  });

  describe('getMetadata', () => {
    it('should return complete metadata', () => {
      const metadata = summaryWorkflowFactory.getMetadata();

      expect(metadata.type).toBe('summary');
      expect(metadata.name).toBe('文章摘要');
      expect(metadata.category).toBe('content-processing');
      expect(metadata.tags).toContain('summary');
      expect(metadata.requiredParams).toBeDefined();
      expect(metadata.examples).toHaveLength.greaterThan(0);
    });
  });
});
```

#### 6.2 集成测试

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowRegistry } from '../WorkflowRegistry.js';
import { summaryWorkflowFactory } from '../workflows/SummaryWorkflow/summaryWorkflowFactory.js';

describe('Summary Workflow Integration', () => {
  beforeEach(() => {
    // 注册工作流
    WorkflowRegistry.register(summaryWorkflowFactory);
  });

  it('should be registered in WorkflowRegistry', () => {
    expect(WorkflowRegistry.has('summary')).toBe(true);
  });

  it('should be retrievable from WorkflowRegistry', () => {
    const factory = WorkflowRegistry.get('summary');
    expect(factory).toBeDefined();
    expect(factory.type).toBe('summary');
  });

  it('should appear in workflow list', () => {
    const workflows = WorkflowRegistry.listWorkflows();
    const summaryWorkflow = workflows.find(w => w.type === 'summary');

    expect(summaryWorkflow).toBeDefined();
    expect(summaryWorkflow?.name).toBe('文章摘要');
  });

  it('should be filterable by category', () => {
    const workflows = WorkflowRegistry.listWorkflows({
      category: 'content-processing',
    });

    expect(workflows.length).toBe.greaterThan(0);
    expect(workflows[0].category).toBe('content-processing');
  });

  it('should be filterable by tag', () => {
    const workflows = WorkflowRegistry.listWorkflows({
      tags: ['summary'],
    });

    expect(workflows.length).toBe.greaterThan(0);
    expect(workflows[0].tags).toContain('summary');
  });
});
```

**测试编写原则**:
- 测试所有公共方法
- 覆盖边界条件
- 测试错误情况
- 保持测试独立性
- 使用清晰的测试名称

---

### 步骤 7: 编写文档

#### 7.1 使用指南文档

```markdown
# 文章摘要工作流使用指南

## 概述

文章摘要工作流可以将长文章浓缩为结构化摘要，包含标题、关键点和结论。

## 功能特性

- ✅ 支持多种摘要样式
- ✅ 可配置摘要长度
- ✅ LLM 驱动的智能摘要
- ✅ 质量检查机制
- ✅ 自动重试

## 使用方法

### 基础用法

\`\`\`typescript
import { createSyncExecutor } from './application/workflow/SyncExecutor.js';

const executor = createSyncExecutor(repository);

const result = await executor.execute({
  type: 'summary',
  articleContent: '这是一篇关于 AI 的长文章...',
  summaryLength: 300,
  summaryStyle: 'structured',
});
\`\`\`

### 参数说明

#### 必需参数

| 参数 | 类型 | 说明 |
|------|------|------|
| articleContent | string | 文章内容（至少 100 字） |
| summaryLength | number | 摘要长度（字数） |

#### 可选参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| summaryStyle | string | 'structured' | 摘要样式：bullet/paragraph/structured |
| mode | string | 'sync' | 执行模式：sync/async |

### 摘要样式

- **bullet**: 项目符号列表
- **paragraph**: 段落形式
- **structured**: 结构化（标题 + 要点 + 结论）

## 示例

### 示例 1: 生成结构化摘要

\`\`\`typescript
const result = await executor.execute({
  type: 'summary',
  articleContent: article,
  summaryLength: 300,
  summaryStyle: 'structured',
});

console.log(result.data.summary);
// {
//   title: "文章标题",
//   keyPoints: ["要点1", "要点2"],
//   conclusion: "结论"
// }
\`\`\`

### 示例 2: 生成简短摘要

\`\`\`typescript
const result = await executor.execute({
  type: 'summary',
  articleContent: article,
  summaryLength: 100,
  summaryStyle: 'bullet',
});
\`\`\`

## 质量检查

摘要会经过质量检查，评分范围 0-10：
- 8-10 分：优秀，直接返回
- 6-7 分：良好，返回结果
- 0-5 分：较差，重试生成（最多 2 次）

## 错误处理

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 文章过短 | 少于 100 字 | 提供更长的文章 |
| 生成失败 | LLM 错误 | 系统会自动重试 |
| 质量不达标 | 重试 2 次后仍不达标 | 检查文章质量或调整参数 |

## 性能指标

- 平均执行时间: 30-60 秒
- 平均质量分数: 8.5/10
- 重试成功率: 85%
\`\`\`
```

#### 7.2 开发指南文档

```markdown
# 文章摘要工作流开发指南

## 架构设计

### 状态管理

\`\`\`typescript
interface SummaryState extends BaseWorkflowState {
  articleContent: string;      // 输入
  summaryLength: number;        // 输入
  extractedInfo?: {            // 中间状态
    title: string;
    keypoints: string[];
  };
  summary?: {                  // 输出
    title: string;
    keyPoints: string[];
    conclusion: string;
  };
  qualityScore?: number;       // 质量评分
}
\`\`\`

### 节点设计

1. **ExtractInfoNode**: 提取关键信息
2. **GenerateSummaryNode**: 生成摘要
3. **QualityCheckNode**: 质量检查

### 执行流程

\`\`\`
START → ExtractInfo → GenerateSummary → QualityCheck
                                          ↓
                                    [质量判断]
                                          ↓
                         ┌──────────────┼──────────────┐
                         ↓              ↓              ↓
                      pass (≥8)    retry (<2次)    fail (≥2次)
                         ↓              ↓              ↓
                        END        GenerateSummary   END
\`\`\`

## 扩展指南

### 添加新的摘要样式

1. 在 SummaryState 中添加新样式枚举
2. 修改 GenerateSummaryNode 支持新样式
3. 更新 validateParams 验证逻辑
4. 添加测试用例
5. 更新文档

### 自定义质量检查

1. 创建自定义 QualityCheckNode
2. 实现自定义评分逻辑
3. 调整重试阈值
4. 添加测试验证

## 调试技巧

### 查看日志

\`\`\`bash
LOG_LEVEL=debug pnpm run cli create --type summary ...
\`\`\`

### 单独测试节点

\`\`\`typescript
const node = new ExtractInfoNode();
const result = await node.executeLogic(state);
\`\`\`

### 查看工作流信息

\`\`\`bash
pnpm run cli workflow info summary
\`\`\`
```

**文档编写原则**:
- 结构清晰，易于导航
- 包含完整示例
- 提供最佳实践
- 说明错误处理
- 更新及时

---

### 步骤 8: 更新 CLI（可选）

如果工作流需要 CLI 支持，添加命令参数：

```typescript
// src/presentation/cli/commands/create.ts
createCommand
  .option('--article-content <content>', '文章内容')
  .option('--summary-length <length>', '摘要长度', parseInteger)
  .option('--summary-style <style>', '摘要样式');
```

---

## 二、如何扩展现有工作流

### 2.1 添加新节点

**场景**: 在内容创作工作流中添加 SEO 优化节点

#### 步骤 1: 定义状态字段

```typescript
// src/domain/workflow/State.ts
export interface WorkflowState extends BaseWorkflowState {
  // ... 现有字段

  // 新增 SEO 相关字段
  seoScore?: number;
  seoReport?: string;
  keywords?: string[];
}
```

#### 步骤 2: 创建节点

```typescript
// src/domain/workflow/nodes/SEOOptimizeNode.ts
import { BaseNode } from './BaseNode.js';
import type { WorkflowState } from '../State.js';

export class SEOOptimizeNode extends BaseNode<WorkflowState> {
  readonly name = 'seo_optimize';
  readonly description = 'Optimize content for SEO';

  async executeLogic(state: WorkflowState): Promise<Partial<WorkflowState>> {
    this.logger.info('Starting SEO optimization');

    // SEO 优化逻辑
    const seoResult = await this.optimizeSEO(state.articleContent!);

    return {
      seoScore: seoResult.score,
      seoReport: seoResult.report,
      keywords: seoResult.keywords,
      updatedAt: new Date(),
    };
  }

  private async optimizeSEO(content: string): Promise<{
    score: number;
    report: string;
    keywords: string[];
  }> {
    // 实现优化逻辑
    // ...
  }
}
```

#### 步骤 3: 集成到工作流图

```typescript
// src/domain/workflow/ContentCreatorGraph.ts
import { SEOOptimizeNode } from './nodes/SEOOptimizeNode.js';

export function createSimpleContentCreatorGraph() {
  // ... 现有代码

  // 添加新节点
  const seoNode = new SEOOptimizeNode();
  graph.addNode('seo_optimize', seoNode);

  // 连接到现有流程（在质量检查之后）
  graph.addEdge('checkText', 'seo_optimize');
  graph.addEdge('seo_optimize', 'generateImage');
  // 或：graph.addEdge('seo_optimize', END); 如果作为最后一步

  return graph.compile();
}
```

#### 步骤 4: 添加测试

```typescript
describe('SEOOptimizeNode', () => {
  it('should optimize content for SEO', async () => {
    const node = new SEOOptimizeNode();
    const state = {
      articleContent: 'Test content...',
    };

    const result = await node.executeLogic(state);

    expect(result.seoScore).toBeDefined();
    expect(result.seoScore).toBe.greaterThan(0);
    expect(result.keywords).toBeInstanceOf(Array);
  });
});
```

### 2.2 修改现有节点

**场景**: 增强 WriteNode 支持更多写作风格

#### 步骤 1: 扩展状态接口

```typescript
export interface WorkflowState extends BaseWorkflowState {
  // 现有字段
  writingStyle?: 'professional' | 'casual' | 'creative' | 'technical';
  tone?: string;
}
```

#### 步骤 2: 修改节点实现

```typescript
// src/domain/workflow/nodes/WriteNode.ts
async executeLogic(state: WorkflowState): Promise<Partial<WorkflowState>> {
  // 使用新的写作风格
  const style = state.writingStyle || 'professional';
  const tone = state.tone || 'neutral';

  const content = await this.generateArticle({
    topic: state.topic,
    requirements: state.requirements,
    style,
    tone,
    // ... 其他参数
  });

  return {
    articleContent: content,
    // ...
  };
}
```

#### 步骤 3: 更新验证逻辑

```typescript
// src/domain/workflow/adapters/ContentCreatorWorkflowAdapter.ts
validateParams: (params: any): boolean => {
  // 验证写作风格
  if (params.writingStyle) {
    const validStyles = ['professional', 'casual', 'creative', 'technical'];
    if (!validStyles.includes(params.writingStyle)) {
      return false;
    }
  }

  // ... 其他验证
  return true;
}
```

#### 步骤 4: 更新元数据

```typescript
getMetadata: () => ({
  // ... 现有元数据
  optionalParams: [
    // ... 现有参数
    'writingStyle (string): 写作风格 - professional/casual/creative/technical',
    'tone (string): 语气',
  ],
  examples: [
    {
      name: '技术博客风格',
      description: '生成专业技术博客',
      params: {
        topic: 'AI 技术',
        writingStyle: 'technical',
        tone: 'informative',
      },
    },
  ],
})
```

### 2.3 调整工作流流程

**场景**: 支持条件分支，根据内容长度决定是否生成图片

```typescript
// src/domain/workflow/ContentCreatorGraph.ts

// 添加条件路由函数
function routeAfterWrite(state: WorkflowState): string {
  const contentLength = state.articleContent?.length || 0;

  // 内容超过 1000 字才生成图片
  if (contentLength > 1000) {
    return 'generate_image';
  }

  return 'skip_image';
}

// 添加跳过图片的节点
const skipImageNode = new BaseNode({
  name: 'skip_image',
  async executeLogic(state: WorkflowState) {
    this.logger.info('Skipping image generation (content too short)');
    return {
      images: [],
      currentStep: 'skip_image',
      updatedAt: new Date(),
    };
  },
});

graph.addNode('skip_image', skipImageNode);

// 使用条件边
graph.addConditionalEdges('write', routeAfterWrite, {
  generate_image: 'generateImage',
  skip_image: 'skip_image',
});

// 两个分支最终汇合
graph.addEdge('generateImage', END);
graph.addEdge('skip_image', END);
```

---

## 三、代码维护指南

### 3.1 代码规范

#### TypeScript 规范

```typescript
// ✅ 好的做法
interface MyState extends BaseWorkflowState {
  readonly field1: string;  // 使用 readonly
  field2?: number;          // 可选字段使用 ?
}

class MyNode extends BaseNode<MyState> {
  readonly name = 'my_node';  // 使用 readonly
  readonly description = 'Node description';

  async executeLogic(state: MyState): Promise<Partial<MyState>> {
    // 实现逻辑
    return { /* updates */ };
  }
}

// ❌ 避免的做法
interface MyState {
  field1: string;  // 缺少 readonly
  field2: number;  // 应该是可选的
}

class MyNode {
  name: string = 'my_node';  // 应该是 readonly
}
```

#### 命名规范

```typescript
// 接口：PascalCase，以 I 开头（可选）
interface WorkflowState { }
interface IWorkflowFactory { }

// 类：PascalCase
class WorkflowRegistry { }
class BaseNode { }

// 函数：camelCase
function createGraph() { }
function validateParams() { }

// 常量：UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;
const DEFAULT_TIMEOUT = 30000;

// 私有成员：_camelCase
class MyClass {
  private _internalState: any;
  private _helperMethod() { }
}
```

#### 文件组织

```
src/domain/workflow/
├── BaseWorkflowState.ts
├── WorkflowRegistry.ts
├── State.ts
├── ContentCreatorGraph.ts
├── index.ts
├── nodes/
│   ├── BaseNode.ts
│   ├── index.ts
│   ├── WriteNode.ts
│   └── CheckTextNode.ts
├── adapters/
│   └── ContentCreatorWorkflowAdapter.ts
└── examples/
    ├── TranslationWorkflow.ts
    └── __tests__/
```

### 3.2 测试策略

#### 测试金字塔

```
       /\
      /E2E\        少量端到端测试
     /------\
    /集成测试 \      适量集成测试
   /----------\
  /  单元测试   \    大量单元测试
 /--------------\
```

#### 单元测试

```typescript
describe('MyComponent', () => {
  // 测试正常情况
  it('should work correctly with valid input', () => {
    // Arrange
    const input = { /* valid input */ };

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe(expected);
  });

  // 测试边界条件
  it('should handle edge cases', () => {
    expect(functionUnderTest(null)).toThrow();
    expect(functionUnderTest('')).toEqual(defaultValue);
  });

  // 测试异步操作
  it('should handle async operations', async () => {
    const result = await asyncFunction();
    expect(result).toBeDefined();
  });
});
```

#### 集成测试

```typescript
describe('Workflow Integration', () => {
  it('should execute complete workflow', async () => {
    const executor = createSyncExecutor(repository);
    const result = await executor.execute({
      type: 'content-creator',
      topic: 'Test',
      requirements: 'Test requirements',
    });

    expect(result.status).toBe('completed');
    expect(result.data).toBeDefined();
  });
});
```

### 3.3 文档更新流程

#### 文档类型

1. **设计文档**: 为什么这样设计
2. **实施指南**: 如何实现
3. **使用指南**: 如何使用
4. **API 文档**: 接口说明
5. **变更日志**: 记录变更

#### 更新流程

```
代码变更
  ↓
更新相关文档
  ↓
代码审查（包含文档审查）
  ↓
合并到主分支
  ↓
发布新版本（包含文档）
```

#### 文档模板

```markdown
# 功能/模块名称

## 概述
简要说明功能或模块的作用

## 功能特性
- 特性 1
- 特性 2

## 使用方法
\`\`\`typescript
// 代码示例
\`\`\`

## API 参考
### 方法名
参数说明和返回值

## 示例
完整的使用示例

## 注意事项
重要的使用注意点

## 相关文档
相关文档链接
```

### 3.4 版本管理

#### 语义化版本

```
MAJOR.MINOR.PATCH

MAJOR: 破坏性变更
MINOR: 新功能（向后兼容）
PATCH: Bug 修复（向后兼容）
```

示例：
- `1.0.0` → `1.0.1`: Bug 修复
- `1.0.1` → `1.1.0`: 新增功能
- `1.1.0` → `2.0.0`: 破坏性变更

#### 变更日志模板

```markdown
# Changelog

## [2.0.0] - 2026-01-28

### Added
- 新工作流类型支持
- CLI 工作流管理命令

### Changed
- WorkflowState 继承 BaseWorkflowState
- 执行器支持动态工作流选择

### Deprecated
- 旧的直接创建图的方式（将在 3.0.0 移除）

### Removed
- 移除了未使用的 XYZ 模块

### Fixed
- 修复工作流注册的竞态条件
```

---

## 四、发布流程建议

### 4.1 发布前检查清单

#### 代码质量
- [ ] 所有测试通过
- [ ] 代码审查完成
- [ ] TypeScript 编译无错误
- [ ] ESLint 无警告
- [ ] 代码覆盖率符合要求

#### 文档完整性
- [ ] 设计文档更新
- [ ] API 文档更新
- [ ] 使用指南更新
- [ ] 变更日志更新
- [ ] README 更新

#### 兼容性
- [ ] 向后兼容性验证
- [ ] 现有测试通过
- [ ] 数据迁移脚本（如需要）
- [ ] 依赖版本检查

#### 性能
- [ ] 性能测试通过
- [ ] 无内存泄漏
- [ ] 无性能退化
- [ ] 资源使用正常

### 4.2 发布流程

#### 1. 创建发布分支

```bash
git checkout -b release/v2.0.0
```

#### 2. 更新版本号

```typescript
// package.json
{
  "version": "2.0.0"
}

// 或使用 npm version
npm version major/minor/patch
```

#### 3. 更新 CHANGELOG

```markdown
## [2.0.0] - 2026-01-28
### Added
- ...
```

#### 4. 构建和测试

```bash
pnpm run build
pnpm run test
pnpm run lint
```

#### 5. 提交和打标签

```bash
git add .
git commit -m "chore: release v2.0.0"
git tag -a v2.0.0 -m "Release v2.0.0"
git push origin release/v2.0.0
git push origin v2.0.0
```

#### 6. 合并到主分支

```bash
git checkout main
git merge release/v2.0.0
git push origin main
```

#### 7. 发布公告

创建 GitHub Release：
- 标题：v2.0.0
- 描述：包含主要变更和升级指南
- 附件：构建产物

### 4.3 发布后

#### 监控
- 监控错误日志
- 观察性能指标
- 收集用户反馈

#### 准备 Hotfix
如果发现严重问题：
1. 创建 hotfix 分支
2. 修复问题
3. 快速发布
4. 更新版本号（PATCH）

#### 后续支持
- 回答用户问题
- 修复 Bug
- 收集改进建议
- 规划下一版本

---

## 五、最佳实践总结

### 5.1 开发流程

1. **设计先行**: 先设计，再编码
2. **测试驱动**: 先写测试，再写实现
3. **小步迭代**: 频繁提交，小步前进
4. **代码审查**: 所有代码需要审查
5. **文档同步**: 代码和文档同步更新

### 5.2 代码质量

1. **类型安全**: 充分利用 TypeScript
2. **单一职责**: 每个函数/类只做一件事
3. **命名清晰**: 见名知意
4. **注释适度**: 代码自解释，注释说明原因
5. **错误处理**: 完整的错误处理和日志

### 5.3 团队协作

1. **统一规范**: 遵循团队编码规范
2. **代码审查**: 互相审查代码
3. **知识分享**: 定期技术分享
4. **文档维护**: 共同维护文档
5. **持续改进**: 不断优化流程

---

## 六、常见问题 FAQ

### Q1: 如何调试工作流执行？

**A**:
```bash
# 启用调试日志
LOG_LEVEL=debug pnpm run cli create --type <workflow-type> ...

# 查看工作流信息
pnpm run cli workflow info <workflow-type>

# 使用测试框架调试
pnpm run test -- --inspect-brk
```

### Q2: 工作流注册失败怎么办？

**A**: 检查以下几点：
1. WorkflowFactory 接口是否完整实现
2. type 是否唯一
3. 语法错误或类型错误
4. 查看日志中的错误信息

### Q3: 如何优化工作流性能？

**A**:
1. 缓存工作流图
2. 复用节点实例
3. 并行执行独立节点
4. 优化 LLM 调用
5. 使用性能分析工具

### Q4: 如何处理工作流版本升级？

**A**:
1. 保持向后兼容
2. 提供迁移工具
3. 更新文档
4. 通知用户
5. 设置弃用期

### Q5: 如何贡献自定义工作流？

**A**:
1. Fork 项目仓库
2. 创建工作流分支
3. 按照本指南开发
4. 添加测试和文档
5. 提交 Pull Request

---

## 七、相关资源

### 内部文档
- [工作流架构设计](./workflow-extension-design.md)
- [工作流扩展总结](./workflow-extension-SUMMARY.md)
- [工作流对比分析](./workflow-extension-COMPARISON.md)
- [翻译工作流指南](./translation-workflow-guide.md)

### 外部资源
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [TypeScript 手册](https://www.typescriptlang.org/docs/)
- [Node.js 最佳实践](https://github.com/goldbergyoni/nodebestpractices)

---

**文档维护**: 请在每次工作流扩展后更新本文档
**问题反馈**: 提交 Issue 或 Pull Request
**最后更新**: 2026-01-28
