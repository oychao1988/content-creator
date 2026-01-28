# Workflow 扩展架构设计方案

## 一、概述

当前项目使用 LangGraph 实现了"内容创作"单一工作流。本设计方案旨在建立**可扩展的工作流架构**，支持动态添加新的工作流类型（如翻译、数据分析、摘要等），同时保持代码的整洁性和可维护性。

## 二、当前架构的问题

### 2.1 紧耦合问题

```
WorkflowState ← 与内容创作强耦合
├── searchResults?      # 搜索相关
├── articleContent?     # 文章相关
├── images?             # 图片相关
├── textQualityReport?  # 文本质检
└── imageQualityReport? # 图片质检
```

**问题**：这些字段对其他 workflow（如翻译、数据分析）完全无用。

### 2.2 单一实现

```typescript
// SyncExecutor 和 TaskWorker 硬编码调用
const graph = createSimpleContentCreatorGraph(); // 固定工作流
```

**问题**：无法根据任务类型选择不同的工作流。

### 2.3 TaskType 未使用

```typescript
enum TaskType {
  ARTICLE = 'article',
  SOCIAL_MEDIA = 'social_media',
  MARKETING = 'marketing',
}
```

**问题**：定义了类型但没有实际应用。

---

## 三、扩展架构设计

### 3.1 核心思想

**插件化 + 注册表模式**

```
┌─────────────────────────────────────────────────┐
│           Workflow Registry (注册表)             │
│  ┌──────────────┬──────────────┬──────────────┐│
│  │Content       │Translation   │Data          ││
│  │Creator       │Workflow      │Analysis      ││
│  └──────────────┴──────────────┴──────────────┘│
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│         Workflow Factory Interface              │
│  • createGraph()                                │
│  • createState(params)                          │
│  • validateParams(params)                       │
│  • getMetadata()                                │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│           Executor (执行器)                     │
│  SyncExecutor / TaskWorker                      │
│  • 根据 task.type 选择工作流                    │
│  • 动态创建对应 Graph 和 State                  │
└─────────────────────────────────────────────────┘
```

### 3.2 核心组件

#### 组件 1: BaseWorkflowState（状态基类）

```typescript
// 抽象基础状态，包含所有工作流通用的字段
interface BaseWorkflowState {
  // 通用字段
  taskId: string;
  mode: ExecutionMode;
  workflowType: string;  // 关键：标识工作流类型

  // 执行控制
  currentStep: string;
  retryCount: number;
  version: number;

  // 扩展字段（由具体 workflow 定义）
  metadata?: Record<string, any>;
}

// 具体工作流继承扩展
interface ContentCreatorState extends BaseWorkflowState {
  topic: string;
  requirements: string;
  articleContent?: string;
  // ...
}

interface TranslationState extends BaseWorkflowState {
  sourceText: string;
  targetLanguage: string;
  translatedText?: string;
  // ...
}
```

**设计原则**：
- ✅ 提取通用字段到基类
- ✅ 具体工作流通过继承扩展
- ✅ 使用 `metadata` 支持动态字段

#### 组件 2: WorkflowFactory（工作流工厂接口）

```typescript
interface WorkflowFactory {
  // 元数据
  type: string;              // 'content-creator', 'translation', etc.
  version: string;
  name: string;
  description: string;

  // 核心方法
  createGraph(): CompiledGraph;        // 创建 LangGraph 图
  createState(params): BaseWorkflowState; // 创建初始状态
  validateParams(params): boolean;     // 验证参数
  getMetadata(): WorkflowMetadata;     // 获取元数据
}
```

**设计原则**：
- ✅ 统一接口，所有工作流必须实现
- ✅ 工厂模式，封装创建逻辑
- ✅ 元数据驱动，支持工作流发现

#### 组件 3: WorkflowRegistry（工作流注册表）

```typescript
class WorkflowRegistry {
  private workflows = new Map<string, WorkflowFactory>();

  // 注册工作流
  register(factory: WorkflowFactory): void;

  // 获取工作流
  get(type: string): WorkflowFactory;

  // 列出所有工作流
  list(): WorkflowFactory[];

  // 根据标签过滤
  filterByTag(tag: string): WorkflowFactory[];
}
```

**设计原则**：
- ✅ 单例模式，全局唯一
- ✅ 注册表模式，动态管理
- ✅ 支持查询和过滤

### 3.3 执行流程改造

#### 改造前（硬编码）

```typescript
// SyncExecutor.ts
const graph = createSimpleContentCreatorGraph(); // 固定
const result = await graph.invoke(initialState);
```

