# CLI 指令更新计划文档

**创建时间**: 2026-01-24
**目标**: 统一并更新项目中所有文档和代码中提到的 CLI 指令使用方式

---

## 📋 任务概述

当前项目中存在多个 CLI 指令的使用方式，包括：
- 主 CLI（创建任务、查询状态、获取结果、取消任务）
- Worker CLI（启动任务处理 Worker）
- Monitor CLI（启动监控面板）
- Scheduler CLI（启动定时调度器）

需要在文档和代码示例中统一 CLI 指令的调用方式。

---

## 🔍 当前状态分析

### 1. package.json 中定义的 scripts

**正确的 CLI 指令**（基于 package.json:53-61）:

```json
{
  "cli": "tsx src/presentation/cli/index.ts",
  "cli:create": "tsx src/presentation/cli/index.ts create",
  "cli:status": "tsx src/presentation/cli/index.ts status",
  "cli:result": "tsx src/presentation/cli/index.ts result",
  "cli:cancel": "tsx src/presentation/cli/index.ts cancel",
  "worker": "tsx src/presentation/worker-cli.ts start",
  "worker:dev": "tsx watch src/presentation/worker-cli.ts start",
  "monitor": "tsx src/presentation/monitor-cli.ts start",
  "scheduler": "tsx src/presentation/scheduler-cli.ts"
}
```

### 2. 各 CLI 的功能

#### 主 CLI（content-creator）
- **入口**: `src/presentation/cli/index.ts`
- **命令**:
  - `create` - 创建内容创作任务
  - `status` - 查询任务状态
  - `result` - 获取任务结果
  - `cancel` - 取消任务执行

#### Worker CLI
- **入口**: `src/presentation/worker-cli.ts`
- **命令**: `start` - 启动 Worker 处理任务
- **参数**:
  - `-w, --worker-id <id>` - Worker ID
  - `-c, --concurrency <number>` - 并发数（默认 2）

#### Monitor CLI
- **入口**: `src/presentation/monitor-cli.ts`
- **命令**: `start` - 启动监控面板
- **参数**:
  - `-p, --port <number>` - 端口号（默认 3000）

#### Scheduler CLI
- **入口**: `src/presentation/scheduler-cli.ts`
- **功能**: 启动定时调度器

---

## 📝 需要更新的文档列表

### 阶段 1: 更新 user-guide.md

**文件路径**: `docs/user-guide.md`

**需要更新的内容**:

#### 第 68 行 - 创建任务示例
```bash
# 当前（错误）
pnpm run cli:create

# 应该改为（正确）
pnpm run cli create --topic "人工智能的未来" --requirements "写一篇关于 AI 未来发展的文章"
```

#### 第 297-305 行 - CLI 使用方式
```bash
# 当前（错误）
pnpm run cli:create \
  --topic "文章主题" \
  --requirements "创作要求"

# 应该改为（正确）
pnpm run cli create \
  --topic "文章主题" \
  --requirements "创作要求"
```

#### 第 327-336 行 - 示例 1
```bash
# 当前（错误）
pnpm run cli:create

# 应该改为（正确）
pnpm run cli create
```

#### 第 342-349 行 - 示例 2
```bash
# 当前（错误）
pnpm run cli:create

# 应该改为（正确）
pnpm run cli create
```

#### 第 404-413 行 - create 命令示例
```bash
# 当前（错误）
pnpm run cli:create [options]

# 应该改为（正确）
pnpm run cli create [options]
```

#### 第 420-422 行 - status 命令
```bash
# 当前（错误）
pnpm run cli:status <task-id>

# 应该改为（正确）
pnpm run cli status --task-id <task-id>
```

#### 第 426-428 行 - cancel 命令
```bash
# 当前（错误）
pnpm run cli:cancel <task-id>

# 应该改为（正确）
pnpm run cli cancel --task-id <task-id>
```

#### 第 432-437 行 - monitor 命令（这个是正确的，无需修改）
```bash
# 这个是正确的
pnpm run monitor
```

### 阶段 2: 更新 implementation-guide.md

**文件路径**: `dev/active/implementation-guide.md`

**需要更新的内容**:

