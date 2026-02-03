# 工作流脚手架工具设计文档

> **版本**: 1.0.0
> **创建日期**: 2026-02-03
> **状态**: 设计阶段，待实施

---

## 1. 概述

### 1.1 目标

设计并实现一个工作流脚手架工具，使开发者能够通过交互式 CLI 命令快速生成新的工作流模板代码，并自动集成到系统中。

### 1.2 核心功能

1. **交互式工作流生成** - 通过问答方式收集工作流需求
2. **代码模板生成** - 自动生成工作流状态、节点、图的代码
3. **自动注册** - 自动将新工作流注册到 WorkflowRegistry
4. **CLI 集成** - 生成的工作流可立即通过 CLI 执行

### 1.3 使用示例

```bash
# 创建新工作流
pnpm run cli workflow create

# 交互式问答
? 工作流类型标识符 (如: summarizer): summarizer
? 工作流显示名称: 文本摘要工作流
? 工作流描述: 基于LLM的文本摘要生成
? 工作流分类: content

# 定义输入参数
? 添加输入参数 (yes/no): yes
? 参数名: sourceText
? 参数类型: string
? 是否必需: yes
? 参数描述: 待摘要的文本

... (继续添加参数)

# 定义工作流节点
? 添加节点 (yes/no): yes
? 节点名称: summarize
? 节点描述: 生成摘要
? 使用LLM (yes/no): yes
? 启用质检 (yes/no): yes

... (继续添加节点)

# 生成并注册
✅ 工作流代码已生成: src/domain/workflows/SummarizerWorkflow.ts
✅ 已自动注册到 WorkflowRegistry
✅ 可通过 CLI 执行: pnpm run cli create --type summarizer --sourceText "..."
```

---

## 2. 现有工作流结构分析

### 2.1 工作流文件组织

```
src/domain/workflow/
├── BaseWorkflowState.ts          # 基础状态接口
├── WorkflowRegistry.ts            # 工作流注册表
├── State.ts                       # ContentCreator 状态定义
├── ContentCreatorGraph.ts         # ContentCreator 工作流图
├── adapters/                      # 适配器目录
│   └── ContentCreatorWorkflowAdapter.ts
└── examples/                      # 示例工作流目录
    └── TranslationWorkflow.ts     # 翻译工作流示例
```

### 2.2 工作流组件分析

| 组件 | 文件 | 说明 |
|------|------|------|
| **状态定义** | `*State` 接口 | 定义工作流的输入、流程、质检数据 |
| **节点实现** | `*Node extends BaseNode` | 继承 BaseNode，实现 executeLogic() |
| **路由函数** | `routeAfter*()` | 控制工作流分支逻辑 |
| **工作流图** | `StateGraph` | LangGraph 图定义 |
| **工厂类** | `*WorkflowFactory` | 实现 WorkflowFactory 接口 |
| **元数据** | `getMetadata()` | 提供工作流信息、参数定义 |

### 2.3 代码复杂度分析

| 组件 | 代码行数 (估计) | 复杂度 |
|------|----------------|--------|
| 状态定义 | ~50 行 | 低 |
| 单个节点 | ~150 行 | 中 |
| 路由函数 | ~30 行 | 低 |
| 工作流图 | ~100 行 | 中 |
| 工厂类 | ~100 行 | 中 |
| **总计** | **~500-800 行** | **中高** |

---

