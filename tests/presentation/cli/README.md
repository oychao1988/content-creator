# CLI 测试文档

本文档介绍 CLI 端到端测试的运行方法、编写规范和最佳实践。

## 目录

- [测试概述](#测试概述)
- [快速开始](#快速开始)
- [测试结构](#测试结构)
- [运行测试](#运行测试)
- [编写测试](#编写测试)
- [Mock 使用](#mock-使用)
- [最佳实践](#最佳实践)
- [故障排除](#故障排除)

---

## 测试概述

CLI 测试套件采用端到端测试策略，通过实际执行 CLI 命令来验证功能正确性。

### 测试覆盖范围

- ✅ **命令参数验证**：验证所有命令的参数解析和验证逻辑
- ✅ **工作流类型支持**：测试多种工作流类型的创建和执行
- ✅ **任务生命周期**：从创建到完成的全流程测试
- ✅ **错误处理**：验证各种错误场景的友好提示
- ✅ **并发性能**：测试高负载下的系统稳定性
- ✅ **大数据量**：验证大量任务查询的性能

### 测试文件

| 文件 | 描述 | 测试数量 |
|------|------|----------|
| `cli-create.test.ts` | Create 命令测试 | 20+ |
| `cli-status.test.ts` | Status 命令测试 | 10+ |
| `cli-result.test.ts` | Result 命令测试 | 10+ |
| `cli-cancel.test.ts` | Cancel 命令测试 | 8+ |
| `cli-workflow-commands.test.ts` | Workflow 命令测试 | 10+ |
| `cli-lifecycle.test.ts` | 任务生命周期测试 | 15+ |
| `cli-scaffold.test.ts` | 脚手架命令测试 | 8+ |
| `cli-performance.test.ts` | 性能和压力测试 | 12+ |
| `cli-workflows-integration.test.ts` | 工作流集成测试 | 10+ |

---

## 快速开始

### 环境准备

```bash
# 安装依赖
pnpm install

# 验证环境配置
pnpm run verify-env
```

### 运行所有 CLI 测试

```bash
# 运行所有 CLI 测试
pnpm test tests/presentation/cli

# 运行单个测试文件
pnpm test tests/presentation/cli/cli-create.test.ts

# 监听模式（开发时使用）
pnpm test:watch tests/presentation/cli
```

---

## 测试结构

### 目录结构

```
tests/presentation/cli/
├── cli-create.test.ts              # Create 命令测试
├── cli-status.test.ts              # Status 命令测试
├── cli-result.test.ts              # Result 命令测试
├── cli-cancel.test.ts              # Cancel 命令测试
├── cli-workflow-commands.test.ts   # Workflow 命令测试
├── cli-lifecycle.test.ts           # 任务生命周期测试
├── cli-scaffold.test.ts            # 脚手架命令测试
├── cli-performance.test.ts         # 性能和压力测试
├── cli-workflows-integration.test.ts # 工作流集成测试
└── README.md                       # 本文档
```

### 测试文件模板

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('@e2e CLI 测试描述', () => {
  const testDbPath = join(process.cwd(), '.test-db.sqlite');

  function cleanupTestDb() {
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath);
      } catch (e) {
        // 忽略删除错误
      }
    }
  }

  beforeAll(() => {
    cleanupTestDb();
  });

  afterAll(() => {
    cleanupTestDb();
  });

  function execCliCommand(args: string[]) {
    try {
      const stdout = execSync(
        `tsx src/presentation/cli/index.ts ${args.join(' ')}`,
        {
          encoding: 'utf-8',
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: 'test',
            DATABASE_TYPE: 'memory',
          },
        }
      );
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.status || 1,
      };
    }
  }

  it('测试用例描述', () => {
    const result = execCliCommand(['create', '--topic', '测试']);
    expect(result.exitCode).toBe(0);
  });
});
```

---

## 运行测试

### 基本命令

```bash
# 运行所有 CLI 测试
pnpm test tests/presentation/cli

# 运行特定测试文件
pnpm test cli-create.test.ts

# 运行特定测试套件
pnpm test cli-create.test.ts -t "工作流类型验证"

# 显示详细输出
pnpm test tests/presentation/cli --reporter=verbose

# 生成覆盖率报告
pnpm test tests/presentation/cli --coverage
```

### 性能测试

```bash
# 运行性能测试
pnpm test cli-performance.test.ts

# 性能测试结果会保存到 .test-performance.json
cat .test-performance.json
```

### 并发测试

```bash
# 运行包含并发测试的套件
pnpm test cli-lifecycle.test.ts
```

---

## 编写测试

### 测试命名规范

- 文件名：`cli-{command}.test.ts`
- 测试套件：使用 `describe` 分组，以 `@e2e` 或 `@performance` 标记
- 测试用例：使用 `it`，以 `应该` 开头描述预期行为

```typescript
describe('@e2e CLI Create Command', () => {
  describe('参数验证', () => {
    it('应该在缺少必需参数时显示友好错误', () => {
      // 测试代码
    });
  });
});
```

### 测试组织

按功能分组：

1. **参数验证测试**：验证命令行参数的解析和验证
2. **功能测试**：验证命令的核心功能
3. **错误处理测试**：验证错误场景的处理
4. **边界条件测试**：验证极端情况的行为
5. **性能测试**：验证性能指标

### 断言最佳实践

```typescript
// ✅ 好的断言：具体且明确
expect(result.exitCode).toBe(1);
expect(output).toContain('缺少必需参数');
expect(output).toContain('topic');

// ❌ 不好的断言：过于宽泛
expect(result).toBeTruthy();
expect(output).toBeDefined();
```

### 测试数据管理

```typescript
// ✅ 使用测试数据构建器
function createTestTask(overrides: Partial<Task> = {}) {
  return {
    topic: '测试主题',
    requirements: '测试要求',
    ...overrides,
  };
}

// ✅ 使用测试数据工厂
const testTasks = {
  valid: {
    topic: '有效主题',
    requirements: '有效要求',
  },
  invalid: {
    topic: '',
    requirements: '',
  },
};
```

---

## Mock 使用

### 环境变量 Mock

CLI 测试使用内存数据库和测试环境变量：

```typescript
{
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_TYPE: 'memory',  // 使用内存数据库
    LLM_SERVICE_TYPE: 'mock', // 可选：使用 Mock LLM 服务
  }
}
```

### 数据库 Mock

默认使用内存数据库，无需额外配置：

```typescript
// 在测试环境中自动使用内存数据库
DATABASE_TYPE: 'memory'
```

### 外部服务 Mock

如需 Mock 外部服务（如 LLM API），可以在 `src/services/llm/` 中添加 Mock 实现：

```typescript
// 示例：Mock LLM 服务
class MockLLMService implements ILLMService {
  async chat(request: ChatRequest): Promise<ChatResponse> {
    return {
      content: 'Mock response',
      tokensIn: 100,
      tokensOut: 50,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
```

---

## 最佳实践

### 1. 测试隔离

每个测试应该独立运行，不依赖其他测试的状态：

```typescript
beforeEach(() => {
  // 每个测试前清理状态
  cleanupTestDb();
});

afterEach(() => {
  // 每个测试后清理状态
  cleanupTestDb();
});
```

### 2. 测试可读性

使用描述性的测试名称和清晰的测试结构：

```typescript
describe('创建任务', () => {
  it('应该成功创建包含所有参数的任务', () => {
    // Given: 准备测试数据
    const params = { topic: '测试', requirements: '要求' };

    // When: 执行操作
    const result = execCliCommand(['create', ...params]);

    // Then: 验证结果
    expect(result.exitCode).toBe(0);
  });
});
```

### 3. 等待异步操作

对于异步操作，使用适当的等待策略：

```typescript
// ✅ 使用超时控制
execCliCommand(['create', '--topic', '测试'], {
  timeout: 30000, // 30 秒超时
});

// ✅ 使用重试逻辑
async function waitForTaskCompletion(taskId: string, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const result = execCliCommand(['status', '--task-id', taskId]);
    if (result.stdout.includes('completed')) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Task did not complete in time');
}
```

### 4. 错误处理测试

确保测试覆盖各种错误场景：

```typescript
describe('错误处理', () => {
  it('应该在缺少必需参数时显示友好错误', () => {
    const result = execCliCommand(['create']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('缺少必需参数');
  });

  it('应该在参数无效时显示具体错误信息', () => {
    const result = execCliCommand(['create', '--priority', 'invalid']);
    expect(result.stderr).toContain('优先级');
  });
});
```

### 5. 性能基准测试

为关键操作设置性能基准：

```typescript
it('create 命令应该在 1 秒内完成', () => {
  const startTime = Date.now();
  execCliCommand(['create', '--topic', '测试', '--requirements', '要求']);
  const duration = Date.now() - startTime;

  expect(duration).toBeLessThan(1000);
});
```

### 6. 测试数据清理

确保测试后清理所有创建的数据：

```typescript
afterAll(() => {
  cleanupTestDb();

  // 清理其他测试文件
  const testFiles = [
    '.test-db.sqlite',
    '.test-performance.json',
  ];

  testFiles.forEach(file => {
    if (existsSync(join(process.cwd(), file))) {
      unlinkSync(join(process.cwd(), file));
    }
  });
});
```

---

## 故障排除

### 常见问题

#### 1. 测试超时

**问题**：测试执行超时

**解决方案**：
```typescript
// 增加超时时间
it('应该完成操作', async () => {
  // 测试代码
}, 30000); // 30 秒超时

// 或在命令中指定超时
execCliCommand(['create'], { timeout: 30000 });
```

#### 2. 数据库锁定

**问题**：测试数据库文件被锁定

**解决方案**：
```typescript
// 使用内存数据库
env: {
  DATABASE_TYPE: 'memory',
}

// 或确保每个测试使用独立的数据库文件
const testDbPath = join(process.cwd(), `.test-db-${Date.now()}.sqlite`);
```

#### 3. 端口冲突

**问题**：测试需要的服务端口被占用

**解决方案**：
```bash
# 检查并停止占用端口的服务
lsof -ti:3000 | xargs kill -9

# 或在测试中使用随机端口
```

#### 4. 环境变量问题

**问题**：测试环境变量未正确设置

**解决方案**：
```typescript
// 确保在 execCliCommand 中设置环境变量
execCliCommand(['create'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_TYPE: 'memory',
  }
});
```

### 调试技巧

#### 1. 查看详细输出

```bash
# 运行测试时显示详细输出
pnpm test tests/presentation/cli --reporter=verbose

# 或在代码中添加日志
console.log('Debug info:', result.stdout);
```

#### 2. 保留测试数据库

```typescript
// 注释掉 cleanupTestDb() 以保留测试数据库用于调试
// afterAll(() => {
//   cleanupTestDb();
// });
```

#### 3. 单独运行失败的测试

```bash
# 运行特定的测试用例
pnpm test cli-create.test.ts -t "应该拒绝未知的工作流类型"
```

---

## 性能测试指南

### 运行性能测试

```bash
# 运行所有性能测试
pnpm test cli-performance.test.ts

# 查看性能测试结果
cat .test-performance.json
```

### 性能基准

当前性能基准（可能根据硬件配置有所不同）：

| 操作 | 基准时间 | 备注 |
|------|----------|------|
| create 命令 | < 1000ms | 参数验证和任务创建 |
| status 命令 | < 500ms | 查询任务状态 |
| result 命令 | < 500ms | 查询任务结果 |
| list 命令 | < 500ms | 列出任务列表 |
| 并发创建 10 个任务 | < 5000ms | 并发性能 |
| 查询 100 个任务 | < 1000ms | 大数据量查询 |

### 性能优化建议

1. **使用索引**：确保数据库查询使用适当的索引
2. **批量操作**：对于批量操作使用批量 API
3. **缓存结果**：缓存频繁访问的数据
4. **异步处理**：将耗时操作放入后台队列

---

## 贡献指南

### 添加新测试

1. 在 `tests/presentation/cli/` 创建新的测试文件
2. 遵循现有的测试结构和命名规范
3. 确保测试独立运行
4. 添加必要的清理逻辑
5. 更新本文档的测试覆盖表格

### 审查测试

在提交 PR 前：

```bash
# 运行所有 CLI 测试
pnpm test tests/presentation/cli

# 检查测试覆盖率
pnpm test tests/presentation/cli --coverage

# 运行 linter
pnpm lint
```

---

## 相关文档

- [主项目 README](../../../README.md)
- [开发文档](../../../docs/development/)
- [CLAUDE.md](../../../CLAUDE.md)

---

## 最后更新

- **日期**：2025-02-04
- **版本**：1.0.0
- **维护者**：开发团队
