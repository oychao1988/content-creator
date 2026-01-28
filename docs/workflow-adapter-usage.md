# ContentCreator 工作流使用指南

## 快速开始

### 1. 注册工作流

```typescript
import { registerWorkflow } from './domain/workflow/index.js';
import { contentCreatorWorkflowAdapter } from './domain/workflow/adapters/ContentCreatorWorkflowAdapter.js';

// 注册工作流
registerWorkflow(contentCreatorWorkflowAdapter);
```

### 2. 创建工作流图

```typescript
import { createWorkflowGraph } from './domain/workflow/index.js';

// 创建工作流图
const graph = createWorkflowGraph('content-creator');
```

### 3. 创建工作流状态

```typescript
import { createWorkflowState } from './domain/workflow/index.js';

// 创建工作流状态
const state = createWorkflowState('content-creator', {
  taskId: 'task-001',
  mode: 'sync',
  topic: '人工智能技术',
  requirements: '写一篇 2000 字的科普文章',
  targetAudience: '大众',
  tone: '轻松易懂',
  hardConstraints: {
    minWords: 2000,
    maxWords: 3000,
    keywords: ['AI', '人工智能', '机器学习'],
  },
});
```

### 4. 执行工作流

```typescript
// 执行工作流
const result = await graph.invoke(state);

console.log('工作流完成:', result);
```

## 完整示例

```typescript
import {
  WorkflowRegistry,
  registerWorkflow,
  createWorkflowGraph,
  createWorkflowState,
} from './domain/workflow/index.js';
import { contentCreatorWorkflowAdapter } from './domain/workflow/adapters/ContentCreatorWorkflowAdapter.js';

async function runContentCreatorWorkflow() {
  // 1. 注册工作流
  registerWorkflow(contentCreatorWorkflowAdapter);

  // 2. 创建工作流图
  const graph = createWorkflowGraph('content-creator');

  // 3. 创建工作流状态
  const state = createWorkflowState('content-creator', {
    taskId: `task-${Date.now()}`,
    mode: 'sync',
    topic: '区块链技术原理',
    requirements: '深入浅出地讲解区块链技术',
    targetAudience: '技术爱好者',
    keywords: ['区块链', '去中心化', '加密算法'],
    tone: '专业但不晦涩',
    hardConstraints: {
      minWords: 3000,
      maxWords: 5000,
      keywords: ['区块链', '共识机制', '智能合约'],
    },
  });

  // 4. 执行工作流
  try {
    const result = await graph.invoke(state);
    console.log('工作流执行成功！');
    console.log('文章内容:', result.articleContent);
    console.log('配图:', result.images);
    return result;
  } catch (error) {
    console.error('工作流执行失败:', error);
    throw error;
  }
}

// 运行
runContentCreatorWorkflow().catch(console.error);
```

## 向后兼容的方式

如果你更喜欢使用原有的 API，完全可以继续使用：

```typescript
import {
  createInitialState,
  createSimpleContentCreatorGraph,
} from './domain/workflow/index.js';

// 创建初始状态
const state = createInitialState({
  taskId: 'task-001',
  mode: 'sync',
  topic: 'AI 技术',
  requirements: '写一篇科普文章',
  targetAudience: '大众',
  tone: '轻松易懂',
});

// 创建工作流图
const graph = createSimpleContentCreatorGraph();

// 执行工作流
const result = await graph.invoke(state);
```

## 参数说明

### 必需参数

- `taskId`: 任务 ID（字符串）
- `mode`: 执行模式（'sync' | 'async'）
- `topic`: 选题（字符串）
- `requirements`: 写作要求（字符串）

### 可选参数

- `targetAudience`: 目标受众（字符串）
- `keywords`: 关键词列表（字符串数组）
- `tone`: 语调（字符串）
- `hardConstraints`: 硬性约束
  - `minWords`: 最小字数（数字）
  - `maxWords`: 最大字数（数字）
  - `keywords`: 必须包含的关键词（字符串数组）

## 工作流元数据

