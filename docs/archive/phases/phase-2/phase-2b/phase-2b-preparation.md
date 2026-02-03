# 阶段 2b 准备工作：LangGraph 工作流实现

**项目**: Content Creator (写作 Agent)
**阶段**: 2b - LangGraph 工作流实现
**准备日期**: 2025-01-18
**状态**: 准备中

---

## 📊 当前进度更新

### 整体进度：**40%** 完成

```
阶段 1 [████████████████████] 100% ✅ (数据层)
阶段 2a [████████████████████] 100% ✅ (基础设施)
阶段 2b [░░░░░░░░░░░░░░░░░░░░]   0% ⏳ (工作流实现)
阶段 3  [░░░░░░░░░░░░░░░░░░░░]   0% (待开始)
阶段 4  [░░░░░░░░░░░░░░░░░░░░]   0% (待开始)
```

### 已完成工作总结

#### 阶段 1：核心数据层（100%）
- ✅ 5 个领域实体（Task, TaskStep, QualityCheck, Result, TokenUsage）
- ✅ Repository 层（BaseRepository, TaskRepository）
- ✅ 数据库迁移脚本（6 张表）
- ✅ 乐观锁并发控制
- ✅ Worker 抢占机制

**代码量**: ~2,130 行

#### 阶段 2a：LangGraph 基础设施（100%）
- ✅ LangGraph 依赖安装（@langchain/langgraph@0.0.26）
- ✅ Workflow State 定义（完整接口 + 工具类）
- ✅ BaseNode 基类（错误处理、重试、Token 记录）
- ✅ Enhanced LLM Service（重试机制、成本追踪）
- ✅ CheckpointManager（断点续传）

**代码量**: ~1,290 行

**总代码量**: ~3,420 行

---

## 🎯 阶段 2b 目标

### 时间规划：7-11 天

#### 1. MCP Search 集成（2 天）
- 研究 MCP 协议和 Tavily API
- 创建 MCP Client 封装
- 实现搜索结果解析
- 实现搜索缓存（Redis）
- 编写集成测试

#### 2. Prompt 工程与优化（2 天）
- 设计 Write Node Prompt 模板
- 设计 CheckText Node Prompt 模板
- 设计 Organize Node Prompt 模板
- 实现 Prompt 版本管理
- A/B 测试不同 Prompt 变体

#### 3. 实现 6 个核心节点（4-6 天）
- Search Node（搜索）
- Organize Node（整理）
- Write Node（写作）
- CheckText Node（文本质检）
- GenerateImage Node（生成配图）
- CheckImage Node（配图质检）

#### 4. 构建工作流图（1 天）
- 创建 StateGraph 实例
- 添加所有节点
- 配置条件路由
- 配置循环（质检失败重试）

#### 5. 调试和测试（1-2 天）
- 端到端测试
- 质量检查重试测试
- 崩溃恢复测试

---

## 📚 节点实现详解

### 节点 1：Search Node（搜索节点）

#### 职责
根据选题搜索相关资料，为后续写作提供参考素材。

#### 输入
- `state.topic` - 选题关键词
- `state.requirements` - 写作要求
- `state.hardConstraints.keywords` - 必须包含的关键词

#### 输出
- `state.searchQuery` - 搜索关键词
- `state.searchResults` - 搜索结果列表

#### 实现要点

**1. 生成搜索查询**
```typescript
// 根据选题生成搜索关键词
function generateSearchQuery(topic: string, keywords?: string[]): string {
  const baseQuery = topic;

  if (keywords && keywords.length > 0) {
    // 组合关键词
    return `${baseQuery} ${keywords.slice(0, 3).join(' ')}`;
  }

  return baseQuery;
}
```

**2. 调用搜索 API**
```typescript
// 使用 SearchService
const searchResponse = await searchService.searchWithAnswer(
  state.searchQuery || generateSearchQuery(state.topic, state.hardConstraints.keywords),
  10  // 最多 10 条结果
);
```

**3. 保存搜索结果**
```typescript
return {
  searchQuery: searchResponse.query,
  searchResults: searchResponse.results.map(item => ({
    title: item.title,
    url: item.url,
    content: item.content,
    score: item.score,
    publishedDate: item.publishedDate,
  })),
};
```

