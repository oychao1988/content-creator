# Content Creator 测试指南

## 📁 测试结构

```
tests/
├── fixtures/                  # 🆕 测试数据和 Fixtures (新增)
│   └── common-fixtures.ts     # 统一的测试数据管理
├── utils/
│   └── test-helpers.ts        # 测试工具和 Mock 函数
├── nodes/                     # 工作流节点测试
│   ├── SearchNode.test.ts     # Search Node 单元测试
│   └── WriteNode.test.ts      # Write Node 单元测试
├── integration/               # 集成测试
│   ├── queue-integration.test.ts    # 队列系统集成
│   └── workflow-integration.test.ts # 工作流集成测试
├── performance/               # 🆕 性能基准测试 (新增)
│   └── CacheService.bench.test.ts   # 缓存服务性能测试
├── infrastructure/            # 基础设施测试
│   ├── ApiKeyService.test.ts  # API Key 管理
│   ├── CacheService.test.ts   # 缓存服务
│   ├── MetricsService.test.ts # Prometheus 指标
│   ├── QuotaService.test.ts   # 配额管理
│   └── RateLimiter.test.ts    # 速率限制
├── quality/                   # 质量检查测试
│   ├── HardRuleChecker.test.ts    # 硬规则检查
│   ├── LLMEvaluator.test.ts       # LLM 评估
│   └── QualityCheckService.test.ts # 质量检查服务
├── workers/                   # Worker 测试
│   └── TaskWorker.test.ts     # 任务工作器
├── schedulers/                # 调度器测试
│   └── TaskScheduler.test.ts  # 任务调度器
├── queue/                     # 队列测试
│   └── TaskQueue.test.ts      # 任务队列
├── manual/                    # 手动测试和调试脚本
│   ├── test-cli-exit.mjs      # CLI 退出测试
│   ├── test-save-results.mjs  # 结果保存测试
│   └── check-tasks.mjs        # 任务检查脚本
└── logs/                      # 测试日志文件
    ├── real-env-test.log
    └── test-*.log

scripts/
├── test-e2e.ts                # 端到端测试脚本
├── test-workflow-structure.ts # 工作流结构测试
└── test-scripts.ts            # 🆕 测试脚本配置 (新增)
```

## 🚀 运行测试

### 快速测试命令

```bash
# 运行所有测试
pnpm test

# 只运行单元测试 (推荐日常开发) 🆕
pnpm test:unit

# 只运行集成测试 🆕
pnpm test:integration

# 运行性能基准测试 🆕
pnpm test:performance

# 监听模式 (开发时自动重新运行)
pnpm test:watch

# 生成覆盖率报告
pnpm test:coverage

# 交互式 UI 模式 🆕
pnpm test:ui

# 运行特定测试文件 🆕
pnpm test CacheService.test.ts
```

### 按标签运行测试 🆕

```bash
# 只运行单元测试 (@unit)
pnpm test -- --grep "@unit"

# 只运行集成测试 (@integration)
pnpm test -- --grep "@integration"

# 只运行性能测试 (@performance)
pnpm test -- --grep "@performance"

# 只运行慢速测试 (@slow)
pnpm test -- --grep "@slow"
```

### 测试分类

测试按速度和依赖分为三类：

1. **@unit** - 单元测试
   - 快速执行 (< 5秒)
   - Mock 所有外部依赖
   - 测试单个功能点

2. **@integration** - 集成测试
   - 中等速度 (5-30秒)
   - 使用真实 Redis/数据库
   - 测试组件间协作

3. **@performance** - 性能测试 🆕
   - 较慢 (30秒-2分钟)
   - 测试性能基准
   - 验证并发和大数据处理

4. **@slow** - 慢速测试
   - 很慢 (2-5分钟)
   - 使用真实 LLM API
   - 端到端测试

### 手动测试脚本

在 `tests/manual/` 目录中包含了各种手动测试和调试脚本：

```bash
# 从项目根目录运行手动测试
node tests/manual/simple-test.mjs           # 简单的保存测试
node tests/manual/test-cli-exit.mjs         # 测试 CLI 命令退出
node tests/manual/test-save-results.mjs     # 测试结果保存
node tests/manual/check-tasks.mjs           # 检查任务状态
node tests/manual/list-tasks.mjs            # 列出所有任务
```

**注意**: 手动测试脚本需要从项目根目录运行，因为它们使用相对路径导入源代码。

## 🛠️ 使用测试 Fixtures 🆕

我们提供了统一的测试数据 fixtures，避免重复代码，提高测试可维护性。

### 基本用法

