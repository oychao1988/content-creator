# 翻译工作流使用指南

## 概述

翻译工作流（Translation Workflow）是一个基于 LLM 的智能文本翻译系统，支持多语言翻译、质量检查和自动重试机制。

**工作流类型**: `translation`
**版本**: 1.0.0
**分类**: translation

## 核心特性

- ✅ **多语言支持**: 支持中文、英文、日文、韩文、法文、德文、西班牙文、俄文等多种语言
- ✅ **智能翻译**: 使用 DeepSeek LLM 进行上下文感知的翻译
- ✅ **质量检查**: 内置 LLM 质量评估，确保翻译质量
- ✅ **自动重试**: 质检失败时自动重新翻译（最多 2 次）
- ✅ **可配置风格**: 支持正式、非正式、技术等不同翻译风格
- ✅ **领域适配**: 支持技术、医疗、法律等专业领域翻译

## 工作流程

```
┌─────────────┐
│  开始       │
│  Start      │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│  翻译节点 (TranslateNode)    │
│  - 构建 Prompt               │
│  - 调用 LLM 翻译             │
│  - 验证翻译结果              │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  质检节点 (TranslationQualityNode) │
│  - 调用 LLM 评估质量            │
│  - 生成评分和建议               │
│  - 决定是否通过                │
└──────┬──────────────────────────┘
       │
       ├─ 通过 → 结束
       │
       └─ 失败 → 重试翻译（最多2次）
```

## 参数说明

### 必需参数

| 参数名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `taskId` | string | 任务唯一标识符 | `"task-123"` |
| `sourceText` | string | 待翻译的源文本 | `"Hello world"` |
| `sourceLanguage` | string | 源语言代码 | `"en"` (英文) |
| `targetLanguage` | string | 目标语言代码 | `"zh"` (中文) |

### 可选参数

| 参数名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `translationStyle` | string | 翻译风格 | `"formal"`, `"casual"`, `"technical"` |
| `domain` | string | 专业领域 | `"technology"`, `"medical"`, `"legal"` |
| `mode` | string | 执行模式 | `"sync"` 或 `"async"` |

### 支持的语言代码

| 代码 | 语言 | 代码 | 语言 |
|------|------|------|------|
| `zh` | 中文 | `ja` | 日文 |
| `en` | 英文 | `ko` | 韩文 |
| `fr` | 法文 | `de` | 德文 |
| `es` | 西班牙文 | `ru` | 俄文 |

## 使用方法

### 1. 通过 SyncExecutor 使用

```typescript
import { createSyncExecutor } from './application/workflow/SyncExecutor.js';
import { createTaskRepository } from './infrastructure/database/index.js';

// 创建执行器
const executor = createSyncExecutor(createTaskRepository(), {
  databaseType: 'sqlite',
  enableLogging: true,
});

// 执行翻译任务
const result = await executor.execute({
  mode: 'sync',
  type: 'translation',  // 指定工作流类型
  taskId: 'task-123',

  // 翻译工作流特定参数
  sourceText: 'Artificial intelligence is transforming the world',
  sourceLanguage: 'en',
  targetLanguage: 'zh',
  translationStyle: 'formal',
  domain: 'technology',
});

console.log('翻译结果:', result.state.translatedText);
console.log('质量评分:', result.state.qualityReport?.score);
console.log('是否通过:', result.state.qualityReport?.passed);
```

### 2. 直接使用工作流注册表

```typescript
import { WorkflowRegistry } from './domain/workflow/WorkflowRegistry.js';
import { translationWorkflowFactory } from './domain/workflow/examples/TranslationWorkflow.js';

// 注册工作流（如果尚未注册）
WorkflowRegistry.register('translation', translationWorkflowFactory);

// 创建工作流状态
const state = WorkflowRegistry.createState('translation', {
  taskId: 'task-123',
  sourceText: 'Machine learning is revolutionizing industries',
  sourceLanguage: 'en',
  targetLanguage: 'ja',
  translationStyle: 'technical',
  domain: 'technology',
});

// 创建工作流图
const graph = WorkflowRegistry.createGraph('translation');

// 执行工作流
const result = await graph.invoke(state);

console.log('翻译结果:', result.translatedText);
console.log('质量报告:', result.qualityReport);
```

### 3. 通过 CLI 查看工作流信息