**4. Redis 缓存（优化）**
```typescript
// 生成缓存键
const cacheKey = `search:${hashQuery(searchQuery)}`;

// 检查缓存
const cached = await redis.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

// 调用 API
const results = await searchService.search(...);

// 保存到缓存（24 小时）
await redis.setex(cacheKey, 86400, JSON.stringify(results));
```

#### 验收标准
- ✅ 可以成功调用 Tavily API
- ✅ 搜索结果正确解析
- ✅ Redis 缓存正常工作
- ✅ 搜索失败时有降级策略

---

### 节点 2：Organize Node（整理节点）

#### 职责
整理搜索结果，生成文章大纲和关键点。

#### 输入
- `state.searchResults` - 搜索结果列表
- `state.requirements` - 写作要求

#### 输出
- `state.organizedInfo.outline` - 文章大纲
- `state.organizedInfo.keyPoints` - 关键点列表
- `state.organizedInfo.summary` - 摘要

#### Prompt 模板

```typescript
const ORGANIZE_PROMPT = `你是一位专业的内容策划。请根据以下搜索结果，整理出文章的大纲和关键点。

【选题】{topic}

【要求】{requirements}

【搜索结果】
{searchResults}

请按以下格式输出：

1. **文章大纲**（Markdown 格式）
   - 一级标题
   - 二级标题
   - 关键点

2. **关键点列表**（3-5 个）
   - 每个关键点 50-100 字

3. **摘要**（100-150 字）
   - 概括文章核心内容

请以 JSON 格式返回：
{
  "outline": "完整大纲（Markdown）",
  "keyPoints": ["关键点1", "关键点2", ...],
  "summary": "文章摘要"
}
`;
```

#### 实现要点

**1. 准备搜索结果**
```typescript
// 格式化搜索结果供 LLM 使用
const formattedResults = state.searchResults
  .map((result, index) => `
${index + 1}. ${result.title}
   URL: ${result.url}
   内容: ${result.content.substring(0, 500)}...
  `)
  .join('\n\n');
```

**2. 构建 Prompt**
```typescript
const prompt = ORGANIZE_PROMPT
  .replace('{topic}', state.topic)
  .replace('{requirements}', state.requirements)
  .replace('{searchResults}', formattedResults);
```

**3. 调用 LLM**
```typescript
const result = await enhancedLLMService.generateText(
  prompt,
  '你是一位专业的内容策划。请严格按照要求输出 JSON 格式。'
);

// 解析 JSON 响应
const organized = JSON.parse(result);
```

**4. 验证输出**
```typescript
// 验证必需字段
if (!organized.outline || !organized.keyPoints || !organized.summary) {
  throw new Error('Organize output missing required fields');
}

// 验证关键点数量
if (organized.keyPoints.length < 3) {
  throw new Error('At least 3 key points required');
}
```

#### 验收标准
- ✅ 生成的大纲结构清晰
- ✅ 关键点数量 3-5 个
- ✅ 摘要长度 100-150 字
- ✅ LLM 输出正确解析为 JSON

---

### 节点 3：Write Node（写作节点）

#### 职责
根据整理后的信息撰写文章内容。

#### 输入
- `state.organizedInfo` - 整理后的信息
- `state.searchResults` - 搜索结果
- `state.hardConstraints` - 硬性约束
- `state.previousContent` - 上一版内容（重写时）
- `state.textQualityReport.fixSuggestions` - 质检反馈（重写时）

#### 输出
- `state.articleContent` - 文章内容（Markdown）

#### Prompt 模板

**初始写作**：
```typescript
const WRITE_PROMPT = `你是一位专业的内容创作者。根据以下信息撰写一篇文章：

【主题】{topic}

【要求】{requirements}

【硬性约束】
- 字数：{minWords} - {maxWords} 字
- 必须包含关键词：{keywords}

【参考资料】
1. 搜索结果：
{searchResults}

2. 文章大纲：
{outline}

3. 关键点：
{keyPoints}

请撰写一篇完整的文章，确保：
1. 内容原创，不抄袭
2. 逻辑清晰，条理分明
3. 语言流畅，表达准确
4. 严格遵守硬性约束要求
5. 包含标题、导语、正文、结语

以 Markdown 格式输出完整文章。
`;
```

**重写模式**（有质检反馈时）：
```typescript
const REWRITE_PROMPT = `你是一位专业的内容创作者。根据以下质检反馈，修改上一版文章：

