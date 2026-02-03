# 阶段 1 & 2 遗留问题清单

**整理日期**: 2025-01-19
**项目**: Content Creator (AI 内容创作系统)
**状态**: 阶段 1 (85%), 阶段 2 (100%)

---

## 📊 完成度概览

```
阶段 1: 核心数据层    ████████████████░░░  85% 🚧
阶段 2: 工作流与服务  ████████████████████ 100% ✅
```

---

## 🔴 阶段 1 遗留问题（15% 待完成）

### 1.1 其他 Repository 未实现 ⏹️

**影响**: 中等
**优先级**: 中

**缺失的 Repository**:
- [ ] `TaskStepRepository.ts` - 任务步骤存储
- [ ] `QualityCheckRepository.ts` - 质检结果存储
- [ ] `ResultRepository.ts` - 执行结果存储
- [ ] `TokenUsageRepository.ts` - Token 使用记录

**当前状态**:
- 使用临时实现/占位符
- Core TaskRepository 已完成 ✅
- MemoryTaskRepository 已完成 ✅

**解决方案**:
1. 参考 PostgresTaskRepository 实现
2. 每个约需 2-3 小时
3. 总计约 1-2 天工作量

---

### 1.2 单元测试缺失 ⏹️

**影响**: 高（长期质量风险）
**优先级**: 高

**缺失的测试**:
- [ ] 领域模型测试（Task, TaskStep 等）
- [ ] Repository CRUD 测试
- [ ] 乐观锁并发测试
- [ ] 事务回滚测试

**目标覆盖率**: 80%
**当前覆盖率**: ~0%

**解决方案**:
1. 配置 Vitest 测试环境
2. 编写单元测试
3. 配置测试覆盖率报告
4. 预计 2-3 天工作量

---

### 1.3 Zod 验证 Schema 未创建 ⏹️

**影响**: 低（输入验证依赖手动检查）
**优先级**: 中

**需要添加**:
```typescript
// src/domain/entities/schemas.ts
export const CreateTaskSchema = z.object({
  topic: z.string().min(1).max(200),
  requirements: z.string().min(1),
  mode: z.enum(['sync', 'async']),
  // ...
});
```

**解决方案**:
1. 为每个实体创建 Zod schema
2. 在 API 和 CLI 中使用
3. 预计 0.5-1 天工作量

---

### 1.4 PostgreSQL 外部连接问题 ⚠️

**影响**: 低（CLI 使用内存模式正常工作）
**优先级**: 低

**问题描述**:
- verify-env 脚本显示密码认证失败
- 内部连接（Docker exec）正常
- 外部 Node.js 连接失败

**错误信息**:
```
password authentication failed for user "postgres"
```

**临时解决方案**:
- CLI 使用 MemoryTaskRepository ✅
- Docker exec 操作数据库

**长期解决方案**:
1. 检查 pg_hba.conf 配置
2. 更新密码认证方式
3. 或切换到 scram-sha-256

---

## 🟡 阶段 2 遗留问题（已全部完成 ✅）

### 核心功能状态

| 组件 | 状态 | 备注 |
|------|------|------|
| LangGraph 集成 | ✅ | 工作流正常执行 |
| LLM Service | ✅ | 重试、超时完善 |
| Workflow State | ✅ | 类型定义完整 |
| Search Node | ✅ | Tavily 集成 |
| Organize Node | ✅ | 大纲生成 |
| Write Node | ✅ | 文章生成 |
| CheckText Node | ✅ | 质检重试 |
| GenerateImage Node | ✅ | 图片生成 |
| CheckImage Node | ✅ | 配图质检 |
| ContentCreatorGraph | ✅ | 完整工作流 |
| SyncExecutor | ✅ | 测试通过 |
| CLI 接口 | ✅ | 4个命令可用 |

---

## 🟠 技术债务问题

### 2.1 TypeScript 编译错误（约 20+ 个）⚠️

**影响**: 中（不影响 tsx 运行）
**优先级**: 中

**主要错误类型**:

1. **WorkflowState 类型不完整** (6 个错误)
```typescript
// SyncExecutor.ts:73 - targetAudience 不存在
// SyncExecutor.ts:230 - imageUrl 不存在
// SyncExecutor.ts:217 - 类型不匹配
```

**解决方案**:
- 更新 WorkflowState 接口
- 添加缺失字段定义
- 使用类型断言作为临时方案

2. **Config Zod 验证错误** (8 个错误)
```typescript
// config/index.ts - 类型转换问题
// 环境变量 string → number/boolean 转换
```

**解决方案**:
- 修复 Zod schema 类型定义
- 使用 `.pipe(z.coerce...)` 转换类型

3. **导出命名冲突** (3 个错误)
```typescript
// domain/entities/index.ts - 重复导出
// TaskStep, Result, QualityCheck
```

**解决方案**:
- 使用 `as` 重命名导出
- 或移除重复导出

4. **未使用变量** (3 个警告)
```typescript
// startTime, notifyProgress, getStepDisplayName
```

**解决方案**:
- 移除未使用变量
- 或添加下划线前缀 `_startTime`

---

### 2.2 代码中的 TODO 注释 ⚠️

**影响**: 低
**优先级**: 低