#### 第 699-710 行 - CLI 使用示例
```bash
# 当前（错误）
pnpm run cli create -t "AI技术发展" -r "写一篇技术文章" --sync

# 应该改为（正确）
pnpm run cli create -t "AI技术发展" -r "写一篇技术文章" --mode sync
```

#### 第 703-710 行 - 所有命令示例
需要统一使用 `pnpm run cli <command>` 的格式

### 阶段 3: 更新 CLI 命令文件

**文件**: `src/presentation/cli/commands/create.ts`

**需要更新的内容**（第 156-161 行）:

```bash
# 当前输出提示
pnpm cli result --task-id ${taskId}
pnpm run worker
pnpm cli worker:status

# 应该改为
pnpm run cli result --task-id ${taskId}
pnpm run worker
# （移除不存在的 worker:status 命令）
```

---

## 🎯 更新策略

### 正确的 CLI 调用方式

#### 主 CLI 命令
```bash
# 方式 1: 使用 npm script（推荐）
pnpm run cli create [options]
pnpm run cli status --task-id <id>
pnpm run cli result --task-id <id>
pnpm run cli cancel --task-id <id>

# 方式 2: 直接调用 tsx
tsx src/presentation/cli/index.ts create [options]
tsx src/presentation/cli/index.ts status --task-id <id>
```

#### Worker 命令
```bash
# 启动 Worker
pnpm run worker

# 或指定参数
tsx src/presentation/worker-cli.ts start --worker-id worker-1 --concurrency 4
```

#### Monitor 命令
```bash
# 启动监控面板
pnpm run monitor

# 或指定端口
tsx src/presentation/monitor-cli.ts start --port 3000
```

---

## 📋 执行检查清单

### 阶段 1: 文档更新
- [ ] 更新 `docs/user-guide.md` 中所有 CLI 示例
- [ ] 更新 `dev/active/implementation-guide.md` 中 CLI 示例
- [ ] 更新 `docs/quick-start.md` 中 CLI 示例（如果有）
- [ ] 检查其他文档中是否有 CLI 示例需要更新

### 阶段 2: 代码更新
- [ ] 更新 `src/presentation/cli/commands/create.ts` 中的提示信息
- [ ] 检查其他命令文件中是否有类似的提示需要更新

### 阶段 3: 测试验证
- [ ] 测试所有更新的 CLI 命令是否正常工作
- [ ] 验证文档中的示例是否准确
- [ ] 确保没有遗漏的 CLI 调用方式

### 阶段 4: 创建 CLI 使用参考
- [ ] 创建专门的 CLI 使用文档
- [ ] 列出所有可用的 CLI 命令和参数
- [ ] 提供常用使用场景的示例

---

## 📊 影响范围

### 受影响的文件
1. `docs/user-guide.md` - 用户手册（多处需要更新）
2. `dev/active/implementation-guide.md` - 实施指南（CLI 示例）
3. `src/presentation/cli/commands/create.ts` - 创建命令的输出提示

### 不需要更新的部分
- `package.json` 中的 scripts 定义（已经是正确的）
- CLI 源代码实现（功能正确，只是文档和提示需要更新）
- `docs/quick-start.md`（已检查，基本正确）

---

## ✅ 验收标准

1. **文档一致性**: 所有文档中的 CLI 示例使用统一的格式
2. **准确性**: 所有示例命令都能正确执行
3. **完整性**: 所有 CLI 命令都有完整的使用说明
4. **易用性**: 用户能够通过文档轻松找到正确的 CLI 使用方式

---

## 🚀 执行计划

### 步骤 1: 更新 user-guide.md
更新所有 CLI 指令示例，使用 `pnpm run cli <command>` 格式

### 步骤 2: 更新 implementation-guide.md
统一 CLI 调用方式，确保与实际使用一致

### 步骤 3: 更新 create.ts 提示信息
修正命令提示，移除不存在的命令

### 步骤 4: 验证更新
运行所有示例命令，确保可以正常工作

### 步骤 5: 创建 CLI 参考文档
创建一个独立的 CLI 使用说明文档

---

**状态**: 📝 计划中
**下一步**: 开始执行文档更新