【质检反馈】
{fixSuggestions}

【要求】
1. 只修改有问题的部分
2. 保持已经合格的内容不变
3. 确保修改后不引入新问题
4. 严格遵守硬性约束要求

【上一版文章】
{previousContent}

请输出修改后的完整文章（Markdown 格式）。
`;
```

#### 实现要点

**1. 判断是否为重写模式**
```typescript
const isRewrite = !!(
  state.previousContent &&
  state.textQualityReport?.fixSuggestions
);
```

**2. 选择合适的 Prompt**
```typescript
const prompt = isRewrite
  ? REWRITE_PROMPT
  : WRITE_PROMPT;
```

**3. 构建 Prompt 参数**
```typescript
const promptParams = {
  topic: state.topic,
  requirements: state.requirements,
  minWords: state.hardConstraints.minWords || 500,
  maxWords: state.hardConstraints.maxWords || 1000,
  keywords: state.hardConstraints.keywords?.join(', ') || '无',
  searchResults: formatSearchResults(state.searchResults),
  outline: state.organizedInfo?.outline || '',
  keyPoints: state.organizedInfo?.keyPoints?.join('\n') || '',
  previousContent: state.previousContent || '',
  fixSuggestions: state.textQualityReport?.fixSuggestions?.join('\n') || '',
};
```

**4. 调用 LLM 并记录 Token**
```typescript
const result = await enhancedLLMService.chat({
  messages: [
    { role: 'system', content: '你是一位专业的内容创作者。' },
    { role: 'user', content: prompt.replace(/\{(\w+)\}/g, (_, key) => promptParams[key]) },
  ],
  taskId: state.taskId,
  stepName: 'write',
});

// Token 使用和成本已自动记录
```

**5. 验证输出**
```typescript
// 检查字数
const wordCount = result.content.length;
if (state.hardConstraints.minWords && wordCount < state.hardConstraints.minWords) {
  throw new Error(`Word count insufficient: ${wordCount} < ${state.hardConstraints.minWords}`);
}

if (state.hardConstraints.maxWords && wordCount > state.hardConstraints.maxWords) {
  throw new Error(`Word count exceeded: ${wordCount} > ${state.hardConstraints.maxWords}`);
}

// 检查关键词
if (state.hardConstraints.keywords) {
  const missingKeywords = state.hardConstraints.keywords.filter(
    keyword => !result.content.includes(keyword)
  );

  if (missingKeywords.length > 0) {
    throw new Error(`Missing keywords: ${missingKeywords.join(', ')}`);
  }
}
```

#### 验收标准
- ✅ 生成文章符合要求
- ✅ 字数在范围内
- ✅ 包含所有关键词
- ✅ 结构完整（标题、导语、正文、结语）
- ✅ 重写模式下只修改有问题部分

---

### 节点 4：CheckText Node（文本质检节点）

#### 职责
对文章进行质量检查，包括硬规则检查和 LLM 软评分。

#### 输入
- `state.articleContent` - 文章内容
- `state.hardConstraints` - 硬性约束
- `state.textRetryCount` - 当前重试次数

#### 输出
- `state.textQualityReport` - 质检报告

#### 质检流程

**1. 硬规则检查**
```typescript
// 字数检查
const wordCount = state.articleContent.length;
const wordCountCheck = {
  passed: true,
  wordCount,
};

if (state.hardConstraints.minWords && wordCount < state.hardConstraints.minWords) {
  wordCountCheck.passed = false;
}

if (state.hardConstraints.maxWords && wordCount > state.hardConstraints.maxWords) {
  wordCountCheck.passed = false;
}

// 关键词检查
const keywordsCheck = {
  passed: true,
  found: [] as string[],
};

if (state.hardConstraints.keywords) {
  keywordsCheck.found = state.hardConstraints.keywords.filter(keyword =>
    state.articleContent.includes(keyword)
  );

  keywordsCheck.passed = keywordsCheck.found.length === state.hardConstraints.keywords.length;
}

// 结构检查
const structureCheck = {
  passed: true,
  checks: {
    hasTitle: /^#\s+.+/.test(state.articleContent), // 有标题
    hasIntro: /\n\n.+/.test(state.articleContent), // 有导语
    hasBody: state.articleContent.split('\n\n').length >= 3, // 至少 3 段
    hasConclusion: /(结语|总结|结论|最后)/.test(state.articleContent), // 有结语
  },
};

structureCheck.passed = Object.values(structureCheck.checks).every(check => check);

// 硬规则总体通过
const hardRulesPassed = wordCountCheck.passed && keywordsCheck.passed && structureCheck.passed;
```