```bash
# 查看所有工作流
pnpm run cli workflow list

# 查看翻译工作流详情
pnpm run cli workflow info translation

# 按分类过滤
pnpm run cli workflow list --category translation

# 按标签过滤
pnpm run cli workflow list --tag llm

# JSON 格式输出
pnpm run cli workflow info translation --json
```

## 使用示例

### 示例 1: 中英翻译（正式风格）

```typescript
const result = await executor.execute({
  mode: 'sync',
  type: 'translation',
  taskId: 'translate-001',
  sourceText: '人工智能正在改变世界',
  sourceLanguage: 'zh',
  targetLanguage: 'en',
  translationStyle: 'formal',
  domain: 'technology',
});

// 输出:
// 翻译结果: "Artificial intelligence is transforming the world"
// 质量评分: 9.2/10
// 是否通过: true
```

### 示例 2: 英日翻译（技术风格）

```typescript
const result = await executor.execute({
  mode: 'sync',
  type: 'translation',
  taskId: 'translate-002',
  sourceText: 'Machine learning is revolutionizing many industries',
  sourceLanguage: 'en',
  targetLanguage: 'ja',
  translationStyle: 'technical',
  domain: 'technology',
});

// 输出:
// 翻译结果: "機械学習は多くの産業を変革しています"
// 质量评分: 8.8/10
// 是否通过: true
```

### 示例 3: 英中翻译（非正式风格）

```typescript
const result = await executor.execute({
  mode: 'sync',
  type: 'translation',
  taskId: 'translate-003',
  sourceText: "Hey, what's up?",
  sourceLanguage: 'en',
  targetLanguage: 'zh',
  translationStyle: 'casual',
});

// 输出:
// 翻译结果: "嘿，最近怎么样？"
// 质量评分: 9.0/10
// 是否通过: true
```

## 质量检查机制

### 质量评估维度

翻译质量检查会从以下 4 个维度进行评估（每项 1-10 分）：

1. **准确性（Accuracy）**: 是否准确传达原文含义
2. **流畅性（Fluency）**: 语言表达是否自然流畅
3. **一致性（Consistency）**: 术语和风格是否一致
4. **完整性（Completeness）**: 是否完整翻译了所有内容

### 通过标准

- **生产环境**: 质量评分 ≥ 8.0 分
- **测试环境**: 质量评分 ≥ 6.0 分

### 质检报告结构

```typescript
{
  score: 9.5,           // 总分（0-10）
  passed: true,         // 是否通过质检
  fixSuggestions: [     // 改进建议（如果有）
    "建议更自然地表达...",
  ],
  checkedAt: 1706457600000  // 质检时间戳
}
```

### 重试机制

当质检失败时：
1. 保存当前翻译结果到 `previousTranslation`
2. 递增 `translationRetryCount`
3. 重新执行翻译节点
4. 最多重试 2 次

## 错误处理

### 常见错误及解决方案

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `Missing required parameter: sourceText` | 缺少源文本 | 提供 `sourceText` 参数 |
| `Source and target languages must be different` | 源语言和目标语言相同 | 使用不同的语言代码 |
| `Source text is required for translation` | 源文本为空 | 确保源文本非空 |
| `Quality check failed after 2 attempts` | 质检重试次数已满 | 检查源文本或调整翻译参数 |
| `Failed to parse quality check output` | LLM 返回格式错误 | 检查 LLM API 配置 |

## 性能考虑

### 执行时间估算

| 步骤 | 预计时间 |
|------|----------|
| 翻译节点 | 5-15 秒（取决于文本长度） |
| 质检节点 | 3-8 秒 |
| **总计** | **8-23 秒** |
| **重试场景** | **最多 3 次翻译 + 3 次质检** |

### 优化建议

1. **批量翻译**: 对于大量文本，考虑拆分为多个段落并行翻译
2. **缓存结果**: 对相同源文本和语言对的翻译结果进行缓存
3. **异步模式**: 对于非实时场景，使用 `mode: 'async'` 异步执行

## 扩展和定制

### 添加新的语言支持

在 `TranslationWorkflow.ts` 中修改 `getLanguageName()` 方法：

```typescript
private getLanguageName(languageCode: string): string {
  const languageNames: Record<string, string> = {
    zh: '中文',
    en: '英文',
    // 添加新语言
    pt: '葡萄牙文',
    it: '意大利文',
    // ...
  };

  return languageNames[languageCode.toLowerCase()] ?? languageCode;
}
```

