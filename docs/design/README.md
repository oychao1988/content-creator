# 设计文档说明

> **最后更新**: 2026-02-03
>
> 本目录包含功能设计文档，包括已实施和未实施的方案。

## 📁 设计文档目录

```
design/
├── README.md                                    # 设计文档说明
├── http-api-design.md                           # ✅ 已实施：HTTP RESTful API 设计
├── workflow-scaffolding-design.md               # ❌ 待实施：工作流脚手架设计
├── workflow-scaffolding-example.ts              # ❌ 示例代码
├── agent-performance-evaluation-design.md       # ❌ 待实施：性能评估设计
├── content-creator-agent-design.md              # ✅ 已实施：AI Agent 内容创作者
├── claude-cli-llm-service-design.md             # ✅ 已实施：Claude CLI LLM 服务
├── cli-unified-design.md                        # ✅ 已实施：CLI 统一多工作流
├── webhook-callback-feature.md                  # ✅ 已实施：Webhook 回调功能
└── webhook-implementation-plan.md               # ✅ 已实施：Webhook 实施计划
```

## 🚧 设计文档清单

| 文档 | 状态 | 实施时间 | 描述 |
|------|------|----------|------|
| [http-api-design.md](./http-api-design.md) | ✅ 已实施 | 2026-02-10 | HTTP RESTful API 完整设计文档 |
| [content-creator-agent-design.md](./content-creator-agent-design.md) | ✅ 已实施 | 2026-02-08 | AI Agent 内容创作者设计 |
| [webhook-callback-feature.md](./webhook-callback-feature.md) | ✅ 已实施 | 2026-02-08 | Webhook 回调功能设计 |
| [webhook-implementation-plan.md](./webhook-implementation-plan.md) | ✅ 已实施 | 2026-02-08 | Webhook 实施计划 |
| [workflow-scaffolding-design.md](./workflow-scaffolding-design.md) | ❌ 待实施 | - | 工作流脚手架工具完整设计（14-20天工作量） |
| [workflow-scaffolding-example.ts](./workflow-scaffolding-example.ts) | ❌ 示例代码 | - | 脚手架生成的代码示例 |
| [agent-performance-evaluation-design.md](./agent-performance-evaluation-design.md) | ❌ 待实施 | - | Agent 性能评估系统设计 |
| [cli-unified-design.md](./cli-unified-design.md) | ✅ 已实施 | 2026-02-01 | CLI 统一多工作流设计（WorkflowParameterMapper） |
| [claude-cli-llm-service-design.md](./claude-cli-llm-service-design.md) | ✅ 已实施 | 2026-01-28 | Claude CLI LLM 服务设计（ClaudeCLIService） |

> 💡 **提示**: ✅ = 已实施 | ❌ = 待实施

## ✅ 已实施功能详情

### HTTP RESTful API 设计 (2026-02-10)

**实施文件**:
- `src/presentation/api/app.ts`
- `src/presentation/api/server.ts`
- `src/controllers/`
- `src/routes/`
- `src/middleware/`
- `src/validators/`
- `src/dto/`

**功能特性**:
- 完整的 RESTful API 接口
- 任务管理（创建、查询、重试、取消）
- 工作流管理
- 健康检查和监控端点
- Zod 参数验证
- 统一错误处理
- Sentry 错误追踪
- Webhook 回调支持

**启动方式**:
```bash
# 启动 API 服务器
pnpm run api

# 或使用 CLI
pnpm run cli api

# 开发模式（热重载）
pnpm run api:dev
```

**可用端点**:
- `GET /health` - 健康检查
- `GET /api/tasks` - 列出任务
- `POST /api/tasks` - 创建任务
- `GET /api/workflows` - 列出工作流
- 详见 [HTTP API 设计文档](./http-api-design.md)

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