**2. LLM 软评分**
```typescript
const CHECK_PROMPT = `你是一位专业的内容审核专家。请对以下文章进行质量评估：

【文章内容】
{articleContent}

【硬性约束】
- 字数：{minWords} - {maxWords} 字
- 必须包含关键词：{keywords}

请从以下维度评估（每项 1-10 分）：
1. **相关性**：内容是否切题
2. **连贯性**：逻辑是否通顺
3. **完整性**：结构是否完整
4. **可读性**：语言是否流畅

硬规则检查：
- 字数是否符合要求？
- 是否包含所有关键词？
- 是否有标题、导语、正文、结语？

请以 JSON 格式返回：
{
  "score": 8.5,
  "passed": true,
  "hardConstraintsPassed": true,
  "details": {
    "hardRules": {
      "wordCount": { "passed": true, "wordCount": 1200 },
      "keywords": { "passed": true, "found": ["AI", "技术", "发展"] },
      "structure": { "passed": true, "checks": {...} }
    },
    "softScores": {
      "relevance": { "score": 9, "reason": "内容完全切题" },
      "coherence": { "score": 8, "reason": "逻辑基本通顺" },
      "completeness": { "score": 8.5, "reason": "结构完整" },
      "readability": { "score": 8, "reason": "语言流畅" }
    }
  },
  "fixSuggestions": ["建议1", "建议2"]
}
`;
```

**3. 计算总分和通过判断**
```typescript
const softScore = (
  result.details.softScores.relevance.score * 0.3 +
  result.details.softScores.coherence.score * 0.3 +
  result.details.softScores.completeness.score * 0.2 +
  result.details.softScores.readability.score * 0.2
);

const passed = hardRulesPassed && softScore >= 7.0;
```

**4. 生成改进建议**
```typescript
const fixSuggestions: string[] = [];

// 硬规则问题
if (!wordCountCheck.passed) {
  fixSuggestions.push(`字数${wordCountCheck.wordCount}，需要在 ${state.hardConstraints.minWords}-${state.hardConstraints.maxWords} 范围内`);
}

if (!keywordsCheck.passed) {
  const missing = state.hardConstraints.keywords!.filter(k => !keywordsCheck.found.includes(k));
  fixSuggestions.push(`缺少关键词：${missing.join('、')}`);
}

if (!structureCheck.passed) {
  if (!structureCheck.checks.hasTitle) fixSuggestions.push('缺少标题');
  if (!structureCheck.checks.hasIntro) fixSuggestions.push('缺少导语段落');
  if (!structureCheck.checks.hasBody) fixSuggestions.push('正文内容不足');
  if (!structureCheck.checks.hasConclusion) fixSuggestions.push('缺少结语段落');
}

// LLM 软评分问题
if (softScore < 7) {
  fixSuggestions.push(...(result.fixSuggestions || []));
}
```

#### 验收标准
- ✅ 硬规则检查准确
- ✅ LLM 评分合理（1-10 分）
- ✅ 不合格内容返回改进建议
- ✅ 质检结果正确保存

---

### 节点 5：GenerateImage Node（生成配图节点）

#### 职责
根据文章内容生成配图。

#### 输入
- `state.articleContent` - 文章内容
- `state.imagePrompts` - 配图提示词（可选）

#### 输出
- `state.images` - 生成的配图列表

#### 实现要点

**1. 生成图片提示词**
```typescript
async function generateImagePrompts(articleContent: string): Promise<string[]> {
  const prompt = `根据以下文章内容，生成 1-3 个配图提示词：

【文章内容】
${articleContent.substring(0, 1000)}

要求：
1. 描述图片的主题和风格
2. 简洁明了（50 字以内）
3. 适合 AI 图片生成

请以 JSON 数组格式返回：["提示词1", "提示词2", "提示词3"]
`;

  const result = await enhancedLLMService.generateText(
    prompt,
    '请严格按照 JSON 数组格式返回。'
  );

  return JSON.parse(result);
}
```

