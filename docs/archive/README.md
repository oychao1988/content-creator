# 归档文档说明

> **最后更新**: 2026-02-03
>
> 本目录包含项目的历史文档，按类型组织以便查阅。

## 📁 归档目录结构

```
archive/
├── phases/              # 开发阶段文档
│   ├── phase-2/         # 阶段 2：应用层
│   │   ├── phase-2a/    # 阶段 2a：同步执行器
│   │   └── phase-2b/    # 阶段 2b：异步执行器
│   ├── phase-3/         # 阶段 3：异步任务系统
│   └── phase-4/         # 阶段 4：测试与完善
│
├── sessions/            # 开发会话总结
│   ├── session-2-summary.md
│   ├── session-3-summary.md
│   └── session-summary.md
│
├── reports/             # 历史报告
│   ├── WORKFLOW-EXTENSION-PLAN.md          # 工作流扩展计划
│   ├── WORKFLOW-EXTENSION-PROGRESS.md      # 工作流扩展进度
│   ├── workflow-extension-SUMMARY.md       # 工作流扩展总结
│   ├── workflow-extension-COMPARISON.md    # 工作流扩展对比
│   ├── workflow-extension-FUTURE-GUIDE.md  # 工作流扩展未来指南
│   ├── architecture-complete.md            # 完整架构文档（历史版本）
│   ├── claude-cli-llm-implementation-summary.md
│   ├── multi-workflow-cli-optimization.md
│   ├── test-report-image-postprocessing.md
│   ├── timeout-test-report.md
│   ├── update-summary-2026-02-01.md
│   ├── workflow-architecture-stage2.md
│   ├── workflow-architecture-stage3.md
│   ├── workflow-test-summary.md
│   └── writenode-generateimage-optimization.md
│
└── implementation/      # 实现分析文档
    └── implementation-analysis/
```

## 📚 主要归档文档

### 工作流扩展项目

| 文档 | 说明 | 完成时间 |
|------|------|----------|
| [WORKFLOW-EXTENSION-PLAN.md](./reports/WORKFLOW-EXTENSION-PLAN.md) | 工作流扩展项目计划 | - |
| [WORKFLOW-EXTENSION-PROGRESS.md](./reports/WORKFLOW-EXTENSION-PROGRESS.md) | 工作流扩展项目进度 | - |
| [workflow-extension-SUMMARY.md](./reports/workflow-extension-SUMMARY.md) | 工作流扩展项目总结 | - |
| [workflow-extension-COMPARISON.md](./reports/workflow-extension-COMPARISON.md) | 工作流扩展方案对比 | - |
| [workflow-extension-FUTURE-GUIDE.md](./reports/workflow-extension-FUTURE-GUIDE.md) | 工作流扩展未来指南 | - |

### 架构文档

| 文档 | 说明 |
|------|------|
| [architecture-complete.md](./reports/architecture-complete.md) | 完整架构文档（历史版本，139KB） |
| [workflow-architecture-stage2.md](./reports/workflow-architecture-stage2.md) | 工作流架构阶段 2 |
| [workflow-architecture-stage3.md](./reports/workflow-architecture-stage3.md) | 工作流架构阶段 3 |

### 实施总结

| 文档 | 说明 |
|------|------|
| [claude-cli-llm-implementation-summary.md](./reports/claude-cli-llm-implementation-summary.md) | Claude CLI LLM 实施总结 |
| [multi-workflow-cli-optimization.md](./reports/multi-workflow-cli-optimization.md) | 多工作流 CLI 优化 |
| [update-summary-2026-02-01.md](./reports/update-summary-2026-02-01.md) | 2026-02-01 更新总结 |

### 测试报告

| 文档 | 说明 |
|------|------|
| [test-report-image-postprocessing.md](./reports/test-report-image-postprocessing.md) | 图片后处理测试报告 |
| [timeout-test-report.md](./reports/timeout-test-report.md) | 超时测试报告 |
| [workflow-test-summary.md](./reports/workflow-test-summary.md) | 工作流测试总结 |
| [writenode-generateimage-optimization.md](./reports/writenode-generateimage-optimization.md) | WriteNode 生成图片优化 |

### 开发阶段

| 阶段 | 说明 | 目录 |
|------|------|------|
| Phase 2 | 应用层开发 | [phase-2/](./phases/phase-2/) |
| Phase 3 | 异步任务系统 | [phase-3/](./phases/phase-3/) |
| Phase 4 | 测试与完善 | [phase-4/](./phases/phase-4/) |

### 开发会话

| 文档 | 说明 |
|------|------|
| [session-2-summary.md](./sessions/session-2-summary.md) | 会话 2 总结 |
| [session-3-summary.md](./sessions/session-3-summary.md) | 会话 3 总结 |
| [session-summary.md](./sessions/session-summary.md) | 会话总结 |

## 🔍 查阅指南

### 查看项目历史
- 开发阶段文档 → [phases/](./phases/)
- 开发会话记录 → [sessions/](./sessions/)

### 查看已完成项目
- 工作流扩展项目 → [reports/WORKFLOW-EXTENSION-*.md](./reports/)
- 各类实施总结 → [reports/](./reports/)

### 查看历史测试
- 测试报告 → [reports/test-*.md](./reports/)
- 优化报告 → [reports/*optimization.md](./reports/)

## 📝 归档原则

文档归档到此目录的标准：

1. **已完成的项目** - 如工作流扩展项目
2. **过时的文档** - 被新版本替代的文档
3. **临时记录** - 会话总结、临时分析等
4. **历史版本** - 保留用于追溯的旧版本

## 🔗 相关文档

- [主文档导航](../README.md)
- [设计文档](../design/)
- [架构文档](../architecture/)

---

**注意**: 归档文档保留历史价值，不应再用于指导当前开发。请参考主文档目录获取最新信息。
