# Content Creator 文档导航

> **文档系统版本**: 2.1
> **最后更新**: 2026-02-03 (新增 ReAct Agent 使用指南)
> **维护者**: Content Creator Team

欢迎来到 Content Creator 项目文档中心！本文档采用**分类管理 + 状态跟踪 + 生命周期管理**体系。

---

## 📚 快速导航

### 新手入门
- [🚀 快速开始指南](./guides/quick-start.md) - 5 分钟上手使用 Content Creator
- [📖 用户操作手册](./guides/user-guide.md) - 完整的用户使用指南

### 核心架构
- [🏗️ 工作流架构](./architecture/workflow-architecture.md) - LangGraph 工作流设计详解
- [🔌 工作流扩展架构](./architecture/workflow-extension-design.md) - Workflow 可扩展架构设计
- [✅ 质量检查架构](./architecture/quality-check-architecture.md) - 质量检查系统设计

### 使用指南
- [🤖 ReAct Agent 工作流指南](./guides/content-creator-agent-guide.md) - Agent 内容创作使用说明 **NEW**
- [🌐 翻译工作流指南](./guides/translation-workflow-guide.md) - 翻译工作流使用说明
- [📋 工作流适配器使用](./guides/workflow-adapter-usage.md) - 工作流适配器教程
- [🔧 工作流扩展指南](./guides/workflow-extension-guide.md) - 如何扩展新工作流
- [🖼️ 图片下载功能](./guides/image-download-feature.md) - 图片下载功能说明
- [💾 图片后处理存储](./guides/image-postprocessing-local-storage.md) - 图片本地存储说明

### 技术参考
- [⚡ CLI 命令参考](./references/cli-reference.md) - CLI 命令完整参考
- [📦 BullMQ 快速参考](./references/bullmq-quick-reference.md) - 任务队列管理
- [🔍 LLM 测试指南](./references/llm-testing-guide.md) - LLM 服务测试
- [💾 存储机制说明](./references/storage-guide.md) - PostgreSQL 数据存储
- [📊 监控优化指南](./references/monitoring-optimization-guide.md) - 系统监控
- [🚀 性能优化指南](./references/performance-optimization-guide.md) - 性能调优

---

## 🚧 设计文档 (design/)

功能设计和方案文档（包括已实施和未实施）：

| 文档 | 状态 | 实施时间 | 描述 |
|------|------|----------|------|
| [workflow-scaffolding-design.md](./design/workflow-scaffolding-design.md) | ❌ 待实施 | - | 工作流脚手架工具（14-20天） |
| [workflow-scaffolding-example.ts](./design/workflow-scaffolding-example.ts) | ❌ 示例代码 | - | 脚手架代码示例 |
| [agent-performance-evaluation-design.md](./design/agent-performance-evaluation-design.md) | ❌ 待实施 | - | Agent 性能评估系统 |
| [content-creator-agent-design.md](./design/content-creator-agent-design.md) | ✅ 已实施 | 2026-02-03 | **ReAct Agent 工作流设计**（~5天） |
| [cli-unified-design.md](./design/cli-unified-design.md) | ✅ 已实施 | 2026-02-01 | CLI 统一多工作流设计 |
| [claude-cli-llm-service-design.md](./design/claude-cli-llm-service-design.md) | ✅ 已实施 | 2026-01-28 | Claude CLI LLM 服务设计 |

> 💡 **提示**: ✅ = 已实施 | ❌ = 待实施 | 🔄 = 进行中

### 已实施功能详情

**ReAct Agent 工作流** (2026-02-03)
- 实现文件:
  - `src/domain/workflow/ContentCreatorAgentWorkflow.ts` - Agent 工作流主文件
  - `src/domain/workflow/tools/` - LangChain Tools（SearchTool, WriteTool, ImageGenerationTool）