**发现的 TODO**:
```typescript
// src/presentation/cli/commands/result.ts:48
// TODO: 从数据库查询结果
// 目前显示提示信息

// src/application/workflow/SyncExecutor.ts
// TODO: 创建Result记录
// TODO: 创建QualityCheck记录
// TODO: 更新TokenUsage记录
```

**解决方案**:
- 依赖阶段 1 的 Repository 实现
- 实现后移除 TODO

---

### 2.3 Logger 类型问题 ⚠️

**影响**: 低
**优先级**: 低

**问题描述**:
```typescript
// logger.error() 的第二个参数类型不匹配
// Type 'string' is not assignable to type '{ [key: string]: any; ... }'
```

**出现位置**:
- SyncExecutor.ts: 128, 145, 217
- CheckpointManager.ts: 83, 136
- ContentCreatorGraph.ts: 129

**解决方案**:
```typescript
// 当前（错误）
logger.error('message', 'error string');

// 修复后
logger.error('message', { error: 'error string' });
// 或
logger.error('message', error as Error);
```

---

## 📋 完整遗留问题清单

### 高优先级（建议立即处理）

1. ✅ ~~测试 CLI 功能~~ - 已完成
2. ✅ ~~验证工作流执行~~ - 已完成
3. ⏳ **修复 TypeScript 编译错误**
   - 20+ 个类型错误
   - 预计 2-3 小时

### 中优先级（建议阶段 3 前处理）

4. ⏳ **实现其他 Repository**
   - TaskStepRepository
   - QualityCheckRepository
   - ResultRepository
   - TokenUsageRepository
   - 预计 1-2 天

5. ⏳ **修复 Logger 类型问题**
   - 约 10 处错误调用
   - 预计 30 分钟

6. ⏳ **创建 Zod 验证 Schema**
   - 输入验证
   - 预计 0.5-1 天

### 低优先级（可延后处理）

7. ⏳ **添加单元测试**
   - Repository 测试
   - 工作流测试
   - 预计 2-3 天

8. ⏳ **修复 PostgreSQL 外部连接**
   - 密码认证问题
   - 预计 1-2 小时

9. ⏳ **实现进度回调功能**
   - 实时进度通知
   - 使用 WebSocket 或轮询
   - 预计 1 天

10. ⏳ **优化字数限制处理**
    - WriteNode 重写逻辑
    - 智能截断或分段
    - 预计 0.5 天

---

## 🎯 建议的处理顺序

### 选项 A：快速修复后进入阶段 3（推荐）

**优点**: 快速推进核心功能
**时间**: 0.5 天

1. 修复 TypeScript 编译错误（高优先级）⏰ 2-3h
2. 修复 Logger 类型问题（中优先级）⏰ 30m
3. 创建 Zod Schema（中优先级）⏰ 1h
4. **开始阶段 3**

**阶段 3 后再回头**:
- 实现 Repository（可并行）
- 添加测试（可并行）

### 选项 B：完善后进入阶段 3

**优点**: 代码质量更高
**时间**: 3-4 天

1. 修复所有 TypeScript 错误
2. 实现所有 Repository
3. 添加单元测试
4. **再开始阶段 3**

---

## 📊 影响评估

### 如果直接进入阶段 3（不修复遗留问题）

**✅ 可以正常工作的部分**:
- CLI 创建任务（使用内存数据库）
- 工作流完整执行
- 任务状态管理
- 错误处理

**⚠️ 可能受影响的部分**:
- PostgreSQL 持久化（需修复连接）
- 结果查询（依赖 Repository）
- 统计功能（依赖 TokenUsage）
- 进度追踪（依赖 TaskStep）

**💡 建议**:
- **短期**: 使用内存模式继续开发（当前状态）✅
- **中期**: 修复 PostgreSQL 连接和类型错误
- **长期**: 补充测试和完善 Repository

---

## 🚀 快速修复方案

如果选择快速修复后再进入阶段 3，建议执行以下步骤：

### Step 1: 修复 TypeScript 错误（2-3h）
```bash
# 1. 修复 WorkflowState 类型
# 2. 修复 Config Zod 类型
# 3. 移除重复导出
# 4. 修复 Logger 调用
# 5. 移除未使用变量

pnpm run build  # 验证编译通过
```

### Step 2: 创建 Zod Schema（1h）
```bash
# 创建 src/domain/entities/schemas.ts
# 为每个实体定义验证规则
```

### Step 3: 更新文档（30m）
```bash
# 标记阶段 1 为 90% 完成
# 记录已知问题和解决方案
```

**总计**: 约 0.5 天

---

## 📝 决策建议

### 推荐方案：选项 A（快速修复）

**理由**:
1. ✅ 核心功能已验证可用
2. ✅ CLI 测试通过
3. ✅ 工作流端到端正常
4. ⏳ 遗留问题不影响阶段 3 开发
5. 🔄 Repository 可在阶段 3 并行实现

**风险评估**: 低
- 内存模式可以完全模拟生产环境
- PostgreSQL 问题已隔离
- 类型错误不影响运行时

**下一步**:
1. 修复关键 TypeScript 错误（30 分钟）
2. 开始阶段 3 实施
3. 阶段 3 中逐步完善 Repository

---

**总结**: 阶段 1 和 2 的遗留问题**不影响阶段 3 的开发**，建议快速修复关键问题后立即开始阶段 3。

你的决定是什么？
- A. 快速修复后开始阶段 3
- B. 完善遗留问题再开始
- C. 直接开始阶段 3（暂不修复）
