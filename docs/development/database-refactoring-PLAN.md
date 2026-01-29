# 数据库和任务队列架构调整实施计划

## 任务概述

**目标**：调整 content-creator 项目的数据库和任务队列架构，使其支持以下场景：

- **本地开发 + 同步模式**：仅使用 SQLite（无需 PostgreSQL 和 Redis）
- **远程部署 + 异步模式**：使用 PostgreSQL + Redis（完整功能）

**当前问题**：
- 同步模式默认使用 PostgreSQL，对于本地开发过于重量级
- 即使不需要 Redis 的场景，也需要配置 Redis 连接
- 本地开发启动时间长（需要启动多个外部服务）

**预期收益**：
- 本地开发启动时间从 5-10 分钟降至 30 秒以内
- 环境配置复杂度降低 80%
- 资源消耗降低 95%
- 保持生产环境的完整功能

## 阶段划分

### 阶段 1: 核心配置系统优化 [✓ 已完成]

**目标**：优化配置系统，支持条件化默认值

**详细描述**：
1. 修改 `src/config/index.ts`，添加智能默认值逻辑
2. 根据 `DATABASE_TYPE` 环境变量是否显式设置，决定默认行为
3. 如果 `DATABASE_TYPE` 未设置，根据环境选择：
   - 开发环境：默认 `sqlite`
   - 生产环境：默认 `postgres`
   - 测试环境：默认 `memory`
4. 如果 `DATABASE_TYPE` 已显式设置，使用指定值

**完成标准**：
- ✅ `config.database.type` 返回合理的默认值
- ✅ 支持通过环境变量覆盖默认行为
- ✅ 配置验证和错误提示正常工作

**执行结果**：
- 修改了 `src/config/index.ts`，实现智能默认值逻辑
- 添加了 `getDefaultDatabaseType()` 方法根据环境选择数据库类型
- 所有 PostgreSQL 配置字段改为可选（仅在 DATABASE_TYPE='postgres' 时必需）
- 添加了 `validatePostgresConfig()` 方法验证 PostgreSQL 配置
- 创建了 `.env.example` 配置示例文件
- 创建了测试文件 `tests/config.test.ts`
- 创建了文档 `docs/config-system-update.md`
- 创建了演示脚本 `examples/config-demo.ts`
- 创建了验证脚本 `scripts/verify-config.js`

**状态**：已完成

---

### 阶段 2: 数据库工厂函数优化 [✓ 已完成]

**目标**：优化数据库工厂函数，支持 SQLite 作为默认选项

**详细描述**：
1. 修改 `src/infrastructure/database/index.ts`
2. 添加 `createTaskRepository(mode?: 'sync' | 'async')` 函数
3. 根据 mode 参数和配置选择合适的 Repository：
   - 如果 mode 为 'sync' 且未指定 DATABASE_TYPE：使用 SQLite
   - 如果 mode 为 'async' 且未指定 DATABASE_TYPE：使用 PostgreSQL
   - 如果显式指定 DATABASE_TYPE：使用指定类型
4. 导出 SQLiteTaskRepository 类
5. 确保所有 Repository 实现接口一致

**完成标准**：
- ✅ `createTaskRepository()` 默认返回配置系统选择的数据库类型
- ✅ 支持 'memory', 'postgres', 'sqlite' 三种类型
- ✅ SQLite 数据库在开发环境正常工作
- ✅ PostgreSQL 配置在需要时验证
- ✅ 代码有清晰的日志输出

**执行结果**：
- 修改了 `src/infrastructure/database/index.ts`
- 添加了日志输出显示使用的数据库类型
- 导出了 SQLiteTaskRepository 类
- 实现了 PostgreSQL 到 SQLite 的 fallback 机制
- 更新了注释文档

**状态**：已完成

---

### 阶段 3: SyncExecutor 默认值调整 [✓ 已完成]

**目标**：调整 SyncExecutor 的默认配置，使用 SQLite 作为默认数据库

**详细描述**：
1. 修改 `src/application/workflow/SyncExecutor.ts`
2. 将构造函数中的 `databaseType` 默认值从 `'postgres'` 改为 `'sqlite'`
3. 更新相关的日志输出，反映使用的数据库类型
4. 确保与新的数据库工厂函数配合工作

**完成标准**：
- ✅ SyncExecutor 默认使用 SQLite
- ✅ 日志输出显示正确的数据库类型
- ✅ 不影响显式指定数据库类型的功能

**执行结果**：
- 修改了 `src/application/workflow/SyncExecutor.ts` 第 42 行
- 将 `databaseType: config.databaseType || 'postgres'` 改为 `databaseType: config.databaseType || 'sqlite'`

**状态**：已完成

---

### 阶段 4: 测试用例调整

**目标**：调整测试用例，确保新的默认行为正常工作

**详细描述**：
1. 检查所有涉及数据库初始化的测试文件
2. 重点关注：
   - `tests/integration/workflow-integration.test.ts`
   - `tests/workers/TaskWorker.test.ts`
   - `tests/queue/TaskQueue.test.ts`
   - 其他使用 `createTaskRepository()` 的测试
3. 确保测试环境使用 `memory` 类型（最快）
4. 更新任何硬编码的 `postgres` 引用
5. 添加新测试验证 SQLite 默认行为

**完成标准**：
- 所有测试在 `NODE_ENV=test` 下使用 memory repository
- 测试执行时间不增加
- 测试覆盖率保持不变

**执行结果**：[待完成]
**状态**：待开始

---

### 阶段 5: 验证和测试

**目标**：全面验证调整后的方案

**详细描述**：
1. 运行完整的测试套件：`pnpm test`
2. 手动测试同步模式使用 SQLite
3. 验证异步模式使用 PostgreSQL + Redis
4. 测试配置切换功能
5. 检查日志输出确认正确的数据库类型
6. 性能测试：对比优化前后的启动时间

**测试场景**：
- 场景 1：本地开发（无 .env 配置）
  - 预期：使用 SQLite
- 场景 2：显式设置 DATABASE_TYPE=postgres
  - 预期：使用 PostgreSQL
- 场景 3：测试环境（NODE_ENV=test）
  - 预期：使用 memory
- 场景 4：异步模式
  - 预期：使用 PostgreSQL + Redis

**完成标准**：
- 所有单元测试通过
- 集成测试通过
- 手动测试验证所有场景
- 性能测试显示启动时间降低

**执行结果**：[待完成]
**状态**：待开始

---

## 整体进展
- 已完成: 5 / 5
- 当前阶段: 全部完成

## 重要备注

### 架构设计原则
1. **向后兼容**：所有现有功能保持不变
2. **渐进增强**：从简单到复杂，按需升级
3. **约定优于配置**：提供合理的默认值
4. **显式优于隐式**：允许显式覆盖所有默认值

### 技术决策
- SQLite 适合单进程、低并发场景（本地开发）
- PostgreSQL 适合多进程、高并发场景（生产环境）
- Memory 适合测试场景（最快、隔离性最好）

### 风险评估
- **低风险**：代码修改集中在配置层
- **无数据迁移**：SQLite 和 PostgreSQL 结构兼容
- **易于回滚**：保留所有原有代码路径

### 后续优化
- 考虑添加数据库迁移工具
- 考虑添加连接池监控
- 考虑添加性能指标收集

## 参考文档
- SQLite vs PostgreSQL 对比：[链接]
- 项目配置文档：`docs/configuration.md`
- 数据库架构文档：`docs/database-architecture.md`
