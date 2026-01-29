# Agent 性能评估系统架构设计

## 1. 概述

### 1.1 设计目标

为内容创建 Agent 工作流系统构建全面的性能评估体系，从三个核心维度评估 Agent 性能：

- **任务成功率** (Task Success Rate) - 衡量 Agent 成功完成最终任务的比例
- **过程效率** (Process Efficiency) - 衡量资源消耗（成本、延迟、步骤数）
- **鲁棒性与可预测性** (Robustness & Predictability) - 衡量面对非理想情况时的表现

### 1.2 设计原则

- **非侵入性**: 评估系统不应影响主工作流的性能和稳定性
- **可扩展性**: 支持新增评估维度和自定义指标
- **可观测性**: 提供多种查询和可视化方式
- **数据驱动**: 基于实际数据提供优化建议

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        应用层                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   CLI 命令   │  │  REST API    │  │  Dashboard   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                    │
│         └─────────────────┴─────────────────┘                    │
│                           │                                      │
│                   ┌───────▼───────┐                              │
│                   │ Performance   │                              │
│                   │   Service     │                              │
│                   └───────┬───────┘                              │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                    应用层（核心）                                │
├───────────────────────────┼──────────────────────────────────────┤
│                           │                                      │
│         ┌─────────────────┴─────────────────┐                   │
│         │                                     │                   │
│  ┌──────▼──────┐  ┌──────────┐  ┌──────────▼──┐                │
│  │  Collector  │  │Evaluator │  │  Reporter   │                │
│  │  数据收集   │ │  评估器  │  │  报告生成  │                │
│  └──────┬──────┘  └────┬─────┘  └──────┬─────┘                │
│         │              │                │                        │
└─────────┼──────────────┼────────────────┼────────────────────────┘
          │              │                │
┌─────────┼──────────────┼────────────────┼────────────────────────┐
│         │      基础设施层   │                │                        │
├─────────┼──────────────┼────────────────┼────────────────────────┤
│         │              │                │                        │
│  ┌──────▼──────┐  ┌───▼────┐  ┌────────▼────┐  ┌─────────────┐  │
│  │Performance  │  │ Metrics│  │   Cache     │  │   Queue     │  │
│  │Repository   │  │Service │  │   Service   │  │   (可选)    │  │
│  └─────────────┘  └────────┘  └─────────────┘  └─────────────┘  │
│         │                                                        │
│    ┌────▼────┐                                                   │
│    │Database │                                                   │
│    │(Postgres│                                                   │
│    │/SQLite) │                                                   │
│    └─────────┘                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        工作流集成                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐          ┌────────────┐        ┌────────────┐  │
│  │LangGraph   │─────────▶│Node Wrapper│───────▶│   Worker   │  │
│  │  Workflow  │          │  (包装器)   │        │  Executor  │  │
│  └────────────┘          └────────────┘        └────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心模块划分

#### 2.2.1 数据收集层 (Collector)

**职责**:
- 从工作流节点收集执行数据
- 收集质量检查结果
- 收集资源消耗数据（Token、API 调用）
- 收集错误和异常信息

**设计要点**:
- 异步收集，不阻塞主流程
- 支持批量写入优化性能
- 容错设计，收集失败不影响任务执行
- 支持实时和延迟两种模式

#### 2.2.2 评估计算层 (Evaluator)

**职责**:
- 计算任务成功率指标
- 计算过程效率指标
- 计算鲁棒性指标
- 生成综合评分
- 提供优化建议

**评估指标体系**:

```
综合评分 (0-100)
├── 任务成功率 (40%)
│   ├── 整体成功率
│   ├── 文本质检通过率
│   └── 图片质检通过率
│
├── 过程效率 (30%)
│   ├── 任务耗时
│   ├── Token 消耗
│   ├── 成本估算
│   └── 步骤效率
│
└── 鲁棒性 (30%)
    ├── 重试率
    ├── 恢复成功率
    └── 一致性评分
```

#### 2.2.3 报告生成层 (Reporter)

**职责**:
- 生成任务级详细报告
- 生成批次统计分析报告
- 生成趋势分析报告
- 支持多种导出格式（JSON、CSV、Markdown）

**报告类型**:
- **任务报告**: 单个任务的详细评估
- **批次报告**: 多个任务的汇总统计
- **趋势报告**: 时间序列的性能趋势分析