```typescript
import {
  taskFixtures,
  qualityCheckFixtures,
  createWorkflowState,
  createMockSearchResults,
  createMockArticleContent,
} from '@test/fixtures/common-fixtures';

describe('MyFeature', () => {
  it('should handle valid task', async () => {
    // 使用预定义的测试数据
    const task = taskFixtures.validAsyncTask;
    expect(task.topic).toBeDefined();
  });

  it('should create custom state', async () => {
    // 覆盖默认值创建自定义状态
    const state = createWorkflowState({
      topic: '自定义主题',
      hardConstraints: {
        minWords: 1000,
        maxWords: 2000,
      },
    });
    expect(state.topic).toBe('自定义主题');
  });

  it('should use quality check fixtures', async () => {
    // 使用预定义的质量报告
    const report = qualityCheckFixtures.good;
    expect(report.passed).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(8.0);
  });
});
```

### 可用的 Fixtures

#### 任务 Fixtures

```typescript
import { taskFixtures } from '@test/fixtures/common-fixtures';

// 有效的异步任务
taskFixtures.validAsyncTask

// 有效的同步任务
taskFixtures.validSyncTask

// 带硬约束的任务
taskFixtures.taskWithConstraints

// 无效任务 (用于测试错误处理)
taskFixtures.invalidTaskEmptyTopic
taskFixtures.invalidTaskEmptyRequirements
taskFixtures.invalidTaskMinMax

// 批量任务
taskFixtures.batchTasks
```

#### 工作流状态 Fixtures

```typescript
import { createWorkflowState, workflowStateFixtures } from '@test/fixtures/common-fixtures';

// 创建自定义状态
const state = createWorkflowState({
  topic: '自定义主题',
  hardConstraints: { minWords: 500 },
});

// 使用预定义状态
workflowStateFixtures.initialState         // 初始状态
workflowStateFixtures.stateWithSearchResults  // 带搜索结果
workflowStateFixtures.stateWithOrganizedInfo  // 带组织信息
workflowStateFixtures.rewriteState           // 重写模式
workflowStateFixtures.completedState         // 完成状态
```

#### 质量检查 Fixtures

```typescript
import { qualityCheckFixtures } from '@test/fixtures/common-fixtures';

qualityCheckFixtures.excellent    // 优秀 (9.5分)
qualityCheckFixtures.good        // 良好 (8.0分)
qualityCheckFixtures.passing     // 及格 (7.0分)
qualityCheckFixtures.failedHardRules   // 硬规则失败
qualityCheckFixtures.failedSoftScore   // 软评分失败
qualityCheckFixtures.needsRewrite      // 需要重写
```

#### 其他 Fixtures

```typescript
import {
  searchResultFixtures,
  articleContentFixtures,
  apiKeyFixtures,
  quotaFixtures,
  cacheFixtures,
  rateLimitFixtures,
  performanceFixtures,
  errorFixtures,
} from '@test/fixtures/common-fixtures';
```

### 最佳实践

```typescript
// ✅ Good - 使用 fixtures
const task = taskFixtures.validAsyncTask;

// ❌ Bad - 内联数据
const task = {
  mode: 'async' as const,
  topic: 'AI 技术',
  requirements: '写一篇文章',
  hardConstraints: { minWords: 500, maxWords: 1000 }
};
```

## 测试配置

在 `tests/utils/test-helpers.ts` 中配置 Mock 对象：

```typescript
// Mock Search Service
export class MockSearchService {
  async searchWithAnswer(query: string, maxResults: number) {
    return {
      answer: 'Mock answer',
      results: createMockSearchResults(maxResults),
    };
  }
}

// Mock LLM Service
export class MockLLMService {
  async chat(request) {
    return {
      content: 'Mock response',
      usage: { ... },
      cost: 0.001,
    };
  }
}
```

### 环境变量

创建 `.env.test` 文件：

```bash
# 使用真实 API 测试时配置
DEEPSEEK_API_KEY=your-test-api-key
TAVILY_API_KEY=your-test-api-key
DOUBAO_API_KEY=your-test-api-key

# 数据库配置（可选）
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=test
POSTGRES_PASSWORD=test
POSTGRES_DB=test_db
```

## 测试用例

### 单元测试示例

```typescript
import { SearchNode } from '../../src/domain/workflow/nodes/SearchNode.js';
import { createTestInitialState } from '../utils/test-helpers.js';

describe('SearchNode', () => {
  it('should search and return results', async () => {
    const node = new SearchNode();
    const state = createTestInitialState();

    const result = await node.executeLogic(state);

    expect(result.searchResults).toBeDefined();
    expect(result.searchResults.length).toBeGreaterThan(0);
  });
});
```

### 集成测试示例

```typescript
import { createSimpleContentCreatorGraph } from '../../src/domain/workflow/index.js';

describe('Workflow Integration', () => {
  it('should complete full workflow', async () => {
    const graph = createSimpleContentCreatorGraph();
    const initialState = createTestInitialState();

    const result = await graph.invoke(initialState);

    expect(result.articleContent).toBeDefined();
    expect(result.images).toBeDefined();
  });
});
```

## 测试策略

### 1. 单元测试策略

**目标**: 测试单个节点的逻辑

- ✅ 正常情况：验证节点正确执行
- ✅ 边界条件：测试最小/最大输入
- ✅ 错误处理：验证错误情况的处理
- ✅ 状态验证：确保输出状态正确

