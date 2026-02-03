# CLI 命令测试覆盖情况报告

生成时间: 2026-01-21

## 📊 总体评估

**❌ 当前状态：缺少 CLI 命令的端到端测试**

项目中**没有**针对以下 CLI 命令的专门端到端测试：
- ❌ `create` - 创建内容创作任务
- ❌ `status` - 查询任务状态
- ❌ `result` - 获取任务结果
- ❌ `cancel` - 取消任务执行

---

## 📁 现有测试文件

### ✅ 已有的测试

#### 1. 单元测试 (tests/)
```
✓ infrastructure/ApiKeyService.test.ts
✓ infrastructure/CacheService.test.ts
✓ infrastructure/MetricsService.test.ts
✓ infrastructure/QuotaService.test.ts
✓ infrastructure/RateLimiter.test.ts
✓ nodes/SearchNode.test.ts
✓ nodes/WriteNode.test.ts
✓ quality/HardRuleChecker.test.ts
✓ quality/LLMEvaluator.test.ts
✓ quality/QualityCheckService.test.ts
✓ queue/TaskQueue.test.ts
✓ schedulers/TaskScheduler.test.ts
✓ workers/TaskWorker.test.ts
```

#### 2. 集成测试 (tests/integration/)
```
✓ queue-integration.test.ts    - 队列集成测试
✓ workflow-integration.test.ts - 工作流集成测试
```

#### 3. 手动测试脚本 (scripts/)
```
✓ test-basic.ts               - 基础功能测试
✓ test-e2e.ts                 - 端到端工作流测试
✓ test-workflow-e2e.ts        - 工作流 E2E 测试
✓ test-workflow-full.ts       - 完整工作流测试
✓ test-workflow-simple.ts     - 简单工作流测试
✓ test-workflow-structure.ts  - 工作流结构测试
✓ test-doubao-image.ts        - 图片生成测试
✓ test-security-services.ts   - 安全服务测试
```

### ❌ 缺失的测试

#### CLI 命令端到端测试 (tests/cli/)
```
✗ cli-create.test.ts      - CREATE 命令测试
✗ cli-status.test.ts      - STATUS 命令测试
✗ cli-result.test.ts      - RESULT 命令测试
✗ cli-cancel.test.ts      - CANCEL 命令测试
✗ cli-e2e.test.ts         - CLI 端到端测试
```

---

## 🎯 需要测试的场景

### 1. CREATE 命令测试

```bash
# 基础功能测试
✓ 创建同步任务
✓ 创建异步任务
✓ 参数验证（缺少必需参数）
✓ 不同优先级设置
✓ 字数限制参数
✓ 目标受众和关键词设置
✓ 不同语气风格

# 边界条件测试
✓ 超长主题处理
✓ 特殊字符处理
✓ 空字符串参数
✓ 最大/最小字数边界

# 错误处理测试
✓ API 连接失败
✓ 数据库连接失败
✓ 参数格式错误
✓ 资源清理验证
```

### 2. STATUS 命令测试

```bash
# 基础功能测试
✓ 查询存在的任务
✓ 查询不存在的任务
✓ 显示不同状态的任务（pending/running/completed/failed）
✓ 显示重试统计
✓ 显示错误信息

# 边界条件测试
✓ 无效的任务 ID 格式
✓ 已删除的任务查询
✓ Worker ID 显示

# 资源管理测试
✓ 数据库连接池关闭
✓ 进程正常退出
```

### 3. RESULT 命令测试

```bash
# 基础功能测试
✓ 获取已完成任务的结果
✓ 获取未完成任务的提示
✓ JSON 格式输出
✓ 文本格式输出
✓ 显示文章内容
✓ 显示图片 URL
✓ 显示元数据（字数等）

# 边界条件测试
✓ 无结果的任务
✓ 多个结果（文章 + 图片）
✓ JSON 格式验证
✓ 结果截断处理

# 错误处理测试
✓ jsonb 解析错误（已修复）
✓ 数据库查询失败
✓ 资源清理验证
```

### 4. CANCEL 命令测试

```bash
# 基础功能测试
✓ 取消 pending 状态的任务
✓ 取消 running 状态的任务
✓ 无法取消 completed 任务
✓ 无法取消 failed 任务
✓ 取消不存在的任务

# 边界条件测试
✓ 重复取消同一任务
✓ 取消后状态验证
✓ Worker 抢占机制
```

---

## 🚀 推荐的测试实现方案

### 方案 1: 使用 Vitest 的 CLI 测试