**2. 调用 Doubao API**
```typescript
// 注意：Doubao API 需要单独实现
const imagePrompts = state.imagePrompts || await generateImagePrompts(state.articleContent);

const images = await Promise.all(
  imagePrompts.map(async (prompt) => {
    // 调用 Doubao API
    const imageUrl = await imageService.generateImage({
      prompt,
      // 其他参数...
    });

    return {
      url: imageUrl,
      prompt: prompt,
    };
  })
);
```

**3. 保存结果**
```typescript
return {
  images: images,
};
```

#### 验收标准
- ✅ 可以成功调用 Doubao API
- ✅ 图片提示词生成合理
- ✅ 图片 URL 有效
- ✅ 生成失败时有降级策略

---

### 节点 6：CheckImage Node（配图质检节点）

#### 职责
对生成的配图进行质量检查。

#### 输入
- `state.images` - 生成的配图列表
- `state.imageRetryCount` - 当前重试次数

#### 输出
- `state.imageQualityReport` - 配图质检报告

#### 实现要点

**1. LLM 图片评估**
```typescript
// 注意：需要支持图片输入的 LLM，或使用其他方案
const CHECK_IMAGE_PROMPT = `请评估以下配图的质量：

【配图信息】
图片 URL: {imageUrl}
提示词: {prompt}

请从以下维度评估（每项 1-10 分）：
1. **相关性**：图片与文章内容的相关性
2. **美学质量**：构图、色彩、清晰度
3. **提示词匹配**：是否符合提示词要求

请以 JSON 格式返回：
{
  "score": 8.0,
  "passed": true,
  "details": {
    "relevanceScore": 8.5,
    "aestheticScore": 7.5,
    "promptMatch": 8.0
  },
  "fixSuggestions": ["建议1"]
}
`;
```

**2. 评估所有图片**
```typescript
const qualityReports = await Promise.all(
  state.images.map(async (image) => {
    const result = await enhancedLLMService.generateText(
      CHECK_IMAGE_PROMPT
        .replace('{imageUrl}', image.url)
        .replace('{prompt}', image.prompt),
      '请严格按照 JSON 格式返回。'
    );

    return JSON.parse(result);
  })
);

// 计算平均分
const avgScore = qualityReports.reduce((sum, r) => sum + r.score, 0) / qualityReports.length;
const passed = avgScore >= 7.0;
```

**3. 生成改进建议**
```typescript
const fixSuggestions: string[] = [];

if (avgScore < 7) {
  qualityReports.forEach((report, index) => {
    if (report.score < 7) {
      fixSuggestions.push(`图片 ${index + 1}: ${report.fixSuggestions?.[0] || '质量不达标'}`);
    }
  });
}
```

#### 验收标准
- ✅ LLM 评分合理（1-10 分）
- ✅ 不合格内容返回改进建议
- ✅ 质检结果正确保存

---

## 🔀 工作流图构建

### Graph 结构