#### 2.2.4 数据存储层 (Repository)

**职责**:
- 管理评估数据的持久化
- 提供高效的查询接口
- 支持多数据库适配（PostgreSQL、SQLite、Memory）

---

## 3. 数据模型设计

### 3.1 数据库架构

```
tasks (1) ──────> (N) performance_evaluations
                     │
                     └────────────> (N) step_performances
```

### 3.2 核心数据表

#### 3.2.1 performance_evaluations 表

**用途**: 存储任务级别的评估数据

**主要字段**:

| 字段类别 | 字段名 | 类型 | 说明 |
|---------|-------|------|------|
| **基础信息** | id | string | 评估记录唯一标识 |
| | task_id | string | 关联任务 ID |
| | task_type | string | 任务类型 |
| | execution_mode | string | 执行模式 (sync/async) |
| **成功率指标** | success | boolean | 是否成功完成 |
| | completion_status | string | 完成状态 |
| | text_quality_score | float | 文本质量评分 (0-10) |
| | image_quality_score | float | 图片质量评分 (0-10) |
| | text_check_passed | boolean | 文本质检是否通过 |
| | image_check_passed | boolean | 图片质检是否通过 |
| **效率指标** | total_duration | integer | 总耗时 (ms) |
| | step_count | integer | 步骤总数 |
| | retry_count | integer | 重试次数 |
| | token_prompt | integer | Prompt Token 数 |
| | token_completion | integer | Completion Token 数 |
| | token_total | integer | 总 Token 数 |
| | api_calls_llm | integer | LLM API 调用次数 |
| | api_calls_search | integer | 搜索 API 调用次数 |
| | api_calls_image | integer | 图片 API 调用次数 |
| **鲁棒性指标** | failure_reason | string | 失败原因分类 |
| | error_type | string | 错误类型 |
| | recovery_attempts | integer | 恢复尝试次数 |
| **元数据** | worker_id | string | 执行 Worker ID |
| | model_used | string | 使用的模型 |
| | environment | string | 运行环境 |
| | created_at | timestamp | 创建时间 |

**索引设计**:
- 主键索引: `id`
- 唯一索引: `task_id`
- 查询索引: `success`, `task_type`, `created_at`
- 复合索引: `(task_type, created_at)`, `(success, created_at)`

#### 3.2.2 step_performances 表

**用途**: 存储步骤级别的详细执行数据

**主要字段**:

| 字段类别 | 字段名 | 类型 | 说明 |
|---------|-------|------|------|
| **基础信息** | id | string | 步骤记录唯一标识 |
| | task_id | string | 关联任务 ID |
| | step_type | string | 步骤类型 |
| | attempt | integer | 尝试次数 (0=首次) |
| | status | string | 状态 (pending/running/completed/failed) |
| **时间统计** | start_time | timestamp | 开始时间 |
| | end_time | timestamp | 结束时间 |
| | duration | integer | 耗时 (ms) |
| **资源消耗** | token_count | integer | Token 消耗数 |
| | api_calls | integer | API 调用次数 |
| **质量指标** | quality_score | float | 质量评分 (如适用) |
| | check_passed | boolean | 检查是否通过 (如适用) |
| **错误信息** | error_message | string | 错误消息 |
| | error_type | string | 错误类型 |
| | created_at | timestamp | 创建时间 |

**索引设计**:
- 主键索引: `id`
- 查询索引: `task_id`, `step_type`, `status`
- 复合索引: `(task_id, step_type)`, `(task_id, status)`

### 3.3 数据关系

```
Task (1) ──────────> (1) PerformanceEvaluation
                           │
                           │ (1:N)
                           │
                           ├───> StepPerformance (search, attempt 0)
                           ├───> StepPerformance (search, attempt 1)
                           ├───> StepPerformance (organize, attempt 0)
                           ├───> StepPerformance (write, attempt 0)
                           ├───> StepPerformance (write, attempt 1)
                           ├───> StepPerformance (checkText, attempt 0)
                           ├───> StepPerformance (generateImage, attempt 0)
                           └───> StepPerformance (checkImage, attempt 0)
```

---

## 4. 数据收集策略

### 4.1 混合收集模式

采用**混合收集策略**，平衡性能和完整性：