## 3. 脚手架工具架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI 入口层                                │
│  pnpm run cli workflow create                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              WorkflowScaffolder（核心）                      │
│  - 交互式问答收集                                           │
│  - 工作流配置构建                                           │
│  - 模板引擎渲染                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
┌─────────────┐ ┌──────────┐ ┌──────────────┐
│ 代码生成器  │ │ 注册器   │ │ CLI 集成器   │
│             │ │          │ │              │
│ - 状态代码  │ │ - 注册   │ │ - 参数映射   │
│ - 节点代码  │ │ - 验证   │ │ - 帮助文档   │
│ - 图代码    │ │ - 测试   │ │              │
│ - 工厂代码  │ │          │ │              │
└─────────────┘ └──────────┘ └──────────────┘
```

### 3.2 核心模块

#### 3.2.1 WorkflowScaffolder（脚手架核心）

**文件位置**: `src/presentation/cli/scaffolding/WorkflowScaffolder.ts`

```typescript
interface WorkflowConfig {
  // 基本信息
  type: string;                    // 工作流类型标识符
  name: string;                    // 显示名称
  description: string;             // 描述
  category: string;                // 分类
  version: string;                 // 版本号
  tags: string[];                  // 标签
  author: string;                  // 作者

  // 参数定义
  inputParams: ParamDefinition[];  // 输入参数
  outputFields: string[];          // 输出字段

  // 节点定义
  nodes: NodeDefinition[];         // 节点列表

  // 工作流配置
  enableQualityCheck: boolean;     // 是否启用质检
  maxRetries: number;              // 最大重试次数
  enableCheckpoint: boolean;       // 是否启用检查点
}

interface NodeDefinition {
  name: string;                    // 节点名称（如: summarize）
  displayName: string;             // 显示名称（如: 摘要）
  description: string;             // 描述
  nodeType: NodeType;              // 节点类型
  timeout: number;                 // 超时时间
  useLLM: boolean;                 // 是否使用 LLM
  llmSystemPrompt?: string;        // LLM 系统提示词
  enableQualityCheck: boolean;     // 是否启用质检
  qualityCheckPrompt?: string;     // 质检提示词
}

enum NodeType {
  LLM = 'llm',                     // LLM 调用节点
  API = 'api',                     // 外部 API 调用
  TRANSFORM = 'transform',         // 数据转换
  QUALITY_CHECK = 'quality_check', // 质检节点
  CUSTOM = 'custom'                // 自定义节点
}
```

#### 3.2.2 CodeGenerator（代码生成器）

**文件位置**: `src/presentation/cli/scaffolding/CodeGenerator.ts`

```typescript
interface CodeGenerator {
  generateState(config: WorkflowConfig): string;
  generateNodes(config: WorkflowConfig): string;
  generateGraph(config: WorkflowConfig): string;
  generateFactory(config: WorkflowConfig): string;
  generateAll(config: WorkflowConfig): WorkflowFiles;
}

interface WorkflowFiles {
  state: string;                   // 状态代码
  nodes: string;                   // 节点代码
  graph: string;                   // 图代码
  factory: string;                 // 工厂代码
  index: string;                   // 导出文件
}
```

#### 3.2.3 WorkflowRegistrar（注册器）

**文件位置**: `src/presentation/cli/scaffolding/WorkflowRegistrar.ts`

```typescript
interface WorkflowRegistrar {
  register(config: WorkflowConfig): Promise<RegistrationResult>;
  validate(config: WorkflowConfig): ValidationResult;
  addToInitialization(file: string): Promise<void>;
}

interface RegistrationResult {
  success: boolean;
  workflowFile: string;
  registrationCode: string;
  warnings: string[];
}
```

#### 3.2.4 CLIIntegrator（CLI 集成器）

**文件位置**: `src/presentation/cli/scaffolding/CLIIntegrator.ts`

```typescript
interface CLIIntegrator {
  updateParameterMapper(config: WorkflowConfig): Promise<void>;
  addWorkflowHelp(config: WorkflowConfig): Promise<void>;
  generateCLIDocs(config: WorkflowConfig): string;
}
```

---

## 4. 用户交互流程设计

### 4.1 交互流程图

```
开始
  │
  ▼