```typescript
import { getWorkflowMetadata } from './domain/workflow/index.js';

const metadata = getWorkflowMetadata('content-creator');

console.log('工作流类型:', metadata.type);           // 'content-creator'
console.log('版本:', metadata.version);               // '1.0.0'
console.log('名称:', metadata.name);                  // '内容创作'
console.log('描述:', metadata.description);           // 'AI 驱动的智能内容创作系统...'
console.log('分类:', metadata.category);              // 'content'
console.log('标签:', metadata.tags);                  // ['ai', 'content-creation', ...]
console.log('必需参数:', metadata.requiredParams);    // ['taskId', 'mode', 'topic', ...]
console.log('可选参数:', metadata.optionalParams);    // ['targetAudience', 'keywords', ...]
```

## 参数验证

```typescript
import { validateWorkflowParams } from './domain/workflow/index.js';

// 有效参数
const validParams = {
  taskId: 'task-001',
  mode: 'sync',
  topic: 'AI',
  requirements: '写文章',
};

const isValid = validateWorkflowParams('content-creator', validParams);
console.log('参数有效:', isValid);  // true

// 无效参数
const invalidParams = {
  taskId: '',  // 无效
  mode: 'sync',
  topic: '',   // 无效
  requirements: '',
};

const isInvalid = validateWorkflowParams('content-creator', invalidParams);
console.log('参数有效:', isInvalid);  // false
```

## 列出所有工作流

```typescript
import { listWorkflows } from './domain/workflow/index.js';

const workflows = listWorkflows();

for (const workflow of workflows) {
  console.log(`${workflow.name} (${workflow.type})`);
  console.log(`  版本: ${workflow.version}`);
  console.log(`  描述: ${workflow.description}`);
  console.log(`  分类: ${workflow.category}`);
}
```

## 执行模式

### 同步模式（sync）

```typescript
const state = createWorkflowState('content-creator', {
  taskId: 'task-001',
  mode: 'sync',  // 同步执行
  topic: 'AI',
  requirements: '写文章',
});

// 等待完成
const result = await graph.invoke(state);
```

### 异步模式（async）

```typescript
const state = createWorkflowState('content-creator', {
  taskId: 'task-001',
  mode: 'async',  // 异步执行
  topic: 'AI',
  requirements: '写文章',
});

// 在后台执行，立即返回
const result = await graph.invoke(state);
```

## 错误处理

```typescript
try {
  const result = await graph.invoke(state);
  console.log('成功:', result);
} catch (error) {
  if (error.message.includes('quality check failed')) {
    console.error('质检失败:', error.message);
    // 处理质检失败
  } else {
    console.error('未知错误:', error);
  }
}
```

## 状态检查

```typescript
// 检查工作流是否完成
if (state.currentStep === 'complete') {
  console.log('工作流已完成');
}

// 检查是否有错误
if (state.error) {
  console.error('工作流出错:', state.error);
}

// 检查执行时长
const duration = state.endTime! - state.startTime!;
console.log(`执行时长: ${duration}ms`);
```

## 获取质检报告

```typescript
// 文本质检报告
if (state.textQualityReport) {
  console.log('文本质检评分:', state.textQualityReport.score);
  console.log('是否通过:', state.textQualityReport.passed);
  console.log('硬性约束:', state.textQualityReport.hardConstraintsPassed);
  console.log('详情:', state.textQualityReport.details);
}

// 配图质检报告
if (state.imageQualityReport) {
  console.log('配图质检评分:', state.imageQualityReport.score);
  console.log('是否通过:', state.imageQualityReport.passed);
}
```

## 最佳实践

1. **使用唯一的 taskId**
   ```typescript
   const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
   ```

2. **设置合理的约束**
   ```typescript
   hardConstraints: {
     minWords: 1000,
     maxWords: 5000,
     keywords: ['重要', '关键词'],
   }
   ```

3. **处理质检失败**
   ```typescript
   if (!state.textQualityReport?.passed) {
     console.log('质检未通过，建议:', state.textQualityReport.fixSuggestions);
   }
   ```

4. **保存工作流结果**
   ```typescript
   const result = {
     articleContent: state.articleContent,
     images: state.images,
     qualityReport: state.textQualityReport,
     executedAt: new Date().toISOString(),
   };

   // 保存到数据库或文件
   await saveResult(result);
   ```

## 更多信息

- 架构文档: `docs/workflow-architecture-stage2.md`
- API 文档: `docs/api/`
- 示例代码: `examples/`