- 功能: 基于 LangGraph ReAct Agent 的智能内容创作，LLM 动态决策工具调用
- 使用: `pnpm run cli create --type content-creator-agent --topic "主题" --requirements "要求"`

**CLI 统一多工作流** (2026-02-01)
- 实现文件: `src/presentation/cli/utils/WorkflowParameterMapper.ts`
- 功能: 动态参数映射、自动验证、统一 CLI 入口
- 使用: `pnpm run cli create --type <workflow> [params]`

**Claude CLI LLM 服务** (2026-01-28)
- 实现文件: `src/services/llm/ClaudeCLIService.ts`
- 功能: 基于 Claude CLI 的 LLM 服务实现、流式响应支持
- 配置: 通过 `LLM_SERVICE_TYPE=claude-cli` 启用

---

## 🏗️ 架构文档 (architecture/)

系统架构和设计文档：

| 文档 | 描述 |
|------|------|
| [workflow-architecture.md](./architecture/workflow-architecture.md) | LangGraph 工作流详解 |
| [workflow-extension-design.md](./architecture/workflow-extension-design.md) | 多工作流插件化架构（已实施） |
| [workflow-diagram.md](./architecture/workflow-diagram.md) | 工作流图示说明 |
| [quality-check-architecture.md](./architecture/quality-check-architecture.md) | 质量检查系统设计 |

---

## 📖 使用指南 (guides/)

面向用户的操作指南和教程：

| 文档 | 描述 |
|------|------|
| [quick-start.md](./guides/quick-start.md) | 5分钟快速上手 |
| [user-guide.md](./guides/user-guide.md) | 完整用户操作手册 |
| [translation-workflow-guide.md](./guides/translation-workflow-guide.md) | 翻译工作流详细使用说明 |
| [workflow-adapter-usage.md](./guides/workflow-adapter-usage.md) | 工作流适配器使用指南 |
| [workflow-extension-guide.md](./guides/workflow-extension-guide.md) | 工作流扩展指南 |
| [image-download-feature.md](./guides/image-download-feature.md) | 图片下载功能说明 |
| [image-postprocessing-local-storage.md](./guides/image-postprocessing-local-storage.md) | 图片后处理本地存储 |

---

## 🔧 技术参考 (references/)

技术参考和最佳实践：

| 文档 | 描述 |
|------|------|
| [cli-reference.md](./references/cli-reference.md) | CLI 命令完整参考 |
| [bullmq-quick-reference.md](./references/bullmq-quick-reference.md) | BullMQ 任务队列快速入门 |
| [llm-testing-guide.md](./references/llm-testing-guide.md) | LLM 服务测试指南 |
| [storage-guide.md](./references/storage-guide.md) | PostgreSQL 数据存储设计 |
| [monitoring-optimization-guide.md](./references/monitoring-optimization-guide.md) | 系统监控和优化 |
| [performance-optimization-guide.md](./references/performance-optimization-guide.md) | 应用性能调优指南 |

---

## 💻 开发相关 (development/)

开发计划和实施方案：

| 文档 | 类型 | 状态 |
|------|------|------|
| [database-refactoring-PLAN.md](./development/database-refactoring-PLAN.md) | 计划 | 部分完成 |
| [database-refactoring-SUMMARY.md](./development/database-refactoring-SUMMARY.md) | 总结 | 已完成 |
| [test-implementation-PLAN.md](./development/test-implementation-PLAN.md) | 计划 | 待实施 |
| [test-implementation-SUMMARY.md](./development/test-implementation-SUMMARY.md) | 总结 | 待定 |

---

## 📊 项目报告 (reports/)

项目进度和完成报告：

| 文档 | 描述 |
|------|------|
| [PROJECT-COMPLETION-REPORT.md](./reports/PROJECT-COMPLETION-REPORT.md) | 项目整体完成报告 |
| [STAGE-4-COMPLETION-REPORT.md](./reports/STAGE-4-COMPLETION-REPORT.md) | 阶段4完成报告 |
| [STAGE6-COMPLETION-REPORT.md](./reports/STAGE6-COMPLETION-REPORT.md) | 阶段6完成报告 |
| [TEST-FIX-REPORT.md](./reports/TEST-FIX-REPORT.md) | 测试修复报告 |