| 数据类型 | 收集时机 | 存储方式 | 影响范围 |
|---------|---------|---------|---------|
| 核心指标（任务状态） | 实时 | 内存 + Prometheus | 零延迟 |
| 步骤开始/结束 | 实时 | 内存队列 | < 1ms |
| 质量检查结果 | 检查完成时 | 立即写入 DB | 异步 |
| 步骤详细数据 | 任务完成后 | 批量写入 DB | 无影响 |
| 资源消耗统计 | 任务完成后 | 汇总写入 DB | 无影响 |

**优势**:
- ✅ 核心指标零延迟，不影响工作流性能
- ✅ 详细数据异步处理，减少数据库压力
- ✅ 关键数据不丢失，崩溃后可恢复
- ✅ 支持高并发场景

### 4.2 数据流图

```
工作流节点执行
       │
       ▼
┌──────────────┐
│ Node Wrapper │ ◄─── 包装器模式，非侵入式
└──────┬───────┘
       │
       ├─────────────┐
       │             │
       ▼             ▼
  ┌────────┐    ┌─────────┐
  │Memory  │    │Metrics  │
  │ Buffer │    │Service  │
  └───┬────┘    └────┬────┘
      │              │
      │              ▼
      │         ┌─────────┐
      │         │Prometheus│
      │         │  指标    │
      │         └─────────┘
      │
      ▼ (批量写入)
┌─────────────┐
│  Database   │
│ (持久化)    │
└─────────────┘
```

### 4.3 收集点设计

在工作流的关键节点设置数据收集点：

```
┌─────────────────────────────────────────────────────────┐
│                    ContentCreatorWorkflow               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. search      ◀── 收集: 耗时、API 调用、搜索结果数    │
│     │                                                     │
│     ▼                                                     │
│  2. organize   ◀── 收集: 耗时、处理的数据量              │
│     │                                                     │
│     ▼                                                     │
│  3. write      ◀── 收集: 耗时、Token 消耗、生成字数      │
│     │                                                     │
│     ▼                                                     │
│  4. checkText  ◀── 收集: 耗时、质量评分、是否通过       │
│     │                                                     │
│     ▼                                                     │
│  5. generateImage ◀── 收集: 耗时、API 调用、图片数量     │
│     │                                                     │
│     ▼                                                     │
│  6. checkImage ◀── 收集: 耗时、质量评分、是否通过        │
│     │                                                     │
│     ▼                                                     │
│  complete         ◀── 汇总: 总耗时、总 Token、总成本     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 5. 评估指标体系

### 5.1 指标层次结构

```
Agent 性能评估
│
├── 1. 任务成功率 (Task Success Rate) [权重: 40%]
│   ├── 整体成功率 (完成数 / 总数)
│   ├── 文本生成成功率 (文本质检通过率)
│   ├── 图片生成成功率 (图片质检通过率)
│   ├── 平均质量评分
│   └── 平均尝试次数
│
├── 2. 过程效率 (Process Efficiency) [权重: 30%]
│   ├── 时间效率
│   │   ├── 任务总耗时
│   │   ├── 平均步骤耗时
│   │   └── 步骤耗时分布
│   ├── 资源效率
│   │   ├── Token 消耗总量
│   │   ├── Token 效率 (内容字数 / Token)
│   │   └── API 调用次数
│   ├── 成本效率
│   │   ├── LLM 成本
│   │   ├── 搜索成本
│   │   └── 图片生成成本
│   └── 步骤效率
│       ├── 步骤总数 (含重试)
│       └── 重试率
│
└── 3. 鲁棒性 (Robustness) [权重: 30%]
    ├── 恢复能力
    │   ├── 重试次数
    │   ├── 恢复成功率 (重试后成功的比例)
    │   └── 错误恢复时间
    ├── 一致性
    │   ├── 耗时一致性 (变异系数)
    │   ├── 质量一致性 (评分方差)
    │   └── 结果一致性
    └── 错误处理
        ├── 错误类型分布
        ├── 失败原因分类
        └── 致命错误率
```

### 5.2 评分算法

#### 综合评分计算

```
综合评分 = 成功率得分 × 0.4 + 效率得分 × 0.3 + 鲁棒性得分 × 0.3

