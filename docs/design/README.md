# 设计文档说明

> **最后更新**: 2026-02-03
>
> 本目录包含功能设计文档，包括已实施和未实施的方案。

## 📁 设计文档目录

```
design/
├── README.md                                    # 设计文档说明
├── workflow-scaffolding-design.md               # ❌ 待实施：工作流脚手架设计
├── workflow-scaffolding-example.ts              # ❌ 示例代码
├── agent-performance-evaluation-design.md       # ❌ 待实施：性能评估设计
├── claude-cli-llm-service-design.md             # ✅ 已实施：Claude CLI LLM 服务
└── cli-unified-design.md                        # ✅ 已实施：CLI 统一多工作流
```

## 🚧 设计文档清单

| 文档 | 状态 | 实施时间 | 描述 |
|------|------|----------|------|
| [workflow-scaffolding-design.md](./workflow-scaffolding-design.md) | ❌ 待实施 | - | 工作流脚手架工具完整设计（14-20天工作量） |
| [workflow-scaffolding-example.ts](./workflow-scaffolding-example.ts) | ❌ 示例代码 | - | 脚手架生成的代码示例 |
| [agent-performance-evaluation-design.md](./agent-performance-evaluation-design.md) | ❌ 待实施 | - | Agent 性能评估系统设计 |
| [cli-unified-design.md](./cli-unified-design.md) | ✅ 已实施 | 2026-02-01 | CLI 统一多工作流设计（WorkflowParameterMapper） |
| [claude-cli-llm-service-design.md](./claude-cli-llm-service-design.md) | ✅ 已实施 | 2026-01-28 | Claude CLI LLM 服务设计（ClaudeCLIService） |

> 💡 **提示**: ✅ = 已实施 | ❌ = 待实施

## ✅ 已实施功能详情

### CLI 统一多工作流设计 (2026-02-01)

**实施文件**: `src/presentation/cli/utils/WorkflowParameterMapper.ts`

**功能特性**:
- 动态参数映射：根据工作流类型自动映射 CLI 参数到状态
- 自动参数验证：使用 Zod schema 验证参数
- 统一 CLI 入口：`pnpm run cli create --type <workflow> [params]`

**使用示例**:
```bash
# 内容创作工作流
pnpm run cli create --type content-creator --topic "AI 技术" --requirements "写一篇文章"

# 翻译工作流
pnpm run cli create --type translation --sourceText "Hello" --sourceLanguage "en" --targetLanguage "zh"
```

### Claude CLI LLM 服务设计 (2026-01-28)

**实施文件**: `src/services/llm/ClaudeCLIService.ts`

**功能特性**:
- 基于 Claude CLI 的 LLM 服务实现
- 流式响应支持
- 完整的 ILLMService 接口实现

**配置方式**:
```bash
# 通过环境变量启用
export LLM_SERVICE_TYPE=claude-cli
```

## 📋 设计文档规范

### 新增设计文档时

1. **文档命名**: 使用 `<功能名>-design.md` 格式
2. **添加状态标记**: 在本 README 的清单中添加状态（❌ 待实施）
3. **实施后更新**: 完成实施后更新状态为 ✅，并添加实施时间和详情

### 文档模板

```markdown
# <功能名称> 设计

> **版本**: 1.0.0
> **创建日期**: YYYY-MM-DD
> **状态**: 设计阶段，待实施

## 概述

简要描述功能设计的目的和范围。

## 设计目标

列出主要的设计目标。

## 技术方案

详细描述技术实现方案。

## 实施计划

分阶段的实施步骤。

## 验收标准

明确的功能完成标准。
```

## 🔗 相关文档

- [主文档导航](../README.md)
- [架构文档](../architecture/)
- [开发计划](../development/)

---

**注意**: 当功能实施完成后，建议保留设计文档在本目录中以便追溯，同时在主 README 中更新实施状态。