---

## 📦 归档文档 (archive/)

历史文档，按类型组织：

### 目录结构

```
archive/
├── phases/            # 开发阶段文档
│   ├── phase-2/       # 阶段 2：应用层
│   ├── phase-3/       # 阶段 3：异步任务系统
│   └── phase-4/       # 阶段 4：测试与完善
├── sessions/          # 开发会话总结
│   ├── session-2-summary.md
│   ├── session-3-summary.md
│   └── session-summary.md
├── reports/           # 历史报告
│   ├── WORKFLOW-EXTENSION-PLAN.md         # 工作流扩展计划
│   ├── WORKFLOW-EXTENSION-PROGRESS.md     # 工作流扩展进度
│   ├── workflow-extension-SUMMARY.md      # 工作流扩展总结
│   ├── workflow-extension-COMPARISON.md   # 工作流扩展对比
│   ├── workflow-extension-FUTURE-GUIDE.md # 工作流扩展未来指南
│   ├── architecture-complete.md           # 完整架构文档（历史版本）
│   └── [其他历史报告]
└── implementation/    # 实现分析文档
    └── implementation-analysis/
```

### 重要历史文档

| 文档 | 说明 |
|------|------|
| [WORKFLOW-EXTENSION-PLAN.md](./archive/reports/WORKFLOW-EXTENSION-PLAN.md) | 工作流扩展项目计划 |
| [WORKFLOW-EXTENSION-PROGRESS.md](./archive/reports/WORKFLOW-EXTENSION-PROGRESS.md) | 工作流扩展项目进度 |
| [workflow-extension-SUMMARY.md](./archive/reports/workflow-extension-SUMMARY.md) | 工作流扩展项目总结 |
| [workflow-extension-COMPARISON.md](./archive/reports/workflow-extension-COMPARISON.md) | 工作流扩展方案对比 |
| [workflow-extension-FUTURE-GUIDE.md](./archive/reports/workflow-extension-FUTURE-GUIDE.md) | 工作流扩展未来指南 |

---

## 📂 文档结构

```
docs/
├── README.md                          # 📍 本文档
│
├── design/                            # 🚧 设计文档（含已实施和未实施）
│   ├── README.md                      # 设计文档说明
│   ├── workflow-scaffolding-design.md # ❌ 待实施
│   ├── workflow-scaffolding-example.ts# ❌ 示例代码
│   ├── agent-performance-evaluation-design.md # ❌ 待实施
│   ├── claude-cli-llm-service-design.md # ✅ 已实施
│   └── cli-unified-design.md          # ✅ 已实施
│
├── guides/                            # 📖 使用指南
│   ├── quick-start.md
│   ├── user-guide.md
│   ├── translation-workflow-guide.md
│   ├── workflow-adapter-usage.md
│   ├── workflow-extension-guide.md
│   ├── image-download-feature.md
│   └── image-postprocessing-local-storage.md
│
├── architecture/                      # 🏗️ 架构文档
│   ├── workflow-architecture.md
│   ├── workflow-extension-design.md
│   ├── workflow-diagram.md
│   └── quality-check-architecture.md
│
├── development/                       # 💻 开发相关
│   ├── database-refactoring-PLAN.md
│   ├── database-refactoring-SUMMARY.md
│   ├── test-implementation-PLAN.md
│   └── test-implementation-SUMMARY.md
│
├── references/                        # 🔧 技术参考
│   ├── cli-reference.md
│   ├── bullmq-quick-reference.md
│   ├── llm-testing-guide.md
│   ├── storage-guide.md
│   ├── monitoring-optimization-guide.md
│   └── performance-optimization-guide.md
│
├── reports/                           # 📊 项目报告
│   ├── PROJECT-COMPLETION-REPORT.md
│   ├── STAGE-4-COMPLETION-REPORT.md
│   ├── STAGE6-COMPLETION-REPORT.md
│   └── TEST-FIX-REPORT.md
│
└── archive/                           # 📦 归档文档
    ├── phases/                        # 阶段文档
    ├── sessions/                      # 会话总结
    ├── reports/                       # 历史报告
    │   ├── WORKFLOW-EXTENSION-*.md    # 工作流扩展相关
    │   ├── architecture-complete.md   # 完整架构文档（历史）
    │   └── [其他历史报告]
    └── implementation/                # 实现分析文档
```