```typescript
import { StateGraph } from '@langchain/langgraph';
import { SearchNode } from './nodes/SearchNode.js';
import { OrganizeNode } from './nodes/OrganizeNode.js';
import { WriteNode } from './nodes/WriteNode.js';
import { CheckTextNode } from './nodes/CheckTextNode.js';
import { GenerateImageNode } from './nodes/GenerateImageNode.js';
import { CheckImageNode } from './nodes/CheckImageNode.js';
import { WorkflowState } from './State.js';

// 创建工作流图
export function createContentCreatorGraph(): StateGraph<WorkflowState> {
  // 创建节点实例
  const searchNode = new SearchNode();
  const organizeNode = new OrganizeNode();
  const writeNode = new WriteNode();
  const checkTextNode = new CheckTextNode();
  const generateImageNode = new GenerateImageNode();
  const checkImageNode = new CheckImageNode();

  // 创建 StateGraph
  const graph = new StateGraph<WorkflowState>({
    channels: {
      // 定义 State 字段
      taskId: {
        value: (x: WorkflowState) => x.taskId,
        default: () => '',
      },
      mode: {
        value: (x: WorkflowState) => x.mode,
        default: () => 'sync' as ExecutionMode,
      },
      topic: {
        value: (x: WorkflowState) => x.topic,
        default: () => '',
      },
      requirements: {
        value: (x: WorkflowState) => x.requirements,
        default: () => '',
      },
      // ... 其他字段
    },
  });

  // 添加节点
  graph.addNode('search', searchNode.toLangGraphNode());
  graph.addNode('organize', organizeNode.toLangGraphNode());
  graph.addNode('write', writeNode.toLangGraphNode());
  graph.addNode('checkText', checkTextNode.toLangGraphNode());
  graph.addNode('generateImage', generateImageNode.toLangGraphNode());
  graph.addNode('checkImage', checkImageNode.toLangGraphNode());

  // 添加边（线性流程）
  graph.setEntryPoint('search');
  graph.addEdge('search', 'organize');
  graph.addEdge('organize', 'write');
  graph.addEdge('write', 'checkText');

  // 添加条件边（文本质检）
  graph.addConditionalEdges(
    'checkText',
    {
      shouldRetry: (state: WorkflowState) => {
        // 质检失败且重试次数 < 3
        return !state.textQualityReport?.passed && state.textRetryCount < 3;
      },
      true: 'write',  // 重试写作
      false: 'generateImage',  // 通过，生成配图
    }
  );

  // 添加条件边（配图质检）
  graph.addConditionalEdges(
    'checkImage',
    {
      shouldRetry: (state: WorkflowState) => {
        // 质检失败且重试次数 < 2
        return !state.imageQualityReport?.passed && state.imageRetryCount < 2;
      },
      true: 'generateImage',  // 重试生成
      false: '__end__',  // 通过，结束
    }
  );

  return graph.compile();
}
```

### 条件路由函数

```typescript
// 文本质检路由
function routeAfterCheckText(state: WorkflowState): string {
  if (state.textQualityReport?.passed) {
    return 'generate_image';
  }

  if (state.textRetryCount < 3) {
    return 'write'; // 重试
  }

  throw new Error('Text quality check failed after 3 attempts');
}

// 配图质检路由
function routeAfterCheckImage(state: WorkflowState): string {
  if (state.imageQualityReport?.passed) {
    return '__end__'; // 完成
  }

  if (state.imageRetryCount < 2) {
    return 'generate_image'; // 重试
  }

  throw new Error('Image quality check failed after 2 attempts');
}
```

---

## 🧪 测试策略

### 单元测试

每个节点独立测试：

```typescript
describe('SearchNode', () => {
  it('should search and return results', async () => {
    const node = new SearchNode();
    const state = createInitialState({...});

    const result = await node.execute(state);

    expect(result.success).toBe(true);
    expect(result.stateUpdate.searchResults).toBeDefined();
  });

  it('should use cached results if available', async () => {
    // 测试缓存逻辑
  });
});
```

### 集成测试

完整工作流测试：

```typescript
describe('ContentCreator Workflow', () => {
  it('should complete full workflow', async () => {
    const graph = createContentCreatorGraph();
    const initialState = createInitialState({...});

    const result = await graph.invoke(initialState);

    expect(result.articleContent).toBeDefined();
    expect(result.images).toBeDefined();
    expect(result.textQualityReport?.passed).toBe(true);
    expect(result.imageQualityReport?.passed).toBe(true);
  });

  it('should retry write on quality check failure', async () => {
    // 测试重试逻辑
  });

  it('should recover from checkpoint', async () => {
    // 测试断点续传
  });
});
```

---

## 📝 待准备资源

### 环境配置

- ✅ DeepSeek API Key（已有）
- ✅ Tavily API Key（已有）
- ⏳ **Doubao API Key**（需要申请）
- ⏳ **图片存储配置**（S3/OSS/本地）

### 服务实现

- ✅ LLMService（增强版已实现）
- ✅ SearchService（已实现）
- ⏳ **ImageService**（待实现 Doubao API 封装）
- ⏳ **QualityService**（待实现）

### 工具和库

- ✅ LangGraph（已安装）
- ✅ Redis 客户端（ioredis，已安装）
- ⏳ **图片生成库**（如需要）

---

## 🚀 立即可做

1. **实现 ImageService**（Doubao API）
2. **实现第一个节点**（SearchNode）
3. **测试 Prompt 模板**
4. **配置图片存储**

---

**文档版本**: 1.0
**创建日期**: 2025-01-18
**最后更新**: 2025-01-18
**状态**: 准备完成，等待实施