其中:
- 成功率得分 = min(100, 实际成功率)
- 效率得分 = 基于耗时、Token、成本的加权得分
- 鲁棒性得分 = (1 - 重试率) × 40 + 恢复成功率 × 30 + 一致性 × 30
```

#### 评分等级

| 分数范围 | 等级 | 描述 |
|---------|------|------|
| 90-100 | 优秀 (⭐⭐⭐⭐⭐) | 各项指标均表现出色 |
| 80-89 | 良好 (⭐⭐⭐⭐) | 整体表现良好，个别指标可优化 |
| 70-79 | 一般 (⭐⭐⭐) | 基本满足要求，存在明显改进空间 |
| 60-69 | 较差 (⭐⭐) | 存在较多问题，需要优化 |
| 0-59 | 失败 (⭐) | 任务失败或严重不达标 |

---

## 6. 报告系统设计

### 6.1 报告类型

#### 6.1.1 任务级报告 (Task Report)

**用途**: 单个任务的详细性能分析

**包含内容**:
- 基本信息（任务 ID、类型、执行时间）
- 综合评分和等级
- 成功率分析（详细的数据和质量指标）
- 效率分析（耗时、Token、成本明细）
- 鲁棒性分析（重试、错误统计）
- 步骤明细（每个步骤的详细数据）
- 优化建议（针对性改进建议）

**使用场景**:
- 调试失败任务
- 分析特定任务性能
- 对比不同任务的执行情况

#### 6.1.2 批次报告 (Batch Report)

**用途**: 多个任务的统计分析

**包含内容**:
- 汇总统计（总数、成功数、失败数、平均分）
- 分布统计（评分分布、耗时分布、失败原因分布）
- Top 表现（最快任务、最高分任务）
- 任务列表（所有任务的简要信息）

**使用场景**:
- 批量任务质量评估
- 整体性能监控
- 趋势分析基础数据

#### 6.1.3 趋势报告 (Trend Report)

**用途**: 时间序列的性能趋势分析

**包含内容**:
- 时间序列数据（每日/每周的指标变化）
- 对比分析（周期性对比）
- 异常检测（异常高/低的性能点）
- 洞察和建议（趋势分析结论）

**使用场景**:
- 长期性能跟踪
- 容量规划
- 系统优化效果评估

### 6.2 报告输出格式

| 格式 | 用途 | 优势 |
|------|------|------|
| **CLI** | 命令行查看 | 快速、直观、可交互 |
| **JSON** | API 响应、程序处理 | 结构化、易解析 |
| **CSV** | 数据分析、Excel | 表格化、便于统计 |
| **Markdown** | 文档生成 | 可读性强、便于分享 |
| **HTML** | Web 展示 | 可视化、美观 |

### 6.3 CLI 命令设计

```bash
# 查看单个任务报告
pnpm run cli evaluate --task-id <id>

# 查看最近 N 个任务
pnpm run cli evaluate --recent 10

# 按条件筛选
pnpm run cli evaluate --status completed --days 7

# 批次报告
pnpm run cli evaluate --batch --task-ids <id1>,<id2>,<id3>

# 趋势报告
pnpm run cli evaluate --trend --days 30

# 导出报告
pnpm run cli evaluate --task-id <id> --export report.json

# 查看汇总统计
pnpm run cli evaluate --summary --days 30
```

---

## 7. 监控和可视化

### 7.1 Prometheus 指标设计

在现有 `MetricsService` 基础上扩展评估指标：

#### 7.1.1 成功率指标

```
# 任务成功率
agent_task_success_rate{task_type, mode}

# 质检通过率
agent_text_check_success_rate{task_type}
agent_image_check_success_rate{task_type}

# 质量评分
agent_quality_score{type="text", task_type}
agent_quality_score{type="image", task_type}
```

#### 7.1.2 效率指标

```
# 任务耗时
agent_task_duration_seconds{task_type, mode}

# Token 使用
agent_token_usage_total{task_type, type}  # type: prompt/completion

# 成本
agent_task_cost_usd{task_type, mode}

# 步骤耗时
agent_step_duration_seconds{step_type}
```

#### 7.1.3 鲁棒性指标

```
# 重试率
agent_step_retry_rate{step_type}

# 错误分布
agent_error_total{type, step_type}