### 2. 集成测试策略

**目标**: 测试节点间的协作

- ✅ 完整流程：所有节点按顺序执行
- ✅ 重试机制：质检失败后重试
- ✅ 状态传递：节点间正确传递状态
- ✅ 错误恢复：从错误中恢复

### 3. 端到端测试策略

**目标**: 测试真实场景

- ✅ 真实 API：使用真实 API 测试
- ✅ 性能测试：测量执行时间和资源使用
- ✅ 并发测试：多任务并发执行
- ✅ 断点续传：崩溃后恢复

## 📊 测试覆盖率目标

项目设置了以下覆盖率目标：

| 指标 | 目标 | 说明 |
|------|------|------|
| **行覆盖率** | ≥ 70% | 代码执行行数占比 |
| **函数覆盖率** | ≥ 70% | 被调用的函数占比 |
| **分支覆盖率** | ≥ 65% | if/switch 分支执行占比 |
| **语句覆盖率** | ≥ 70% | 执行语句占比 |

### 查看覆盖率报告

```bash
# 生成覆盖率报告
pnpm test:coverage

# 报告位置:
# - Terminal: 文本格式
# - coverage/index.html: HTML 格式 (浏览器打开)
# - coverage/lcov.info: LCOV 格式 (CI/CD)
```

### 覆盖率排除

以下文件不计入覆盖率：
- `node_modules/` - 第三方依赖
- `dist/` - 构建输出
- `tests/` - 测试文件
- `**/*.test.ts` - 测试文件
- `**/*.bench.test.ts` - 性能测试
- `**/*.config.ts` - 配置文件
- `**/types/**` - 类型定义
- `migrations/**` - 数据库迁移

## ⚡ 性能测试 🆕

性能测试位于 `tests/performance/` 目录，用于验证系统在各种负载下的性能表现。

### 运行性能测试

```bash
# 运行所有性能测试
pnpm test:performance

# 查看详细性能指标
pnpm test:performance -- --reporter=verbose
```

### 性能基准示例

```typescript
describe('@performance CacheService Benchmarks', () => {
  it('should complete 1000 SET operations in < 2 seconds', async () => {
    const start = Date.now();

    for (let i = 0; i < 1000; i++) {
      await cacheService.set(`key${i}`, `value${i}`);
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000);

    console.log(`✅ 1000 SET operations: ${duration}ms`);
  });

  it('should handle 100 concurrent operations', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      cacheService.set(`key${i}`, `value${i}`)
    );

    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
  });
});
```

### 性能测试类别

1. **单操作性能**: 验证基本操作的速度
   - SET/GET/DELETE 操作
   - 目标: 1000次 < 2秒

2. **批量操作性能**: 测试批量操作效率
   - 批量 SET/GET
   - 目标: 100项 < 100ms

3. **并发性能**: 验证并发安全性
   - 并发读写
   - 目标: 100并发 < 500ms

4. **数据大小性能**: 测试不同数据量的表现
   - 小数据 (1KB)
   - 中数据 (100KB)
   - 大数据 (1MB)

5. **内存效率**: 确保内存使用合理
   - 内存泄漏检测
   - 垃圾回收验证

## 调试测试

### 查看详细日志

```bash
# 启用调试日志
DEBUG=* npm test

# 查看特定模块日志
DEBUG=SearchNode,WriteNode npm test
```

### 运行单个测试

```bash
# Jest
npm test -- --testNamePattern="should search"

# 使用 tsx 直接运行
tsx --test --test-name-pattern="should search" tests/nodes/SearchNode.test.ts
```

### 断点调试

在 VS Code 中配置 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Jest: Current File",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["${fileBasename}", "--config", "jest.config.js"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

## 常见问题

### Q: 测试失败怎么办？

1. 检查 Mock 是否正确配置
2. 查看错误日志和堆栈信息
3. 确认环境变量是否正确设置
4. 验证依赖版本是否匹配

### Q: 如何跳过某些测试？

```typescript
it.skip('should do something', async () => {
  // 这个测试会被跳过
});

describe.skip('Node Tests', () => {
  // 这个测试套件会被跳过
});
```

### Q: 如何只运行某个测试？

```typescript
it.only('should do something', async () => {
  // 只运行这个测试
});

describe.only('Node Tests', () => {
  // 只运行这个测试套件
});
```

## 测试最佳实践

1. **保持测试独立**: 每个测试应该独立运行，不依赖其他测试
2. **使用 Mock**: Mock 外部依赖，确保测试的确定性和速度
3. **清晰命名**: 测试名称应该清楚描述测试的内容
4. **Arrange-Act-Assert**: 遵循 AAA 模式组织测试代码
5. **及时更新**: 代码变更时及时更新对应测试

## 下一步

- [ ] 完善所有节点的单元测试
- [ ] 增加边界条件和错误处理测试
- [ ] 实现性能基准测试
- [ ] 添加测试覆盖率报告
- [ ] 集成 CI/CD 自动测试
