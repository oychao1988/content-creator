# AI-Native 工作流脚手架工具实施计划

> **基于文档**: docs/design/workflow-scaffolding-design.md (v2.0)
> **创建日期**: 2026-02-04
> **预估周期**: 4-6 天
> **状态**: 进行中

---

## 任务概述

实现一个基于 AI-Native 理念的工作流脚手架工具，通过自然语言描述自动生成 LangGraph 工作流代码。相比传统的 20+ 交互式问题和模板填充方案，新方案仅需 1 句话即可生成高质量工作流代码。

### 核心目标

1. **AI 需求理解引擎** - 从自然语言精确提取工作流需求
2. **智能工作流设计器** - 基于最佳实践自动设计工作流
3. **可视化预览系统** - 实时生成 Mermaid 流程图
4. **AI 代码生成器** - 非模板填充的智能生成
5. **自动验证与优化** - 生成后自动验证代码质量

### 预期成果

- 工作流创建时间: 2-4 小时 → **5-10 分钟** (12-48x 提升)
- 交互问题数量: 20+ → **1 句话**
- 开发周期: 14-20 天 → **4-6 天** (60%+ 时间节省)

---

## 阶段划分

### 阶段 1: AI 需求理解引擎 [✓ 已完成]

**目标**: 实现自然语言到结构化需求的核心引擎

**详细任务**:

#### 1.1 项目初始化
- [x] 创建目录结构
  ```
  src/presentation/cli/scaffolding/
  ├── ai/
  ├── visualization/
  ├── validation/
  ├── schemas/
  ├── utils/
  └── __tests__/
  ```
- [x] 安装必要依赖
  ```bash
  pnpm add zod inquirer chalk ora fs-extra
  ```

#### 1.2 Schema 定义
- [x] 创建 `schemas/WorkflowRequirementSchema.ts`
  - 定义 `ParamDefinitionSchema`
  - 定义 `NodeDesignSchema`
  - 定义 `ConnectionSchema`
  - 定义 `WorkflowRequirementSchema`
  - 导出 TypeScript 类型

#### 1.3 Prompt 模板设计
- [x] 创建 `ai/prompts/understanding.ts`
  - 设计 `WORKFLOW_UNDERSTANDING_PROMPT` 模板
  - 包含项目上下文说明
  - 包含现有工作流示例
  - 包含输出 JSON Schema
  - 包含 Few-Shot Learning 示例

#### 1.4 上下文构建
- [x] 创建 `utils/contextBuilder.ts`
  - 实现 `buildProjectContext()` - 构建项目上下文
  - 实现 `extractCodePatterns()` - 提取现有代码模式
  - 实现 `extractBestPractices()` - 提取最佳实践
  - 实现 `identifyCommonNodes()` - 识别常用节点

#### 1.5 AI 理解引擎核心
- [x] 创建 `ai/AINeuralUnderstandingEngine.ts`
  - 实现 `understandRequirement()` - 理解自然语言需求
  - 实现 `validateRequirement()` - 验证需求完整性
  - 实现 `optimizeRequirement()` - 优化需求设计
  - 集成现有 `ILLMService`
  - JSON 解析和 Zod 验证

#### 1.6 Few-Shot Learning
- [x] 准备示例数据
  - 文本摘要工作流示例
  - 翻译工作流示例
  - 内容创作工作流示例
  - 批量处理工作流示例

#### 1.7 测试
- [x] 单元测试: Schema 验证
- [x] 单元测试: 上下文构建
- [x] 单元测试: AI 理解引擎
- [x] 集成测试: 端到端需求理解

**完成标准**:
- ✅ 能从自然语言生成结构化 `WorkflowRequirement`
- ✅ Schema 验证通过率 ≥ 95%
- ✅ 包含至少 4 个 Few-Shot 示例
- ✅ 单元测试覆盖率 ≥ 80%

**执行结果**:
- 创建文件: 10 个（6 个核心 + 4 个测试/文档）
- 代码行数: ~2,907 行
- 测试结果: ✅ 全部通过
- 详细报告: `PHASE1_COMPLETION_REPORT.md`

**状态**: ✓ 已完成

---

### 阶段 2: 可视化预览系统 [✓ 已完成]

**目标**: 实现工作流设计的可视化预览

**依赖**: 阶段 1

**详细任务**:

#### 2.1 Mermaid 流程图生成
- [x] 创建 `visualization/MermaidDiagramGenerator.ts`
  - 实现 `generateMermaidDiagram()` - 生成 Mermaid 代码
  - 支持节点和边的可视化
  - 支持条件分支显示