# 一致性评分
agent_consistency_score{metric}  # metric: duration/quality
```

#### 7.1.4 综合评分

```
# 综合评分分布
agent_overall_score{task_type, grade}  # grade: excellent/good/average/poor/failed

# 评分趋势
agent_score_trend{task_type}
```

### 7.2 Grafana 仪表板设计

#### 7.2.1 仪表板布局

```
┌─────────────────────────────────────────────────────────────┐
│              Agent Performance Dashboard                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  成功率面板     │  │   效率面板      │  │  鲁棒性面板  │ │
│  │                 │  │                 │  │              │ │
│  │ • 任务成功率    │  │ • 任务耗时      │  │ • 重试率     │ │
│  │ • 质检通过率    │  │ • Token 使用    │  │ • 错误分布   │ │
│  │ • 质量评分      │  │ • 成本估算      │  │ • 一致性     │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                综合评分面板                           │  │
│  │  • 评分分布直方图                                     │  │
│  │  • 评分趋势图                                         │  │
│  │  • 评分等级分布（饼图）                               │  │
│  │  • Top 10 最佳/最差任务                               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                实时监控面板                           │  │
│  │  • 当前运行任务数                                     │  │
│  │  • 实时成功率                                         │  │
│  │  • 实时平均耗时                                       │  │
│  │  • 最近任务列表（表格）                               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 7.2.2 面板详解

**成功率面板**:
- 任务成功率趋势图（按任务类型分组）
- 文本质检通过率
- 图片质检通过率
- 平均质量评分趋势
- 任务完成状态分布（饼图）

**效率面板**:
- 任务耗时分布直方图
- 平均步骤耗时对比（柱状图）
- Token 使用趋势图
- 成本估算趋势
- API 调用次数统计

**鲁棒性面板**:
- 各步骤重试率（热力图）
- 失败原因分布（饼图）
- 错误类型分布（柱状图）
- 性能一致性评分
- 恢复成功率趋势

**综合评分面板**:
- 综合评分分布直方图
- 评分趋势图（时间序列）
- 评分等级分布（饼图）
- Top 10 最佳/最差任务（表格）

### 7.3 告警规则设计

```yaml
# 成功率告警
- alert: LowSuccessRate
  expr: agent_task_success_rate < 0.8
  for: 10m
  severity: warning
  annotations:
    summary: "任务成功率低于 80%"

# 耗时告警
- alert: HighTaskDuration
  expr: agent_task_duration_seconds > 600
  for: 15m
  severity: warning
  annotations:
    summary: "任务平均耗时超过 10 分钟"

# 重试率告警
- alert: HighRetryRate
  expr: agent_step_retry_rate > 0.3
  for: 5m
  severity: warning
  annotations:
    summary: "步骤重试率过高"

# 成本告警
- alert: HighCostPerTask
  expr: rate(agent_task_cost_usd[1h]) > 0.1
  for: 1h
  severity: info
  annotations:
    summary: "单任务平均成本超过 $0.1"
```

---

## 8. 工作流集成方案

### 8.1 集成架构

采用**包装器模式 (Wrapper Pattern)** 实现非侵入式集成：

```
┌─────────────────────────────────────────────────────┐
│              LangGraph 工作流                        │
├─────────────────────────────────────────────────────┤
│                                                      │
│  OriginalNode  ◀─────┐                              │
│     (原始节点)       │                              │
│                     │                               │
│  ┌──────────────────▼──────────────────┐           │
│  │     EvaluationNodeWrapper           │           │
│  │     (评估包装器)                     │           │
│  │                                     │           │
│  │  1. 记录步骤开始                     │           │
│  │  2. 执行原始节点                    │           │
│  │  3. 记录步骤结束                     │           │
│  │  4. 收集性能数据                     │           │
│  │  5. 容错处理（失败不影响主流程）      │           │
│  └─────────────────────────────────────┘           │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 8.2 集成点设计

在工作流的关键节点集成数据收集：

```
任务创建
    │
    ├─▶ 初始化评估 (创建评估记录)
    │
    ▼
┌────────┐
│ search │ ◀── 收集步骤数据
└───┬────┘
    ▼
┌─────────┐
│organize │ ◀── 收集步骤数据
└───┬─────┘
    ▼
┌────────┐
│ write  │ ◀── 收集步骤数据 + Token 使用
└───┬────┘
    ▼