#### 改造后（动态选择）

```typescript
// SyncExecutor.ts
import { WorkflowRegistry } from './WorkflowRegistry.js';

// 1. 根据 Task.type 选择工作流
const workflowType = task.type || 'content-creator';
const factory = WorkflowRegistry.getInstance().get(workflowType);

// 2. 动态创建图和状态
const graph = factory.createGraph();
const initialState = factory.createState(params);

// 3. 执行
const result = await graph.invoke(initialState);
```

**优势**：
- ✅ 无需修改执行器代码
- ✅ 新增 workflow 只需注册
- ✅ 运行时动态选择

---

## 四、扩展新 Workflow 的步骤

### 步骤 1: 定义 State

```typescript
// 示例：翻译工作流
interface TranslationState extends BaseWorkflowState {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText?: string;
  qualityScore?: number;
}
```

### 步骤 2: 实现节点

```typescript
// 可以复用现有节点或创建新节点
class TranslateNode extends BaseNode {
  async executeLogic(state: TranslationState) {
    // 翻译逻辑
  }
}

class QualityCheckNode extends BaseNode {
  async executeLogic(state: TranslationState) {
    // 质检逻辑
  }
}
```

### 步骤 3: 创建 Graph

```typescript
function createTranslationGraph() {
  const graph = new StateGraph<TranslationState>({ /* ... */ });

  graph.addNode('translate', translateNode);
  graph.addNode('quality_check', qualityCheckNode);

  graph.addEdge(START, 'translate');
  graph.addEdge('translate', 'quality_check');
  graph.addConditionalEdges('quality_check', routeFunction, {
    translate: 'translate',  // 重试
    end: END,                 // 完成
  });

  return graph.compile();
}
```

### 步骤 4: 实现 Factory

```typescript
const translationWorkflowFactory: WorkflowFactory = {
  type: 'translation',
  version: '1.0.0',
  name: '文本翻译',
  description: '将文本从一种语言翻译成另一种语言',

  createGraph: createTranslationGraph,
  createState: (params) => ({ /* 创建初始状态 */ }),
  validateParams: (params) => { /* 验证参数 */ },
  getMetadata: () => ({ /* 返回元数据 */ }),
};
```

### 步骤 5: 注册工作流

```typescript
// 在应用启动时注册
WorkflowRegistry.getInstance().register(translationWorkflowFactory);

// 或在模块中自动注册
import './workflows/TranslationWorkflow.js'; // 自动注册
```

### 步骤 6: 使用新工作流

```bash
# CLI 使用
pnpm run cli create \
  --type translation \
  --source-text "Hello World" \
  --source-language en \
  --target-language zh \
  --mode sync
```

---

## 五、架构优势

### 5.1 低耦合

- ✅ 执行器与具体工作流解耦
- ✅ 工作流之间相互独立
- ✅ 状态定义与执行逻辑分离

### 5.2 高扩展性

- ✅ 添加新 workflow 无需修改核心代码
- ✅ 支持插件化开发
- ✅ 第三方可以贡献自定义 workflow

### 5.3 可维护性

- ✅ 统一的接口和约定
- ✅ 清晰的职责划分
- ✅ 易于测试和调试

### 5.4 运行时灵活性

- ✅ 动态选择工作流
- ✅ 支持工作流版本管理
- ✅ 可以禁用/启用特定工作流

---

## 六、应用场景示例

### 场景 1: 内容摘要工作流

```typescript
// 输入：长篇文章
// 输出：结构化摘要
interface SummaryState extends BaseWorkflowState {
  articleContent: string;
  summary?: {
    title: string;
    keypoints: string[];
    conclusion: string;
  };
}

// 节点：extract → summarize → format
```

### 场景 2: 数据分析工作流

```typescript
// 输入：数据集 URL
// 输出：分析报告 + 图表
interface AnalysisState extends BaseWorkflowState {
  dataSource: string;
  analysisType: 'statistics' | 'ml' | 'report';
  rawData?: any[];
  processedData?: any;
  charts?: Chart[];
}

// 节点：fetch → clean → analyze → visualize → report
```

### 场景 3: 社交媒体内容生成

```typescript
// 输入：产品信息
// 输出：多平台适配的营销文案
interface SocialMediaState extends BaseWorkflowState {
  productInfo: string;
  platforms?: ('twitter' | 'facebook' | 'instagram')[];
  generatedContent?: Map<string, string>;
}

// 节点：research → generate → adapt → review
```