#### 2.2 节点关系表生成
- [x] 创建 `visualization/NodeTableGenerator.ts`
  - 实现 `generateNodeTable()` - 生成 ASCII 表格
  - 显示节点名称、类型、超时、依赖

#### 2.3 数据流图生成
- [x] 创建 `visualization/DataFlowDiagramGenerator.ts`
  - 实现 `generateDataFlowDiagram()` - 生成数据流图
  - 显示输入参数、节点处理、输出结果

#### 2.4 预览系统集成
- [x] 创建 `visualization/VisualizationPreviewSystem.ts`
  - 实现 `displayPreview()` - 终端显示预览
  - 集成 Mermaid、节点表、数据流图
  - 使用 chalk 美化输出

#### 2.5 测试
- [x] 单元测试: Mermaid 生成
- [x] 单元测试: 节点表生成
- [x] 单元测试: 数据流图生成
- [x] 集成测试: 完整预览显示

**完成标准**:
- ✅ 能生成清晰的 Mermaid 流程图
- ✅ 能显示完整的节点关系表
- ✅ 能显示数据流图
- ✅ 终端输出美观易读
- ✅ 20/20 测试通过

**执行结果**:
- 创建文件: 9 个（4 个核心 + 1 个测试 + 3 个文档/演示 + 1 个报告）
- 代码行数: ~2,500 行
- 测试结果: 20/20 通过
- 详细报告: `visualization/STAGE2_COMPLETION_REPORT.md`

**状态**: ✓ 已完成

---

### 阶段 3: AI 代码生成器 [✓ 已完成]

**目标**: 实现基于理解的智能代码生成

**依赖**: 阶段 1

**详细任务**:

#### 3.1 Prompt 模板设计
- [x] 创建 `ai/prompts/generate-state.ts`
  - 设计状态接口生成 Prompt
  - 包含 BaseWorkflowState 说明
  - 包含现有状态接口示例
- [x] 创建 `ai/prompts/generate-node.ts`
  - 设计节点类生成 Prompt
  - 包含 BaseNode 说明
  - 包含现有节点示例
  - 包含 LLM 服务调用示例
- [x] 创建 `ai/prompts/generate-graph.ts`
  - 设计工作流图生成 Prompt
  - 包含 LangGraph StateGraph 示例
  - 包含边和条件分支说明
- [x] 创建 `ai/prompts/generate-factory.ts`
  - 设计工厂类生成 Prompt
  - 包含 WorkflowFactory 接口说明
  - 包含现有工厂类示例

#### 3.2 状态接口生成
- [x] 实现 `generateStateInterface()`
  - 调用 LLM 生成状态接口代码
  - 验证继承 BaseWorkflowState
  - 验证字段完整性

#### 3.3 节点类生成
- [x] 实现 `generateNodeClass()`
  - 为每个节点生成独立类
  - 继承 BaseNode
  - 实现 executeLogic()
  - 支持 LLM 节点和非 LLM 节点
  - 支持质检节点

#### 3.4 路由函数生成
- [x] 实现 `generateRouteFunctions()`
  - 根据节点连接关系生成路由逻辑
  - 支持条件分支
  - 支持重试逻辑

#### 3.5 工作流图生成
- [x] 实现 `generateWorkflowGraph()`
  - 生成 StateGraph 定义
  - 添加所有节点
  - 配置入口点和边
  - 编译图

#### 3.6 工厂类生成
- [x] 实现 `generateFactoryClass()`
  - 实现 WorkflowFactory 接口
  - 实现 createGraph()
  - 实现 createState()
  - 实现 validateParams()
  - 实现 getMetadata()

#### 3.7 代码生成器核心
- [x] 创建 `ai/AICodeGenerator.ts`
  - 实现 `generateWorkflow()` - 生成完整工作流
  - 实现 `generateFile()` - 生成单个文件
  - 返回 `WorkflowFiles` 对象

#### 3.8 代码后处理
- [x] 实现 `postProcessCode()`
  - Prettier 格式化
  - ESLint 检查
  - TypeScript 编译验证

#### 3.9 测试
- [x] 单元测试: 状态接口生成
- [x] 单元测试: 节点类生成
- [x] 单元测试: 工作流图生成
- [x] 单元测试: 工厂类生成
- [x] 集成测试: 完整代码生成

**完成标准**:
- ✅ 能生成完整的 TypeScript 工作流代码
- ✅ 生成的代码符合项目规范
- ✅ TypeScript 编译通过
- ✅ ESLint 检查通过
- ✅ 代码质量得分 ≥ 85/100
- ✅ 所有测试通过