┌───────────┐
│ checkText │ ◀── 收集步骤数据 + 质量结果
└─────┬─────┘
      ▼
┌──────────────┐
│generateImage │ ◀── 收集步骤数据 + API 调用
└──────┬───────┘
       ▼
┌─────────────┐
│ checkImage  │ ◀── 收集步骤数据 + 质量结果
└──────┬──────┘
       ▼
  任务完成
       │
       └─▶ 完成评估 (汇总数据、生成报告)
```

### 8.3 执行器集成

#### 8.3.1 SyncExecutor 集成

```typescript
class SyncExecutor {
  // 可选的性能追踪
  private performanceCollector?: PerformanceCollector;

  async execute(params: CreateTaskParams): Promise<Result> {
    // 1. 创建任务
    const task = await this.taskRepo.create(params);

    // 2. 如果启用了性能追踪，初始化评估
    if (this.performanceCollector) {
      await this.performanceCollector.initializeTaskEvaluation(task.id, task);
    }

    try {
      // 3. 执行工作流（节点会自动收集数据）
      const result = await this.executeWorkflow(task, params);

      // 4. 完成评估
      if (this.performanceCollector) {
        await this.performanceCollector.finalizeTaskEvaluation(task.id, true);
      }

      return result;
    } catch (error) {
      // 处理失败情况
      if (this.performanceCollector) {
        await this.performanceCollector.finalizeTaskEvaluation(task.id, false, error);
      }
      throw error;
    }
  }
}
```

#### 8.3.2 TaskWorker 集成

类似 SyncExecutor，在 Worker 处理任务的开始和结束时集成评估逻辑。

---

## 9. 配置管理

### 9.1 配置项设计

```typescript
// 性能评估配置
{
  enabled: boolean;              // 是否启用性能评估
  collectionMode: 'realtime' | 'batch' | 'hybrid';  // 收集模式
  batchSize: number;             // 批量写入大小
  batchTimeout: number;          // 批量写入超时 (ms)
  reportCacheTTL: number;        // 报告缓存时间 (秒)
  dataRetentionDays: number;     // 数据保留天数

  // 评分权重
  scoringWeights: {
    success: number;             // 成功率权重 (0.4)
    efficiency: number;          // 效率权重 (0.3)
    robustness: number;          // 鲁棒性权重 (0.3)
  };

  // 成本估算
  costEstimation: {
    llmCostPer1kTokens: number;  // LLM 成本/1K tokens
    searchCostPerCall: number;   // 搜索成本/次
    imageCostPerCall: number;    // 图片生成成本/次
  };

  // 数据归档
  archiving: {
    enabled: boolean;            // 是否启用归档
    archiveAfterDays: number;    // 归档天数
    archiveStorage: string;      // 归档存储 (S3/本地)
  };
}
```

### 9.2 环境变量

```bash
# 性能评估开关
PERFORMANCE_EVALUATION_ENABLED=true

# 收集模式
PERFORMANCE_EVALUATION_MODE=hybrid

# 批量配置
PERFORMANCE_EVALUATION_BATCH_SIZE=10
PERFORMANCE_EVALUATION_BATCH_TIMEOUT=5000

# 数据保留
PERFORMANCE_EVALUATION_RETENTION_DAYS=90

# 评分权重
PERFORMANCE_EVALUATION_WEIGHT_SUCCESS=0.4
PERFORMANCE_EVALUATION_WEIGHT_EFFICIENCY=0.3
PERFORMANCE_EVALUATION_WEIGHT_ROBUSTNESS=0.3