创建 `tests/cli/cli-e2e.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { Pool } from 'pg';

describe('CLI E2E Tests', () => {
  let pool: Pool;
  let testTaskId: string;

  beforeAll(async () => {
    // 设置测试数据库
    pool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('CREATE command', () => {
    it('should create a sync task successfully', async () => {
      const result = await executeCLI([
        'create',
        '-t', 'Test Topic',
        '-r', 'Test Requirements',
        '--mode', 'sync'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('执行成功');
      expect(result.stdout).toMatch(/任务ID: .+/);
      testTaskId = result.stdout.match(/任务ID: (.+)/)?.[1];
    });

    it('should validate required parameters', async () => {
      const result = await executeCLI(['create']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('必须提供文章主题');
    });
  });

  describe('STATUS command', () => {
    it('should show task status', async () => {
      const result = await executeCLI([
        'status',
        '-t', testTaskId
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('任务状态');
      expect(result.stdout).toContain(testTaskId);
    });

    it('should handle non-existent task', async () => {
      const result = await executeCLI([
        'status',
        '-t', 'non-existent-id'
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('未找到任务');
    });
  });

  describe('RESULT command', () => {
    it('should get task results', async () => {
      const result = await executeCLI([
        'result',
        '-t', testTaskId
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('任务结果');
    });

    it('should support JSON format', async () => {
      const result = await executeCLI([
        'result',
        '-t', testTaskId,
        '--format', 'json'
      ]);

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('taskId');
    });
  });

  describe('CANCEL command', () => {
    it('should cancel a pending task', async () => {
      // 先创建一个异步任务
      const createResult = await executeCLI([
        'create',
        '-t', 'Cancel Test',
        '-r', 'To be cancelled',
        '--mode', 'async'
      ]);

      const taskId = createResult.stdout.match(/任务ID: (.+)/)?.[1];

      // 取消任务
      const cancelResult = await executeCLI([
        'cancel',
        '-t', taskId
      ]);

      expect(cancelResult.exitCode).toBe(0);
      expect(cancelResult.stdout).toContain('任务已成功取消');
    });
  });
});

// 辅助函数
async function executeCLI(args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['cli', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ exitCode: code || 0, stdout, stderr });
    });
  });
}
```

### 方案 2: 使用 Playwright 的 CLI 测试

创建 `tests/cli/playwright-cli.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('CLI Commands', () => {
  test('should create and query task', async ({ }) => {
    // 创建任务
    const create = await execCLI('create', '-t', 'Test', '-r', 'Requirements');
    expect(create.exitCode).toBe(0);

    const taskId = extractTaskId(create.stdout);

    // 查询状态
    const status = await execCLI('status', '-t', taskId);
    expect(status.stdout).toContain('任务状态');

    // 获取结果
    const result = await execCLI('result', '-t', taskId);
    expect(result.stdout).toContain('任务结果');
  });
});
```

---

## 📋 测试优先级

### 🔴 高优先级（必须实现）
1. ✅ **CREATE 命令基础功能测试**
   - 创建同步/异步任务
   - 参数验证
   - 错误处理

2. ✅ **STATUS 命令测试**
   - 查询不同状态的任务
   - 不存在任务的处理
   - 资源清理验证

3. ✅ **RESULT 命令测试**
   - 获取已完成任务结果
   - JSON/文本格式输出
   - jsonb 解析验证

### 🟡 中优先级（建议实现）
4. **CANCEL 命令测试**
   - 取消不同状态的任务
   - 边界条件处理

5. **CLI 端到端测试**
   - 完整工作流（创建 → 查询 → 获取结果）
   - 资源清理验证
   - 进程退出验证

### 🟢 低优先级（可选）
6. **性能测试**
   - 大量任务创建
   - 并发命令执行
   - 响应时间基准

7. **集成测试**
   - 与真实数据库交互
   - 与 Redis 交互
   - 完整的系统测试

---

## 🎯 建议的实施步骤

### 第 1 步：创建测试框架
```bash
# 创建 CLI 测试目录
mkdir -p tests/cli

# 创建测试辅助文件
touch tests/cli/helpers.ts
touch tests/cli/cli-e2e.test.ts
```

### 第 2 步：实现基础测试
- CREATE 命令基础功能测试
- STATUS 命令测试
- RESULT 命令测试

### 第 3 步：运行并验证
```bash
# 运行 CLI 测试
pnpm test cli-e2e

# 检查覆盖率
pnpm test:coverage
```

### 第 4 步：持续集成
- 添加到 CI/CD 流程
- 自动化测试报告
- 覆盖率监控

---

## 📊 预期成果

实施这些测试后，预期达到：

✅ **测试覆盖率**: CLI 命令 > 80%
✅ **回归测试**: 每次修改都能自动验证
✅ **文档价值**: 测试用例作为使用示例
✅ **质量保证**: 减少生产环境 bug

---

## 🔧 相关资源

- [Vitest 文档](https://vitest.dev/)
- [Commander.js 文档](https://github.com/tj/commander.js/blob/master/Readme_zh-CN.md)
- [Node.js Child Process](https://nodejs.org/api/child_process.html)
- [测试最佳实践](tests/README.md)

---

## 📝 结论

当前项目**缺少** CLI 命令的端到端测试，这是一个需要补充的重要测试领域。建议优先实现高优先级测试用例，以确保 CLI 命令的稳定性和可靠性。

**下一步行动**:
1. 创建 `tests/cli/` 目录
2. 实现 CLI 测试辅助函数
3. 编写 CREATE/STATUS/RESULT/CANCEL 命令的测试用例
4. 集成到 CI/CD 流程