**执行结果**:
- 创建文件: 18 个（Prompt 模板 + 代码生成器 + 测试 + 文档）
- 代码行数: ~4,600 行
- 包含 4 个 Prompt 模板（2,399 行）
- 包含 6 个代码生成器（1,836 行）
- 包含 1 个核心协调器（373 行）
- 详细报告: `docs/phase3-completion-report.md`

**状态**: ✓ 已完成

---

### 阶段 4: 自动验证与优化 [✓ 已完成]

**目标**: 实现代码质量验证和自动优化

**依赖**: 阶段 3

**详细任务**:

#### 4.1 TypeScript 检查
- [x] 更新 `CodePostProcessor.ts`
  - 改进 TypeScript 检查
  - 更好的错误解析

#### 4.2 ESLint 检查
- [x] 更新 `CodePostProcessor.ts`
  - 改进 ESLint 检查
  - 支持自动修复

#### 4.3 最佳实践验证
- [x] 创建 `BestPracticeChecker.ts`
  - AI 驱动的最佳实践检查
  - 与项目模式对比

#### 4.4 AI 验证 Prompt
- [x] 创建 `ai/prompts/validate.ts`
  - 设计验证 Prompt 模板
  - 定义 6 个验证维度

#### 4.5 自动优化
- [x] 创建 `AutoValidatorOptimizer.ts`
  - 集成所有验证器
  - 实现自动优化
  - 综合质量评分

#### 4.6 测试
- [x] 单元测试: TypeScript 检查
- [x] 单元测试: ESLint 检查
- [x] 单元测试: 最佳实践验证
- [x] 单元测试: 自动优化

**完成标准**:
- ✅ 能检测 TypeScript 类型错误
- ✅ 能检测 ESLint 问题
- ✅ 能提供优化建议
- ✅ 能自动修复常见错误
- ✅ 验证时间 ≤ 20 秒
- ✅ 6/6 测试通过

**执行结果**:
- 创建文件: 5 个
- 代码行数: ~1,400 行
- 测试结果: 6/6 通过
- 详细报告: `scaffolding/STAGE4_5_COMPLETION_REPORT.md`

**状态**: ✓ 已完成

---

### 阶段 5: CLI 集成 [✓ 已完成]

**目标**: 实现完整的 CLI 命令

**依赖**: 阶段 1-4

**详细任务**:

#### 5.1 CLI 命令实现
- [x] 创建 `commands/create.ts`
  - 实现 `createWorkflowCommand`
  - 支持所有命令选项
  - 完整的 11 步创建流程

#### 5.2 主流程实现
- [x] 实现完整创建流程
  1. 构建项目上下文
  2. AI 理解需求
  3. AI 优化设计
  4. 可视化预览
  5. 交互式确认
  6. AI 生成代码
  7. 自动验证优化
  8. 写入文件
  9. 自动注册
  10. 保存规范

#### 5.3 错误处理
- [x] 实现完整的错误处理
  - AI 调用失败
  - Schema 验证失败
  - 代码生成失败
  - 文件写入失败
  - 注册失败

#### 5.4 用户体验
- [x] 使用 ora 显示加载动画
- [x] 使用 chalk 美化输出
- [x] 显示详细的进度信息
- [x] 友好的错误提示

#### 5.5 测试
- [x] 集成测试: 基础创建
- [x] 集成测试: 交互模式
- [x] 集成测试: 预览模式
- [x] 集成测试: 从规范创建

**完成标准**:
- ✅ 能通过 CLI 创建工作流
- ✅ 支持所有命令选项
- ✅ 错误处理完善
- ✅ 用户体验友好
- ✅ 端到端时间 ≤ 2 分钟（实际 60-120 秒）
- ✅ 集成测试通过

**执行结果**:
- 创建文件: 4 个（命令 + 测试 + 文档）
- 代码行数: ~900 行
- 详细报告: `STAGE4_5_COMPLETION_REPORT.md`

**状态**: ✓ 已完成

---

### 阶段 6: 测试与文档 [✓ 已完成]

**目标**: 完善测试和编写文档

**依赖**: 所有阶段

**详细任务**:

#### 6.1 单元测试完善
- [x] 补充单元测试（新增 9 个测试文件）
  - AI 引擎测试覆盖率 ≥ 80%
  - 可视化测试覆盖率 ≥ 80%
  - 代码生成测试覆盖率 ≥ 80%
  - 验证优化测试覆盖率 ≥ 80%
  - **总计**: 12 个测试文件，200+ 测试用例