---

## 🔍 快速查找

**我想...**
- 快速上手 → [快速开始指南](./guides/quick-start.md)
- 了解架构 → [工作流架构](./architecture/workflow-architecture.md)
- 使用系统 → [用户操作手册](./guides/user-guide.md)
- 理解工作流 → [工作流架构](./architecture/workflow-architecture.md)
- 扩展工作流 → [工作流扩展架构设计](./architecture/workflow-extension-design.md) 或 [工作流扩展指南](./guides/workflow-extension-guide.md)
- 使用翻译工作流 → [翻译工作流使用指南](./guides/translation-workflow-guide.md)
- 了解质检 → [质量检查架构](./architecture/quality-check-architecture.md)
- 查看未来计划 → [设计文档目录](./design/)
- CLI 命令参考 → [CLI 参考](./references/cli-reference.md)
- 队列管理 → [BullMQ 参考](./references/bullmq-quick-reference.md)
- 性能优化 → [性能优化指南](./references/performance-optimization-guide.md)
- 查看历史文档 → [归档目录](./archive/)

---

## 📝 文档规范

### 文档分类原则

1. **design/** - 功能设计和方案（已实施 + 未实施）
2. **guides/** - 面向用户的操作指南
3. **architecture/** - 系统架构和技术设计
4. **development/** - 开发计划和总结
5. **references/** - 技术参考和最佳实践
6. **reports/** - 项目进度和完成报告
7. **archive/** - 历史文档和临时记录

### 状态标记系统

**双重标记机制**：
1. **表级标记**（README.md 中）- 使用 ✅/❌ 符号
2. **文档内元数据** - 使用版本信息块

**状态符号**：
- ✅ 已实施
- ❌ 待实施
- 🔄 进行中（可选）

### 文档命名规范

| 文档类型 | 命名格式 | 示例 |
|---------|---------|------|
| 设计文档 | `<功能名>-design.md` | `workflow-scaffolding-design.md` |
| 代码示例 | `<功能名>-example.<ext>` | `workflow-scaffolding-example.ts` |
| 使用指南 | `<功能名>-guide.md` | `translation-workflow-guide.md` |
| 快速开始 | `quick-start.md` | 固定命名 |
| 用户手册 | `user-guide.md` | 固定命名 |
| 计划文档 | `<功能名>-PLAN.md` | `database-refactoring-PLAN.md` |
| 总结文档 | `<功能名>-SUMMARY.md` | `database-refactoring-SUMMARY.md` |
| 完成报告 | `<阶段>-COMPLETION-REPORT.md` | `STAGE-4-COMPLETION-REPORT.md` |

### 文档生命周期

```
设计阶段 → 实施阶段 → 完成归档
   ↓           ↓           ↓
design/  → 对应目录  → archive/
(❌待实施)  (✅已实施)   (历史记录)
```

---

## 🎖️ 相关链接

- [项目主 README](../README.md)
- [CLAUDE.md](../CLAUDE.md) - 开发者指南
- [测试文档](../tests/README.md)

---

## 📞 问题反馈

如果发现文档问题或需要补充内容，请在项目仓库提交 Issue。
