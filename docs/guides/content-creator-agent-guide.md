# ReAct Agent 内容创作工作流使用指南

> **版本**: 1.0.0
> **创建日期**: 2026-02-03
> **工作流类型**: content-creator-agent
> **状态**: ✅ 已实施

---

## 概述

ReAct Agent 工作流是一个基于 LangGraph ReAct Agent 模式的智能内容创作系统。与传统的工作流不同，Agent 使用 LLM 动态决策工具调用顺序，提供更灵活和智能的内容生成能力。

### 核心特点

- **🤖 智能决策**: LLM 根据任务需求动态选择工具
- **🔄 自动推理**: Agent 可以分析、规划、执行、反思
- **🎯 灵活编排**: 不受固定的节点链路限制
- **📊 透明过程**: 记录 Agent 的思考过程和工具调用

---

## 与传统工作流对比

| 特性 | StateGraph (传统) | ReAct Agent (新) |
|------|-------------------|------------------|
| **执行模式** | 预定义线性流程 | LLM 动态决策 |
| **工具选择** | 固定节点顺序 | 智能工具选择 |
| **灵活性** | 低 - 流程固定 | 高 - Agent 自主决策 |
| **可预测性** | 高 - 步骤明确 | 中 - 依赖 LLM 判断 |
| **LLM 调用** | 固定次数 | 动态次数 |
| **适用场景** | 标准化流程 | 复杂决策任务 |

---

## 快速开始

### 基础用法

```bash
pnpm run cli create --type content-creator-agent \
  --topic "量子计算原理" \
  --requirements "写一篇 1500 字的科普文章"
```

### 完整参数示例

```bash
pnpm run cli create --type content-creator-agent \
  --topic "React Server Components" \
  --requirements "分析技术架构、最佳实践和代码示例" \
  --target-audience "前端开发者" \
  --tone "专业深入" \
  --image-size "1920x1080" \
  --mode sync
```

---

## 参数说明

### 必需参数

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `--topic` | string | 文章主题 | `"量子计算原理"` |
| `--requirements` | string | 创作要求 | `"写一篇 1500 字的科普文章，面向普通读者"` |

### 可选参数

| 参数 | 类型 | 默认值 | 说明 | 示例 |
|------|------|--------|------|------|
| `--target-audience` | string | 无 | 目标受众 | `"普通读者"`, `"技术人员"` |
| `--tone` | string | 无 | 语气风格 | `"科普友好"`, `"专业深入"` |
| `--image-size` | string | `1024x1024` | 图片尺寸 | `"1920x1080"`, `"1080x1080"` |
| `--mode` | string | `sync` | 执行模式 | `sync`, `async` |

---

## Agent 工作原理

### 工具集

Agent 可以使用以下三个工具：

1. **search_content** - 搜索网络信息
   - 用途：收集背景资料和参考内容
   - 参数：查询词、最大结果数

2. **write_content** - 撰写文章内容
   - 用途：基于搜索结果生成内容
   - 参数：主题、要求、参考资料

3. **generate_images** - 生成配图
   - 用途：为文章生成配图
   - 参数：图片描述列表、图片尺寸

### 工作流程

```
┌─────────────────────────────────────────┐
│           用户请求                       │
│   topic + requirements                  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         ReAct Agent (LLM)               │
│                                         │
│  1. 分析任务需求                        │
│  2. 决策：是否需要搜索？                │
│     ├─ 是 → 调用 search_content        │
│  3. 决策：基于搜索结果撰写内容         │
│     └─ 调用 write_content              │
│  4. 决策：是否需要配图？                │
│     ├─ 是 → 调用 generate_images      │
│  5. 返回最终结果                        │
└─────────────────────────────────────────┘
```

### System Prompt

```
你是一个专业的内容创作助手。你的任务是根据用户需求创建高质量的内容。

可用工具：
1. search_content - 搜索网络信息，收集背景资料
2. write_content - 撰写文章内容
3. generate_images - 生成配图

工作流程：
1. 首先使用 search_content 搜索相关信息
2. 然后使用 write_content 基于搜索结果撰写文章
3. 最后使用 generate_images 生成配图

请确保内容准确、有深度，并引用可靠来源。
```

---

## 输出结果

### 结果结构

执行完成后，Agent 返回以下信息：

1. **任务信息**
   - 工作流类型、描述、执行模式
   - 任务 ID 和状态

2. **参数信息**
   - 所有传入的参数值

3. **生成的内容**
   - 完整的文章内容（标题 + 正文）

4. **生成的配图**
   - 图片本地路径或 URL

5. **Agent 思考过程**（最后 5 条）
   - 显示 Agent 的推理过程
   - 工具调用决策
   - 👤 用户消息
   - 🤖 Agent 消息

6. **执行统计**
   - 总耗时
   - Token 使用量
   - 成本估算

---

## 使用场景

### 场景 1: 快速科普文章

```bash
pnpm run cli create --type content-creator-agent \
  --topic "区块链技术入门" \
  --requirements "写一篇 800 字的科普文章，语言通俗易懂" \
  --tone "科普友好"
```