#### 6.2 集成测试
- [x] 端到端测试
  - 测试简单工作流创建 ✅
  - 测试复杂工作流创建 ✅
  - 测试边界情况 ✅
  - 测试错误处理 ✅
  - **总计**: 6 个完整场景

#### 6.3 使用文档
- [x] 创建 `docs/guides/workflow-scaffolding-guide.md`
  - 快速开始 ✅
  - 命令参考 ✅
  - 使用示例 ✅
  - 最佳实践 ✅
  - 故障排除 ✅
  - **总计**: 8500+ 字完整文档

#### 6.4 示例工作流
- [x] 创建示例（3 个完整示例）
  - 文本摘要工作流 ✅
  - 情感分析工作流 ✅
  - SEO 优化工作流 ✅
  - **总计**: 3 个示例 + 使用文档

#### 6.5 发布准备
- [x] 代码审查 ✅
- [x] 性能测试 ✅
- [x] 文档审查 ✅
- [x] 发布说明 ✅
- [x] README 更新 ✅

**完成标准**:
- ✅ 所有测试通过（200+ 测试用例）
- ✅ 文档完善（8500+ 字）
- ✅ 示例可用（3 个示例）
- ✅ 代码审查通过
- ✅ 系统生产就绪

**执行结果**:
- 新增文件: 15 个（9 个测试 + 6 个文档/示例）
- 修改文件: 2 个（README）
- 测试覆盖率: 85-90%
- 详细报告: `docs/reports/WORKFLOW-SCAFFOLDING-COMPLETION-REPORT.md`

**状态**: ✓ 已完成

---

## 整体进展

- **已完成**: 6 / 6
- **项目状态**: ✅ 全部完成，生产就绪
- **整体进度**: 100%

---

## 重要备注

### 技术栈

- **AI 服务**: DeepSeek API (现有 LLMService)
- **Schema 验证**: Zod
- **CLI 框架**: Commander
- **终端美化**: Chalk, Ora, Inquirer
- **文件操作**: fs-extra
- **代码质量**: TypeScript, ESLint, Prettier

### 关键依赖

- 依赖现有的 `ILLMService` 接口
- 依赖现有的 `WorkflowRegistry` 系统
- 依赖现有的 `BaseNode` 和 `BaseWorkflowState`

### 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| AI 理解不准确 | 高 | Few-Shot Learning + 多轮交互 |
| 生成代码有错误 | 高 | 自动验证 + 单元测试 |
| AI API 成本 | 中 | 缓存 + 批量处理 |
| 开发周期延长 | 中 | 每日站会 + 风险预留 |

### 里程碑

| 里程碑 | 标志 | 预期时间 |
|--------|------|---------|
| M1: AI 理解需求 | 能生成结构化需求 | Day 1 下午 |
| M2: 可视化预览 | 能显示 Mermaid 图 | Day 1 下午 |
| M3: 代码生成 | 能生成完整代码 | Day 3 上午 |
| M4: 自动验证 | 能验证并优化 | Day 3 下午 |
| M5: CLI 可用 | 能通过命令创建 | Day 4 上午 |
| M6: 生产就绪 | 测试通过，文档完善 | Day 5 结束 |

---

## 下一步行动

**🎉 项目已全部完成！**

所有 6 个阶段已成功完成，系统已生产就绪：

**已完成的核心功能**:
- ✅ AI 需求理解引擎
- ✅ 可视化预览系统
- ✅ AI 代码生成器
- ✅ 自动验证与优化
- ✅ CLI 集成
- ✅ 测试与文档

**系统立即可用！** 用户可以通过以下命令创建工作流：
```bash
# 基础用法
pnpm run cli workflow "创建一个文本摘要工作流"

# 查看帮助
pnpm run cli workflow --help

# 预览模式
pnpm run cli workflow "情感分析工作流" --preview

# 交互模式
pnpm run cli workflow "翻译工作流" --interactive
```

---

**里程碑全部达成 ✅**:
- ✅ M1: AI 理解需求 - 已达成
- ✅ M2: 可视化预览 - 已达成
- ✅ M3: 代码生成 - 已达成
- ✅ M4: 自动验证 - 已达成
- ✅ M5: CLI 可用 - 已达成
- ✅ M6: 生产就绪 - 已达成

**项目交付物**:
- 代码文件: 50+ 个核心实现文件
- 测试文件: 12 个测试文件，200+ 测试用例
- 文档文件: 完整的使用指南和示例
- 总代码量: ~15,000+ 行
- 测试覆盖率: 85-90%

**计划维护**: 本计划已全部完成。所有阶段都已成功实施。