# 成本估算
LLM_COST_PER_1K_TOKENS=0.002
SEARCH_COST_PER_CALL=0.001
IMAGE_COST_PER_CALL=0.01
```

---

## 10. 性能优化策略

### 10.1 数据库优化

**批量写入**:
- 步骤数据先缓存到内存，达到批次大小后批量写入
- 使用事务保证数据一致性

**索引优化**:
- 为高频查询字段添加索引
- 使用复合索引优化常见查询组合
- 定期分析和优化索引

**分区策略** (可选):
- 按时间分区（如每月一个分区）
- 历史数据归档到冷存储

### 10.2 缓存策略

**报告缓存**:
- 生成的报告缓存到 Redis
- 缓存 TTL 可配置（默认 1 小时）
- 任务状态变化时清除缓存

**聚合数据缓存**:
- 统计数据缓存（如最近 7 天平均分）
- 缓存时间较短（如 10 分钟）
- 定时预计算更新

### 10.3 异步处理

**事件队列** (可选):
- 使用 BullMQ 队列异步处理评估数据
- 立即返回，不阻塞主流程
- 后台工作进程处理队列

**流式处理** (可选):
- 对于大批量数据，使用流式处理
- 避免一次性加载所有数据到内存

---

## 11. 数据管理

### 11.1 数据清理策略

**自动清理**:
- 定时任务每天凌晨执行
- 删除超过保留期的数据
- 可选择归档而非直接删除

**归档策略**:
- 压缩归档数据
- 存储到低成本对象存储（如 S3）
- 保留元数据以便查询

### 11.2 数据迁移

**版本管理**:
- 数据库 schema 版本控制
- 提供迁移脚本
- 支持滚动升级

**向后兼容**:
- 新版本支持读取旧格式数据
- 渐进式迁移策略

---

## 12. 测试策略

### 12.1 测试层次

```
┌─────────────────────────────────────────────┐
│              测试金字塔                     │
├─────────────────────────────────────────────┤
│                                              │
│           ┌─────┐                           │
│          ╱       ╲  E2E 测试 (少量)         │
│         ╱ 5%     ╲                          │
│        ╱───────────╲                        │
│       ╱             ╲                       │
│      ╱   25%         ╲  集成测试            │
│     ╱─────────────────╲                     │
│    ╱                   ╲                    │
│   ╱      70%            ╲  单元测试          │
│  ╱───────────────────────╲                   │
│                                              │
└─────────────────────────────────────────────┘
```

### 12.2 测试覆盖

**单元测试**:
- 评估指标计算逻辑
- 评分算法
- 报告生成逻辑
- 数据格式转换

**集成测试**:
- 数据收集流程
- 数据库操作
- 缓存集成
- 与工作流集成

**E2E 测试**:
- 完整的任务执行和评估流程
- 报告生成和导出
- CLI 命令功能
- 多数据库支持

**性能测试**:
- 高并发任务的数据收集
- 大批量数据的查询性能
- 报告生成性能

---

## 13. 实施路线图

### 阶段一：基础架构（1-2 周）
- [ ] 设计并创建数据库表结构
- [ ] 实现 Repository 层（PostgreSQL、SQLite、Memory）
- [ ] 创建 Collector 基础框架
- [ ] 扩展 MetricsService 添加评估指标

### 阶段二：核心功能（2-3 周）
- [ ] 完整实现 PerformanceCollector
- [ ] 实现 PerformanceEvaluator（三个维度的评估）
- [ ] 实现 PerformanceReporter（任务级报告）
- [ ] 集成到 LangGraph 工作流（包装器模式）

### 阶段三：测试和优化（1-2 周）
- [ ] 编写单元测试（覆盖率 > 80%）
- [ ] 编写集成测试
- [ ] 性能优化（批量写入、缓存）
- [ ] 压力测试（100+ 并发任务）

### 阶段四：报告和可视化（1-2 周）
- [ ] 实现 CLI 命令（evaluate）
- [ ] 创建 Grafana 仪表板
- [ ] 实现批次报告和趋势报告
- [ ] 实现多种导出格式（JSON、CSV、Markdown）

### 阶段五：部署和监控（1 周）
- [ ] 配置数据清理和归档策略
- [ ] 配置 Prometheus 告警规则
- [ ] 部署到生产环境
- [ ] 编写使用文档

### 阶段六：持续优化（持续）
- [ ] 收集用户反馈
- [ ] 优化评估算法
- [ ] 添加新的评估维度
- [ ] 性能调优

---

## 14. 风险和缓解措施

### 风险 1: 数据收集影响主流程性能

**影响**: 高 - 可能导致任务执行变慢

**缓解措施**:
- 采用异步收集模式
- 批量写入数据库
- 设置收集超时
- 降级开关（性能影响过大时自动关闭）

### 风险 2: 数据存储成本过高

**影响**: 中 - 长期运行后数据量大

**缓解措施**:
- 实施数据保留策略
- 自动归档旧数据
- 提供数据压缩
- 可选的冷存储方案

### 风险 3: 评估指标不准确

**影响**: 中 - 可能误导优化决策

**缓解措施**:
- 详细的单元测试验证算法
- 与实际业务场景对比验证
- 可配置的评分权重
- A/B 测试验证

### 风险 4: 数据库性能瓶颈

**影响**: 高 - 高并发场景下查询慢

**缓解措施**:
- 优化索引设计
- 实施缓存策略
- 读写分离
- 分区表（可选）

---

## 15. 后续优化方向

### 15.1 短期优化（1-3 个月）

- **A/B 测试支持**: 对比不同工作流配置的性能差异
- **自动调优**: 基于历史数据自动调整参数
- **智能推荐**: AI 驱动的优化建议
- **实时告警**: Prometheus Alertmanager 集成

### 15.2 中期优化（3-6 个月）

- **异常检测**: 使用机器学习检测异常任务
- **预测性分析**: 基于历史数据预测任务耗时和成本
- **多维度对比**: 支持按时间、类型、配置等多维度分析
- **成本优化**: 基于 Token 使用情况优化 LLM 调用策略

### 15.3 长期优化（6-12 个月）

- **工作流可视化**: 可视化编辑和调试工作流
- **性能基线**: 建立性能基线，自动识别回归
- **根因分析**: 自动分析失败原因并给出修复建议
- **自动优化**: 自动调整工作流参数以优化性能

---

## 16. 预期收益

实施该评估系统后，将获得以下收益：

### 16.1 开发收益
- ✅ **快速问题定位**: 通过详细的步骤追踪快速定位性能瓶颈
- ✅ **数据驱动优化**: 基于实际数据优化工作流和参数配置
- ✅ **回归检测**: 及时发现性能回归问题

### 16.2 运维收益
- ✅ **实时监控**: 通过 Grafana 实时了解系统性能
- ✅ **成本控制**: 实时监控 Token 使用和成本
- ✅ **告警及时**: 关键指标异常时及时告警

### 16.3 业务收益
- ✅ **质量提升**: 通过评估和优化持续提升任务完成质量
- ✅ **成本优化**: 优化资源使用，降低运营成本
- ✅ **用户信任**: 透明的性能指标增强用户信任

### 16.4 数据价值
- ✅ **决策支持**: 基于数据做出产品和技术决策
- ✅ **趋势洞察**: 了解系统性能趋势，预测未来需求
- ✅ **持续改进**: 建立数据驱动的持续改进文化

---

## 附录

### A. 关键文件清单

**新增文件**:
- `src/domain/entities/PerformanceEvaluation.ts` - 评估实体
- `src/domain/entities/StepPerformance.ts` - 步骤评估实体
- `src/domain/repositories/PerformanceEvaluationRepository.ts` - 评估仓储接口
- `src/domain/repositories/StepPerformanceRepository.ts` - 步骤仓储接口
- `src/infrastructure/database/*PerformanceRepository.ts` - 数据库实现
- `src/application/performance/PerformanceCollector.ts` - 数据收集器
- `src/application/performance/PerformanceEvaluator.ts` - 评估执行器
- `src/application/performance/PerformanceReporter.ts` - 报告生成器
- `src/services/performance/PerformanceService.ts` - 主服务入口
- `src/domain/workflow/nodeWrappers.ts` - 节点包装器
- `src/presentation/cli/commands/evaluate.ts` - CLI 命令
- `monitoring/grafana-dashboards/agent-performance.json` - Grafana 仪表板

**修改文件**:
- `src/domain/workflow/State.ts` - 添加评估追踪字段
- `src/domain/workflow/ContentCreatorGraph.ts` - 应用节点包装器
- `src/application/workflow/SyncExecutor.ts` - 集成评估收集
- `src/workers/TaskWorker.ts` - 集成评估收集
- `src/infrastructure/monitoring/MetricsService.ts` - 添加评估指标
- `src/config/index.ts` - 添加评估相关配置

### B. 参考资料

- LangGraph 官方文档: https://langchain-ai.github.io/langgraph/
- Prometheus 最佳实践: https://prometheus.io/docs/practices/
- Grafana 仪表板设计: https://grafana.com/docs/grafana/latest/best-practices/

---

**文档版本**: 1.0
**最后更新**: 2026-01-28
**维护者**: Content Creator Team