**预期结果**:
- Agent 会先搜索区块链相关信息
- 基于搜索结果撰写文章
- 可能生成配图

### 场景 2: 技术深度分析

```bash
pnpm run cli create --type content-creator-agent \
  --topic "Microservices 架构模式" \
  --requirements "深入分析架构设计、优缺点和实际应用案例，包含代码示例" \
  --target-audience "后端开发者" \
  --tone "专业深入"
```

**预期结果**:
- Agent 搜索多个技术资源
- 生成详细的技术分析
- 可能不生成配图（技术文章）

### 场景 3: 异步批量处理

```bash
pnpm run cli create --type content-creator-agent \
  --topic "AI 在医疗领域的应用" \
  --requirements "综述 AI 在诊断、治疗、药物研发中的应用" \
  --mode async
```

**预期结果**:
- 任务提交到队列
- 需要启动 Worker 处理
- 可以通过 `pnpm run cli result --task-id <id>` 查看结果

---

## 高级用法

### 查看工作流详情

```bash
pnpm run cli workflow info content-creator-agent
```

输出包括：
- 基本信息（类型、名称、版本）
- 标签
- 参数详情（所有参数的定义和示例）
- 使用示例

### 监控 Agent 思考过程

Agent 的思考过程会记录在 `agentMessages` 字段中。CLI 默认显示最后 5 条消息，包括：

- 👤 **用户消息**: 初始请求
- 🤖 **Agent 消息**: 工具调用决策
- 🛠️ **工具调用**: search_content, write_content, generate_images
- 📝 **结果生成**: 最终输出

---

## 配置选项

### 环境变量

在 `.env` 文件中配置：

```bash
# Agent 配置
AGENT_ENABLED=true                    # 启用 Agent 工作流
AGENT_MAX_ITERATIONS=15               # 最大迭代次数
AGENT_TIMEOUT=300000                  # 超时时间（毫秒）
```

### 配置说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `AGENT_ENABLED` | `false` | Agent 功能开关 |
| `AGENT_MAX_ITERATIONS` | `10` | 防止无限循环 |
| `AGENT_TIMEOUT` | `300000` | 单次任务超时（5分钟） |

---

## 技术架构

### 文件结构

```
src/domain/workflow/
├── tools/
│   ├── SearchTool.ts              # 搜索工具
│   ├── WriteTool.ts               # 写作工具
│   ├── ImageGenerationTool.ts     # 图片生成工具
│   └── index.ts                   # 工具导出
└── ContentCreatorAgentWorkflow.ts # Agent 工作流
```

### 核心组件

1. **LLM 适配器**
   - 位置: `ContentCreatorAgentWorkflow.createLangChainCompatibleLLM()`
   - 功能: 将现有 `ILLMService` 包装为 LangChain 兼容接口

2. **工具实现**
   - 封装现有服务（SearchService, LLMService）
   - 使用 `@tool` 装饰器
   - Zod schema 参数验证

3. **状态管理**
   - `AgentState` 继承 `BaseWorkflowState`
   - 包含 `agentMessages` 字段记录思考过程

---

## 故障排除

### 问题 1: Agent 循环调用

**症状**: Agent 重复调用同一个工具

**解决**:
- 检查 `AGENT_MAX_ITERATIONS` 配置
- 优化 System Prompt，明确工作流程
- 检查工具返回结果的格式

### 问题 2: 内容质量不佳

**症状**: 生成的内容不满足要求

**解决**:
- 在 `--requirements` 中提供更详细的指导
- 使用 `--tone` 参数指定语气风格
- 增加 `--target-audience` 明确受众

### 问题 3: 缺少搜索结果

**症状**: Agent 没有搜索就直接写作

**解决**:
- 这可能是 Agent 的决策，不是错误
- 如果需要强制搜索，在 requirements 中明确要求："先搜索相关资料，再撰写"

---

## 性能优化建议

1. **Token 优化**
   - 明确指定输出格式减少重复
   - 限制搜索结果数量
   - 使用简洁的 requirements

2. **速度优化**
   - 减少 `AGENT_MAX_ITERATIONS`
   - 调整 `AGENT_TIMEOUT`
   - 使用 `--mode async` 异步处理

3. **成本控制**
   - Agent 可能调用多次 LLM，注意成本
   - 可以通过日志监控 Token 使用

---

## 相关文档

- [设计文档](../design/content-creator-agent-design.md) - 完整的技术设计
- [工作流架构](../architecture/workflow-architecture.md) - LangGraph 工作流详解
- [CLI 命令参考](../references/cli-reference.md) - 完整的 CLI 命令文档

---

## 更新日志

### v1.0.0 (2026-02-03)
- ✅ 初始版本发布
- ✅ 实现 3 个核心工具
- ✅ CLI 集成完成
- ✅ 测试验证通过

---

**反馈与贡献**: 如有问题或建议，请在项目仓库提交 Issue。