┌─────────────────────┐
│ 欢迎信息            │
│ 简要说明工具用途    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 基本信息            │
│ - type (必需)       │
│ - name (必需)       │
│ - description       │
│ - category          │
│ - tags              │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 输入参数定义        │
│ 循环添加参数：      │
│ - name              │
│ - type              │
│ - required          │
│ - description       │
│ - defaultValue      │
│ - examples          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 节点定义            │
│ 循环添加节点：      │
│ - name              │
│ - displayName       │
│ - nodeType          │
│ - useLLM            │
│ - enableQualityCheck│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 工作流配置          │
│ - 节点连接顺序      │
│ - 重试策略          │
│ - 超时配置          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 确认并生成          │
│ 显示配置摘要        │
│ 确认后生成代码      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 自动注册            │
│ - 生成代码文件      │
│ - 注册到系统        │
│ - 更新 CLI          │
└──────────┬──────────┘
           │
           ▼
        完成
```

### 4.2 问答设计

#### 阶段 1: 基本信息

```typescript
const questions = [
  {
    type: 'input',
    name: 'type',
    message: '工作流类型标识符 (kebab-case，如: text-summarizer):',
    validate: (input: string) => {
      if (!/^[a-z][a-z0-9-]*$/.test(input)) {
        return '必须以小写字母开头，只能包含小写字母、数字和连字符';
      }
      if (WorkflowRegistry.has(input)) {
        return `工作流类型 "${input}" 已存在`;
      }
      return true;
    }
  },
  {
    type: 'input',
    name: 'name',
    message: '工作流显示名称:',
    default: (answers: any) => toTitleCase(answers.type)
  },
  {
    type: 'input',
    name: 'description',
    message: '工作流描述:',
    validate: (input: string) => input.length > 0
  },
  {
    type: 'list',
    name: 'category',
    message: '选择工作流分类:',
    choices: ['content', 'translation', 'analysis', 'automation', 'other']
  },
  {
    type: 'checkbox',
    name: 'tags',
    message: '选择标签 (可多选):',
    choices: ['llm', 'ai', 'quality-check', 'batch', 'real-time']
  }
];
```

#### 阶段 2: 输入参数定义

```typescript
async function collectInputParams(): Promise<ParamDefinition[]> {
  const params: ParamDefinition[] = [];
  let addMore = true;

  while (addMore) {
    const param = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: `参数 ${params.length + 1} 名称 (camelCase):`,
        validate: (input: string) => /^[a-z][a-zA-Z0-9]*$/.test(input)
      },
      {
        type: 'list',
        name: 'type',
        message: '参数类型:',
        choices: ['string', 'number', 'boolean', 'array', 'object']
      },
      {
        type: 'confirm',
        name: 'required',
        message: '是否必需?',
        default: true
      },
      {
        type: 'input',
        name: 'description',
        message: '参数描述:'
      },
      {
        type: 'input',
        name: 'defaultValue',
        message: '默认值 (可选):',
        when: (answers: any) => !answers.required
      },
      {
        type: 'input',
        name: 'examples',
        message: '示例值 (逗号分隔，可选):'
      }
    ]);

    params.push({
      name: param.name,
      type: param.type,
      required: param.required,
      description: param.description,
      defaultValue: param.defaultValue,
      examples: param.examples ? param.examples.split(',').map((s: string) => s.trim()) : []
    });

    addMore = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addMore',
        message: '继续添加参数?',
        default: false
      }
    ]).then((a: any) => a.addMore);
  }

  return params;
}
```

#### 阶段 3: 节点定义

```typescript
async function collectNodes(): Promise<NodeDefinition[]> {
  const nodes: NodeDefinition[] = [];
  let addMore = true;

  while (addMore) {
    const node = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: `节点 ${nodes.length + 1} 名称 (camelCase):`,
        validate: (input: string) => /^[a-z][a-zA-Z0-9]*$/.test(input)
      },
      {
        type: 'input',
        name: 'displayName',
        message: '节点显示名称:',
        default: (answers: any) => toTitleCase(answers.name)
      },
      {
        type: 'input',
        name: 'description',
        message: '节点描述:'
      },
      {
        type: 'list',
        name: 'nodeType',
        message: '节点类型:',
        choices: [
          { name: 'LLM 调用节点', value: NodeType.LLM },
          { name: 'API 调用节点', value: NodeType.API },
          { name: '数据转换节点', value: NodeType.TRANSFORM },
          { name: '质检节点', value: NodeType.QUALITY_CHECK },
          { name: '自定义节点', value: NodeType.CUSTOM }
        ]
      },
      {
        type: 'number',
        name: 'timeout',
        message: '超时时间 (毫秒):',
        default: 60000
      },
      {
        type: 'confirm',
        name: 'useLLM',
        message: '此节点是否使用 LLM?',
        default: true,
        when: (answers: any) => answers.nodeType === NodeType.LLM
      },
      {
        type: 'editor',
        name: 'llmSystemPrompt',
        message: '请输入 LLM 系统提示词:',
        when: (answers: any) => answers.useLLM
      },
      {
        type: 'confirm',
        name: 'enableQualityCheck',
        message: '是否为此节点启用质检?',
        default: false
      }
    ]);

    nodes.push(node);

    addMore = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addMore',
        message: '继续添加节点?',
        default: false
      }
    ]).then((a: any) => a.addMore);
  }

  return nodes;
}
```

#### 阶段 4: 工作流配置

```typescript
async function collectWorkflowConfig(nodes: NodeDefinition[]): Promise<WorkflowConfig> {
  const config = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enableCheckpoint',
      message: '是否启用检查点（支持断点续传）?',
      default: true
    },
    {
      type: 'number',
      name: 'maxRetries',
      message: '质检失败最大重试次数:',
      default: 3
    },
    {
      type: 'list',
      name: 'nodeOrder',
      message: '节点执行顺序:',
      choices: nodes.map(n => ({ name: n.displayName, value: n.name })),
      // 允许排序
      loop: false
    }
  ]);

  return config;
}
```

---

## 5. 代码模板设计

### 5.1 模板引擎选择

推荐使用 **Handlebars** 作为模板引擎，原因：
- 语法简洁，易于维护
- 支持条件渲染和循环
- 良好的 TypeScript 支持
- 社区成熟，文档完善

### 5.2 模板文件组织

```
src/presentation/cli/scaffolding/templates/
├── state.hbs                      # 状态接口模板
├── nodes/
│   ├── llm-node.hbs               # LLM 节点模板
│   ├── api-node.hbs               # API 节点模板
│   ├── transform-node.hbs         # 转换节点模板
│   └── quality-check-node.hbs     # 质检节点模板
├── graph.hbs                      # 工作流图模板
├── factory.hbs                    # 工厂类模板
└── workflow.hbs                   # 完整工作流文件模板
```

### 5.3 核心模板示例

#### 5.3.1 状态接口模板 (state.hbs)

```handlebars
/**
 * {{workflowName}} - {{description}}
 *
 * 工作流类型: '{{workflowType}}'
 * 自动生成于: {{generatedAt}}
 */