---

## 七、迁移策略

### 阶段 1: 建立基础架构（1-2 天）

1. ✅ 创建 `BaseWorkflowState` 基类
2. ✅ 定义 `WorkflowFactory` 接口
3. ✅ 实现 `WorkflowRegistry` 注册表

### 阶段 2: 适配现有工作流（1 天）

1. ✅ 将 `ContentCreatorGraph` 适配为新架构
2. ✅ 修改 `SyncExecutor` 支持动态工作流选择
3. ✅ 修改 `TaskWorker` 支持动态工作流选择

### 阶段 3: 添加新工作流示例（2-3 天）

1. ✅ 实现翻译工作流
2. ✅ 实现摘要工作流
3. ✅ CLI 支持工作流列表和查询

### 阶段 4: 完善和优化（持续）

1. ✅ 添加工作流版本管理
2. ✅ 实现工作流可视化
3. ✅ 建立工作流测试框架

---

## 八、CLI 扩展设计

### 8.1 查看可用工作流

```bash
# 列出所有工作流
pnpm run cli workflow list

# 输出示例：
┌─────────────────┬──────────────┬────────────────────────────┐
│ Type            │ Name         │ Description                │
├─────────────────┼──────────────┼────────────────────────────┤
│ content-creator │ 内容创作     │ AI 驱动的智能内容创作系统    │
│ translation     │ 文本翻译     │ 多语言文本翻译              │
│ summary         │ 内容摘要     │ 文章智能摘要                │
│ data-analysis   │ 数据分析     │ 数据集分析和可视化          │
└─────────────────┴──────────────┴────────────────────────────┘
```

### 8.2 查看工作流详情

```bash
pnpm run cli workflow info content-creator

# 输出：
Type: content-creator
Version: 1.0.0
Name: 内容创作
Description: AI 驱动的智能内容创作系统

Required Parameters:
  - topic (string): 文章主题
  - requirements (string): 创作要求

Optional Parameters:
  - targetAudience (string): 目标受众
  - keywords (string[]): 关键词
  - tone (string): 语气风格

Required APIs:
  - DeepSeek (LLM)
  - Tavily (Search)
  - Doubao (Image)

Estimated Duration: 180 seconds
Estimated Cost: ¥0.50/time
```

### 8.3 创建任务时指定类型

```bash
# 使用默认工作流（content-creator）
pnpm run cli create --topic "AI" --requirements "..."

# 显式指定工作流
pnpm run cli create --type translation \
  --source-text "Hello" \
  --source-language en \
  --target-language zh
```

---

## 九、技术考虑

### 9.1 向后兼容

- ✅ 默认工作流为 `content-creator`
- ✅ 现有 CLI 命令无需修改
- ✅ 数据库结构无需变更（`task.type` 字段已存在）

### 9.2 类型安全

- ✅ 使用 TypeScript 泛型保证类型安全
- ✅ 每个工作流有独立的 State 类型
- ✅ Factory 接口提供统一的类型约束

### 9.3 性能考虑

- ✅ 工作流图编译后缓存
- ✅ 节点可复用（如 `searchNode`）
- ✅ 状态快照仅保存必要字段

### 9.4 错误处理

- ✅ 参数验证在工作流启动前
- ✅ 未知工作流类型抛出明确错误
- ✅ 每个节点独立错误处理

---

## 十、总结

### 核心设计原则

1. **开闭原则**：对扩展开放，对修改关闭
2. **依赖倒置**：依赖抽象（Factory）而非具体实现
3. **单一职责**：每个工作流专注于单一功能
4. **接口隔离**：Factory 接口最小化且职责明确

### 关键技术点

- 🎯 **注册表模式**：动态管理工作流
- 🎯 **工厂模式**：统一创建逻辑
- 🎯 **继承与组合**：State 复用与扩展
- 🎯 **策略模式**：运行时工作流选择

### 实施路径

```
Phase 1: 基础架构（2-3 天）
   ↓
Phase 2: 适配现有代码（1 天）
   ↓
Phase 3: 添加示例（2-3 天）
   ↓
Phase 4: 持续优化（持续）
```

### 预期效果

- ✅ 添加新 workflow 工作量从 3-5 天降低到 0.5-1 天
- ✅ 核心代码稳定性提升（修改风险降低）
- ✅ 支持社区贡献自定义 workflow
- ✅ 项目演变为通用工作流平台

---

**文档版本**: 1.0
**创建日期**: 2026-01-27
**作者**: Claude Code
**状态**: 设计方案
