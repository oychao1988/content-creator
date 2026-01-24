# Content Creator 快速开始指南

本文档将帮助你快速上手使用 Content Creator 写作 Agent 系统。

---

## 📋 前置要求

### 必需

- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0
- **PostgreSQL**: >= 14.0
- **Redis**: >= 7.0（可选，用于缓存）

### API 密钥

- ✅ **DeepSeek API**: 用于 LLM 调用
- ✅ **Tavily API**: 用于搜索
- ⏳ **Doubao API**: 可选，用于图片生成

---

## 🚀 快速安装

### 1. 克隆项目

```bash
cd /path/to/projects/content-creator
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```bash
# DeepSeek API（必需）
DEEPSEEK_API_KEY=your-deepseek-api-key

# Tavily API（必需）
TAVILY_API_KEY=your-tavily-api-key

# Doubao API（可选，用于图片生成）
DOUBAO_API_KEY=your-doubao-api-key

# 数据库配置
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_DB=content_creator

# Redis 配置（可选）
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 4. 初始化数据库

```bash
# 运行数据库迁移
pnpm run db:migrate

# 查看迁移状态
pnpm run db:status
```

---

## 💡 基础使用

### 方式 1：使用示例代码

最简单的方式是运行示例代码：

```bash
# 运行基本示例
tsx examples/workflow-example.ts
```

示例代码包含：
- 基本工作流执行
- 检查点恢复
- 流式输出

### 方式 2：编写自己的代码

创建一个新文件 `my-workflow.ts`：

```typescript
import {
  createSimpleContentCreatorGraph,
  createInitialState,
  ExecutionMode,
} from './src/domain/workflow/index.js';

async function main() {
  // 1. 创建工作流图
  const graph = createSimpleContentCreatorGraph();

  // 2. 创建初始状态
  const initialState = createInitialState({
    taskId: `my-task-${Date.now()}`,
    mode: ExecutionMode.SYNC,
    topic: 'Web 开发的最佳实践',
    requirements: '写一篇关于现代 Web 开发最佳实践的文章',
    hardConstraints: {
      minWords: 600,
      maxWords: 1200,
      keywords: ['Web', '前端', '性能优化'],
    },
  });

  // 3. 执行工作流
  const result = await graph.invoke(initialState);

  // 4. 输出结果
  console.log('文章内容:', result.articleContent);
  console.log('配图数量:', result.images?.length || 0);
  console.log('文本质检:', result.textQualityReport?.passed ? '通过' : '未通过');
}

main();
```

运行：

```bash
tsx my-workflow.ts
```

### 方式 3：流式输出

如果你想要实时查看进度：

```typescript
import { createSimpleContentCreatorGraph, createInitialState } from './src/domain/workflow/index.js';

async function main() {
  const graph = createSimpleContentCreatorGraph();
  const initialState = createInitialState({ /* ... */ });

  // 流式执行
  for await (const event of graph.stream(initialState)) {
    const [nodeName, output] = Object.entries(event)[0];

    if (nodeName !== '__end__') {
      console.log(`✅ ${nodeName} 完成`);
      console.log('   当前步骤:', output.currentStep);
    }
  }

  console.log('🎉 工作流完成！');
}

main();
```

---

## 🧪 运行测试

### 1. 结构测试（最快）

验证工作流基本结构：

```bash
tsx scripts/test-workflow-structure.ts
```

### 2. 端到端测试

使用 Mock 测试完整流程：

```bash
tsx scripts/test-e2e.ts
```

### 3. 单元测试

测试单个节点：

```bash
npm test
```

---

## 📊 监控和调试

### Monitor 监控面板

**启动监控面板**:

```bash
# 启动 Bull Board 监控面板
pnpm run monitor
```

**访问地址**: http://localhost:3000/admin/queues

**主要功能**:
- 查看任务队列状态（等待中、执行中、已完成、失败）
- 手动重试失败的任务
- 查看任务详情和日志
- 暂停/恢复队列
- 清空队列

**测试 API 端点**:

```bash
# 健康检查
curl http://localhost:3000/health

# 获取队列统计
curl http://localhost:3000/api/stats
```

**完整使用流程**:

```bash
# 1. 启动监控面板（终端 1）
pnpm run monitor

# 2. 启动 Worker（终端 2）
pnpm run worker

# 3. 创建异步任务（终端 3）
pnpm run cli create \
  --topic "Web 开发最佳实践" \
  --requirements "写一篇关于现代 Web 开发的文章" \
  --mode async

# 4. 在浏览器中访问 http://localhost:3000/admin/queues
#    观察任务从创建到完成的整个流程
```

### 查看日志

系统使用 Winston 日志，输出到控制台和文件。

```bash
# 查看日志文件
tail -f logs/app.log
tail -f logs/error.log
```

### 调试模式

```bash
# 启用调试日志
DEBUG=* tsx my-workflow.ts

# 调试特定模块
DEBUG=SearchNode,WriteNode tsx my-workflow.ts
```

### 性能监控

工作流会自动记录 Token 使用和成本：

```typescript
const result = await graph.invoke(initialState);

// 查看成本信息（需要实现 TokenUsage Repository）
console.log('Token 使用:', result.usage);
console.log('成本:', result.cost);
```

---

## 🎯 常见使用场景

### 场景 1：生成短文

```typescript
const state = createInitialState({
  topic: '远程工作的优势',
  requirements: '分析远程工作的优势和挑战',
  hardConstraints: {
    minWords: 300,
    maxWords: 500,
  },
});
```

### 场景 2：生成长文

```typescript
const state = createInitialState({
  topic: '人工智能的发展历史',
  requirements: '详细介绍 AI 从起源到现在的发展历程',
  hardConstraints: {
    minWords: 2000,
    maxWords: 3000,
    keywords: ['人工智能', '历史', '发展'],
  },
});
```

### 场景 3：带配图的文章

```typescript
const state = createInitialState({
  topic: '城市绿化的重要性',
  requirements: '讨论城市绿化对环境和居民的影响',
  imagePrompts: ['城市公园绿地', '绿色建筑'], // 可选
});
```

---

## ⚙️ 高级配置

### 自定义节点配置

```typescript
import { SearchNode } from './src/domain/workflow/nodes/SearchNode.js';

// 创建自定义配置的节点
const searchNode = new SearchNode({
  maxResults: 15,      // 增加搜索结果数量
  useCache: true,      // 启用缓存
  cacheTTL: 172800,    // 缓存 48 小时
});
```

### 自定义质检标准

```typescript
import { CheckTextNode } from './src/domain/workflow/nodes/CheckTextNode.js';

const checkNode = new CheckTextNode({
  minPassingScore: 8.0,  // 提高通过分数
  softScoreWeights: {
    relevance: 0.4,      // 增加相关性权重
    coherence: 0.3,
    completeness: 0.2,
    readability: 0.1,
  },
});
```

### 使用检查点恢复

```typescript
import { checkpointManager } from './src/domain/workflow/CheckpointManager.js';

// 恢复之前的状态
const restoredState = await checkpointManager.restoreState(
  taskId,
  initialState
);

// 继续执行
const result = await graph.invoke(restoredState);
```

---

## 🐛 故障排除

### 问题 1：API 调用失败

**错误信息**: `Search API error: 401`

**解决方案**:
- 检查 API 密钥是否正确
- 确认 API 密钥有足够的额度
- 查看 API 密钥是否过期

### 问题 2：数据库连接失败

**错误信息**: `Connection refused`

**解决方案**:
- 确认 PostgreSQL 是否运行
- 检查数据库配置是否正确
- 验证网络连接

### 问题 3：Token 限制

**错误信息**: `Token limit exceeded`

**解决方案**:
- 减少搜索结果数量
- 缩短文章长度要求
- 使用更简洁的 Prompt

### 问题 4：质检总是失败

**可能原因**:
- 硬性约束太严格
- LLM 生成质量不稳定

**解决方案**:
- 放宽字数限制
- 减少必须包含的关键词
- 降低 `minPassingScore`

---

## 📖 更多资源

- [完整架构文档](./architecture-complete.md)
- [阶段 2b 完成总结](./phase-2b-final-summary.md)
- [测试指南](../tests/README.md)
- [API 文档](../src/domain/workflow/README.md)

---

## 🤝 获取帮助

如果遇到问题：

1. 查看日志文件 `logs/error.log`
2. 运行测试脚本验证环境
3. 查阅相关文档
4. 检查 GitHub Issues

---

**祝你使用愉快！** 🎉