import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { ExecutionMode } from '../../entities/Task.js';

/**
 * {{workflowName}}状态接口
 */
export interface {{stateInterfaceName}} extends BaseWorkflowState {
  // ========== 输入参数 ==========
  {{#each inputParams}}
  {{#if this.required}}
  {{this.name}}: {{this.type}};{{#if this.description}} // {{this.description}}{{/if}}
  {{else}}
  {{this.name}}?: {{this.type}};{{#if this.description}} // {{this.description}}{{/if}}
  {{/if}}
  {{/each}}

  // ========== 流程数据 ==========
  {{#each outputFields}}
  {{this}}?: any;
  {{/each}}

  // ========== 质检数据 ==========
  qualityReport?: {
    score: number;
    passed: boolean;
    fixSuggestions?: string[];
    checkedAt: number;
  };

  // ========== 控制数据 ==========
  {{#each nodes}}
  {{this.name}}RetryCount: number;
  {{/each}}
}
```

#### 5.3.2 LLM 节点模板 (nodes/llm-node.hbs)

```handlebars
/**
 * {{displayName}}节点
 */
class {{nodeName}} extends BaseNode<{{stateInterfaceName}}> {
  constructor() {
    super({
      name: '{{nodeId}}',
      timeout: {{timeout}},
    });
  }

  /**
   * 构建 Prompt
   */
  private buildPrompt(state: {{stateInterfaceName}}): string {
    return `{{#if llmSystemPrompt}}{{{llmSystemPrompt}}}{{else}}请完成以下任务。{{/if}}

【输入数据】
{{#each inputParams}}
{{this.name}}: ${{this.name}}
{{/each}}

【输出要求】
请直接返回结果，不要添加额外说明。`;
  }

  /**
   * 执行节点逻辑
   */
  protected async executeLogic(state: {{stateInterfaceName}}): Promise<Partial<{{stateInterfaceName}}>> {
    this.logger.info('Starting {{nodeId}}', {
      taskId: state.taskId,
    });

    try {
      // 1. 构建 Prompt
      const prompt = this.buildPrompt(state);

      // 2. 调用 LLM
      const result = await enhancedLLMService.chat({
        messages: [
          { role: 'system', content: '{{llmSystemPrompt}}' },
          { role: 'user', content: prompt },
        ],
        taskId: state.taskId,
        stepName: '{{nodeId}}',
        stream: true,
      });

      // 3. 处理结果
      const output = result.content.trim();

      this.logger.info('{{nodeId}} completed', {
        taskId: state.taskId,
        outputLength: output.length,
      });

      return {
        // TODO: 根据实际需求返回状态更新
      };
    } catch (error) {
      this.logger.error('{{nodeId}} failed', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 验证输入状态
   */
  protected validateState(state: {{stateInterfaceName}}): void {
    super.validateState(state);

    {{#each requiredParams}}
    if (!state.{{this}} || state.{{this}}.toString().trim().length === 0) {
      throw new Error('{{this}} is required for {{nodeId}}');
    }
    {{/each}}
  }
}
```

#### 5.3.3 工作流图模板 (graph.hbs)

```handlebars
/**
 * 创建{{workflowName}}工作流图
 */
function create{{className}}Graph(): any {
  this.logger.info('Creating {{workflowType}} workflow graph');

  // 创建节点实例
  {{#each nodes}}
  const {{this.name}}Node = new {{pascalCase this.name}}().toLangGraphNode();
  {{/each}}

  // 创建 StateGraph
  const graph = new StateGraph<{{stateInterfaceName}}>({
    channels: {
      // 基础字段
      taskId: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      workflowType: {
        default: () => '{{workflowType}}' as const,
        reducer: (x?: string, y?: string) => (y ?? x ?? '{{workflowType}}') as '{{workflowType}}',
      },
      // ... (其他基础字段)

      {{#each inputParams}}
      {{this.name}}: {
        default: () => {{#if this.defaultValue}}{{{this.defaultValue}}}{{else}}undefined{{/if}},
        reducer: (x?: {{this.type}}, y?: {{this.type}}) => y ?? x{{#unless this.required}} ?? undefined{{/unless}},
      },
      {{/each}}

      // ... (流程数据、质检数据、控制数据)
    },
  }) as any;

  // 添加节点
  {{#each nodes}}
  graph.addNode('{{this.id}}', {{this.name}}Node);
  {{/each}}

  // 设置入口点和边
  graph.addEdge(START as any, '{{firstNode.id}}');

  {{#each edges}}
  graph.addEdge('{{this.from}}' as any, '{{this.to}}');
  {{/each}}

  {{#each conditionalEdges}}
  graph.addConditionalEdges('{{this.from}}' as any, routeAfter{{pascalCase this.from}}, {
    {{#each this.targets}}
    {{this.key}}: '{{this.value}}',
    {{/each}}
  });
  {{/each}}

  return graph.compile();
}
```

### 5.4 代码生成流程

```typescript
class CodeGeneratorImpl implements CodeGenerator {
  private handlebars: Handlebars;

  constructor() {
    this.handlebars = Handlebars.create();
    this.registerHelpers();
    this.loadTemplates();
  }

  /**
   * 注册 Handlebars 辅助函数
   */
  private registerHelpers() {
    // Pascal Case 转换
    this.handlebars.registerHelper('pascalCase', (str: string) => {
      return str.replace(/(^\w|-\w)/g, (c) => c.toUpperCase().replace('-', ''));
    });

    // 标题转换
    this.handlebars.registerHelper('toTitleCase', (str: string) => {
      return str.replace(/\b\w/g, (c) => c.toUpperCase());
    });

    // 条件渲染
    this.handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    this.handlebars.registerHelper('unless', (value: any, options: any) => {
      return !value ? options.fn(this) : options.inverse(this);
    });
  }

  /**
   * 生成完整工作流代码
   */
  generateAll(config: WorkflowConfig): WorkflowFiles {
    const context = this.buildContext(config);

    return {
      state: this.renderTemplate('state.hbs', context),
      nodes: this.renderTemplate('nodes/nodes.hbs', context),
      graph: this.renderTemplate('graph.hbs', context),
      factory: this.renderTemplate('factory.hbs', context),
      index: this.renderTemplate('workflow.hbs', context),
    };
  }

  private renderTemplate(templateName: string, context: any): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }
    return template(context);
  }
}
```

---

## 6. 自动注册机制

### 6.1 注册流程

```
代码生成
    │
    ▼
写入文件: src/domain/workflows/<WorkflowName>Workflow.ts
    │
    ▼
更新 src/domain/workflow/initialize.ts
    │
    ▼
添加: import { workflowFactory } from './<WorkflowName>Workflow.js';
    │
    ▼
添加: WorkflowRegistry.register(workflowFactory);
    │
    ▼
验证注册
    │
    ▼
更新 WorkflowParameterMapper (如果需要)
    │
    ▼
完成
```

### 6.2 注册器实现

```typescript
class WorkflowRegistrarImpl implements WorkflowRegistrar {
  async register(config: WorkflowConfig): Promise<RegistrationResult> {
    const warnings: string[] = [];

    // 1. 验证配置
    const validation = this.validate(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    // 2. 生成文件路径
    const fileName = `${toPascalCase(config.type)}Workflow.ts`;
    const filePath = path.join(workflowsDir, fileName);

    // 3. 检查文件是否存在
    if (await fs.pathExists(filePath)) {
      const overwrite = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `文件 ${fileName} 已存在，是否覆盖?`,
          default: false
        }
      ]).then((a: any) => a.overwrite);

      if (!overwrite) {
        return { success: false, workflowFile: filePath, warnings };
      }
    }

    // 4. 生成代码
    const files = codeGenerator.generateAll(config);

    // 5. 写入文件
    await fs.writeFile(filePath, files.index, 'utf-8');
    logger.info(`Workflow file created: ${filePath}`);

    // 6. 更新初始化文件
    await this.addToInitialization(fileName);
    warnings.push(...await this.updateParameterMapper(config));

    // 7. 验证注册
    const verified = await this.verifyRegistration(config.type);
    if (!verified) {
      warnings.push('工作流注册后验证失败，请手动检查');
    }

    return {
      success: true,
      workflowFile: filePath,
      registrationCode: this.generateRegistrationCode(config, fileName),
      warnings
    };
  }

  /**
   * 添加到初始化文件
   */
  private async addToInitialization(fileName: string): Promise<void> {
    const initFilePath = path.join(srcDir, 'domain/workflow/initialize.ts');
    let content = await fs.readFile(initFilePath, 'utf-8');

    // 检查是否已导入
    const importStatement = `import { ${toCamelCase(fileName.replace('.ts', ''))}Factory } from './${fileName.replace('.ts', '.js')}';`;
    if (!content.includes(importStatement)) {
      // 在文件顶部的导入区域添加
      content = content.replace(
        /(import .* from .*\n)+/,
        `$&\n${importStatement}\n`
      );
    }

    // 检查是否已注册
    const registrationStatement = `WorkflowRegistry.register(${toCamelCase(fileName.replace('.ts', ''))}Factory);`;
    if (!content.includes(registrationStatement)) {
      // 在 WorkflowRegistry.markInitialized() 之前添加
      content = content.replace(
        /WorkflowRegistry\.markInitialized\(\);/,
        `${registrationStatement}\n\nWorkflowRegistry.markInitialized();`
      );
    }

    await fs.writeFile(initFilePath, content, 'utf-8');
    logger.info(`Updated initialization file: ${initFilePath}`);
  }

  /**
   * 验证注册
   */
  private async verifyRegistration(type: string): Promise<boolean> {
    try {
      // 重新加载模块
      const initModule = await import(`../../../domain/workflow/initialize.js`);
      return WorkflowRegistry.has(type);
    } catch (error) {
      logger.error('Failed to verify registration', { error, type });
      return false;
    }
  }
}
```

---

## 7. CLI 命令设计

### 7.1 命令结构

```bash
# 创建新工作流（主要命令）
pnpm run cli workflow create

# 列出工作流模板（预定义模板）
pnpm run cli workflow template list

# 使用模板创建工作流
pnpm run cli workflow create --template <template-name>

# 验证工作流配置
pnpm run cli workflow validate --config <config-file>

# 导出工作流配置
pnpm run cli workflow export <workflow-type> --output <config-file>

# 删除工作流
pnpm run cli workflow remove <workflow-type>
```

### 7.2 create 命令实现

**文件**: `src/presentation/cli/commands/scaffolding/create.ts`

```typescript
import { Command } from 'commander';
import { WorkflowScaffolder } from '../../scaffolding/WorkflowScaffolder.js';

export const createWorkflowCommand = new Command('create')
  .description('创建新的工作流')
  .option('-t, --template <template>', '使用预定义模板')
  .option('--config <file>', '从配置文件创建')
  .option('--dry-run', '仅生成代码，不注册')
  .action(async (options) => {
    const scaffolder = new WorkflowScaffolder();

    try {
      if (options.config) {
        // 从配置文件创建
        await scaffolder.createFromConfigFile(options.config, options.dryRun);
      } else if (options.template) {
        // 从模板创建
        await scaffolder.createFromTemplate(options.template, options.dryRun);
      } else {
        // 交互式创建
        await scaffolder.interactiveCreate(options.dryRun);
      }

      console.log('✅ 工作流创建成功!');
    } catch (error) {
      console.error('❌ 创建失败:', error);
      process.exit(1);
    }
  });
```

### 7.3 模板系统

#### 预定义模板

```
src/presentation/cli/scaffolding/templates/
├── predefined/
│   ├── simple-llm.json          # 简单 LLM 工作流
│   ├── llm-with-quality.json    # LLM + 质检工作流
│   ├── multi-step.json          # 多步骤工作流
│   └── batch-processor.json     # 批处理工作流
```

#### 模板示例 (simple-llm.json)

```json
{
  "name": "Simple LLM Workflow",
  "description": "包含单个 LLM 调用节点的简单工作流",
  "template": {
    "category": "content",
    "tags": ["llm", "simple"],
    "inputParams": [
      {
        "name": "prompt",
        "type": "string",
        "required": true,
        "description": "输入提示词"
      }
    ],
    "nodes": [
      {
        "name": "process",
        "displayName": "处理",
        "description": "使用 LLM 处理输入",
        "nodeType": "llm",
        "timeout": 60000,
        "useLLM": true,
        "enableQualityCheck": false
      }
    ],
    "enableCheckpoint": false,
    "maxRetries": 1
  }
}
```

---

## 8. 实施计划

### 8.1 阶段划分

| 阶段 | 任务 | 优先级 | 预估工作量 |
|------|------|--------|-----------|
| **阶段 1** | 核心脚手架 | 高 | 2-3 天 |
| | - WorkflowConfig 接口定义 | | |
| | - 交互式问答流程 | | |
| | - 基础模板引擎 | | |
| **阶段 2** | 代码生成器 | 高 | 3-4 天 |
| | - 状态接口模板 | | |
| | - LLM 节点模板 | | |
| | - 工作流图模板 | | |
| | - 工厂类模板 | | |
| **阶段 3** | 自动注册 | 高 | 2-3 天 |
| | - 注册器实现 | | |
| | - 初始化文件更新 | | |
| | - 参数映射更新 | | |
| **阶段 4** | CLI 集成 | 中 | 1-2 天 |
| | - 命令注册 | | |
| | - 帮助文档生成 | | |
| **阶段 5** | 模板系统 | 低 | 2-3 天 |
| | - 预定义模板 | | |
| | - 模板管理命令 | | |
| **阶段 6** | 测试与优化 | 中 | 2-3 天 |
| | - 单元测试 | | |
| | - 集成测试 | | |
| | - 文档完善 | | |

### 8.2 技术依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| inquirer | ^9.0.0 | 交互式命令行界面 |
| handlebars | ^4.7.0 | 模板引擎 |
| chalk | ^5.0.0 | 终端输出着色 |
| ora | ^6.0.0 | 加载动画 |
| fs-extra | ^11.0.0 | 文件操作增强 |

### 8.3 文件结构

```
src/presentation/cli/scaffolding/
├── WorkflowScaffolder.ts       # 核心脚手架类
├── CodeGenerator.ts             # 代码生成器
├── WorkflowRegistrar.ts          # 注册器
├── CLIIntegrator.ts             # CLI 集成器
├── templates/                   # 模板文件
│   ├── state.hbs
│   ├── nodes/
│   │   ├── llm-node.hbs
│   │   ├── api-node.hbs
│   │   ├── transform-node.hbs
│   │   └── quality-check-node.hbs
│   ├── graph.hbs
│   ├── factory.hbs
│   └── workflow.hbs
└── predefined/                  # 预定义模板
    ├── simple-llm.json
    ├── llm-with-quality.json
    └── multi-step.json
```

---

## 9. 风险与挑战

### 9.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 生成的代码有语法错误 | 高 | 添加代码验证和格式化步骤 |
| 模板维护成本高 | 中 | 保持模板简洁，使用组合模式 |
| 类型定义不完整 | 高 | 使用 TypeScript 严格模式验证 |
| 与现有代码冲突 | 中 | 代码生成前检查冲突 |

### 9.2 用户体验风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 交互流程太长 | 中 | 提供预设模板和配置文件选项 |
| 参数定义复杂 | 中 | 提供智能默认值和验证提示 |
| 节点连接逻辑难懂 | 高 | 可视化工作流图，使用 mermaid.js |

---

## 10. 未来扩展

### 10.1 可视化编辑器

```bash
# 启动可视化工作流编辑器
pnpm run cli workflow editor

# 功能：
# - 拖拽式节点编辑
# - 可视化连接线
# - 实时预览
# - 导出配置文件
```

### 10.2 AI 辅助生成

```bash
# 使用 AI 生成工作流
pnpm run cli workflow generate --prompt "创建一个文本摘要工作流"

# AI 分析需求，自动配置工作流
```

### 10.3 工作流市场

```bash
# 从工作流市场安装
pnpm run cli workflow install <workflow-name>

# 发布工作流到市场
pnpm run cli workflow publish <workflow-type>
```

---

## 11. 附录

### 11.1 示例：生成的完整工作流代码

详见附录文件：`docs/workflow-scaffolding-example.ts`

### 11.2 配置文件 Schema

详见附录文件：`docs/workflow-config-schema.json`

### 11.3 CLI 命令完整参考

详见附录文件：`docs/workflow-scaffolding-cli-reference.md`

---

**文档结束**

> 此设计文档为工作流脚手架工具的完整设计规范，实施时请严格按照此文档执行，并根据实际情况进行调整。