### 自定义质检标准

修改 `TranslationQualityNode` 的配置：

```typescript
class TranslationQualityNode extends BaseNode<TranslationState> {
  constructor(config: TranslationQualityNodeConfig = {}) {
    super({
      name: 'checkQuality',
      retryCount: 1,
      timeout: 60000,
    });

    this.config = {
      minPassingScore: 9.0,  // 提高通过标准到 9.0
      ...config,
    };
  }
}
```

### 添加新的翻译风格

扩展 `buildPrompt()` 方法中的风格处理：

```typescript
private buildPrompt(state: TranslationState): string {
  const styleMap = {
    formal: '正式、专业的语气',
    casual: '轻松、日常的语气',
    technical: '技术专业术语',
    // 添加新风格
    literary: '文学艺术风格',
    business: '商务职场风格',
  };

  const style = state.translationStyle
    ? `【翻译风格】${styleMap[state.translationStyle] || state.translationStyle}`
    : '';

  // ...
}
```

## 最佳实践

### 1. 选择合适的翻译风格

- **技术文档**: 使用 `translationStyle: 'technical'` + `domain: 'technology'`
- **商务沟通**: 使用 `translationStyle: 'formal'` + `domain: 'business'`
- **日常对话**: 使用 `translationStyle: 'casual'`
- **学术论文**: 使用 `translationStyle: 'formal'` + `domain: 'academic'`

### 2. 处理长文本

对于超过 1000 字的文本，建议分段翻译：

```typescript
const segments = splitLongText(longSourceText, 1000);
const translations = [];

for (const segment of segments) {
  const result = await executor.execute({
    mode: 'sync',
    type: 'translation',
    taskId: `task-${segements.indexOf(segment)}`,
    sourceText: segment,
    sourceLanguage: 'en',
    targetLanguage: 'zh',
  });
  translations.push(result.state.translatedText);
}

const fullTranslation = translations.join('\n');
```

### 3. 质量监控

定期检查翻译质量报告，优化提示词：

```typescript
const result = await executor.execute({...});

if (result.state.qualityReport?.score < 8.0) {
  console.warn('翻译质量较低:', result.state.qualityReport.fixSuggestions);
  // 记录到监控系统
  monitor.trackLowQualityTranslation({
    taskId: result.state.taskId,
    score: result.state.qualityReport.score,
    suggestions: result.state.qualityReport.fixSuggestions,
  });
}
```

### 4. 成本控制

- 使用异步模式处理批量翻译任务
- 对相同内容启用缓存
- 监控 LLM API 调用次数和成本

## 故障排查

### 问题: 翻译质量不稳定

**可能原因**:
- LLM 模型性能波动
- 源文本表达模糊
- 缺少上下文信息

**解决方案**:
```typescript
// 提供更多上下文
const sourceTextWithContext = `
Context: This is a technical document about AI.
Original: Machine learning models can be complex.
`;

const result = await executor.execute({
  sourceText: sourceTextWithContext,
  // ...
});
```

### 问题: 质检总是失败

**可能原因**:
- 质检标准过高
- LLM 返回格式问题

**解决方案**:
```typescript
// 在测试环境中降低质检标准
process.env.NODE_ENV = 'test';  // minPassingScore 会自动降为 6.0

// 或自定义配置
const factory = new TranslationQualityNode({
  minPassingScore: 7.0,  // 降低到 7.0
});
```

### 问题: 翻译速度慢

**可能原因**:
- LLM API 响应慢
- 网络延迟
- 文本过长

**解决方案**:
```typescript
// 使用异步模式
const result = await executor.execute({
  mode: 'async',  // 改为异步
  type: 'translation',
  // ...
});

// 或分段翻译长文本
```

## 相关文档

- [工作流扩展设计文档](./workflow-extension-design.md)
- [工作流架构文档](./workflow-architecture.md)
- [内容创作工作流使用指南](./content-creator-workflow-guide.md)
- [CLI 命令参考](./cli-reference.md)

## 更新日志

### v1.0.0 (2025-01-28)
- ✨ 初始版本
- ✅ 支持多语言翻译
- ✅ 集成 LLM 质量检查
- ✅ 实现自动重试机制
- ✅ 支持可配置的翻译风格和领域

---

**作者**: Content Creator System
**最后更新**: 2025-01-28
**版本**: 1.0.0
