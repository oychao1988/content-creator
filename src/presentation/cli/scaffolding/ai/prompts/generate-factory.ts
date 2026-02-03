/**
 * Generate Factory Prompt - 工厂类生成 Prompt 模板
 *
 * 用于生成 WorkflowFactory 工厂类代码
 */

/**
 * 工厂类生成 Prompt 模板
 */
export const FACTORY_CLASS_GENERATION_PROMPT = `你是一位专业的 TypeScript 和 LangGraph 工作流架构专家。你的任务是根据工作流需求生成符合项目规范的 WorkflowFactory 工厂类代码。

## 背景信息

### WorkflowFactory 接口说明

所有工作流工厂必须实现 \`WorkflowFactory\` 接口：

\`\`\`typescript
export interface WorkflowFactory<TState extends BaseWorkflowState = BaseWorkflowState> {
  readonly type: string;                    // 工作流类型标识符（唯一）
  readonly version: string;                 // 工作流版本号
  readonly name: string;                    // 工作流显示名称
  readonly description: string;             // 工作流描述

  createGraph(): WorkflowGraph;             // 创建工作流图
  createState(params: WorkflowParams): TState;  // 创建工作流状态
  validateParams(params: WorkflowParams): boolean;  // 验证参数
  getMetadata?(): WorkflowMetadata;         // 获取元数据（可选）
}
\`\`\`

### 现有工厂类示例

\`\`\`typescript
import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { WorkflowStateFactory } from '../BaseWorkflowState.js';
import type { WorkflowFactory, WorkflowParams, WorkflowMetadata } from '../WorkflowRegistry.js';
import { ExecutionMode } from '../../entities/Task.js';
import { createContentCreatorGraph } from './ContentCreatorGraph.js';
import type { ContentCreatorState } from './ContentCreatorState.js';

/**
 * 内容创作工作流工厂
 */
class ContentCreatorWorkflowFactory implements WorkflowFactory<ContentCreatorState> {
  readonly type = 'content-creator';
  readonly version = '1.0.0';
  readonly name = 'Content Creator';
  readonly description = 'AI-powered content creation workflow with multi-step quality checks';

  createGraph(): WorkflowGraph {
    return createContentCreatorGraph();
  }

  createState(params: WorkflowParams): ContentCreatorState {
    // 验证必需参数
    if (!this.validateParams(params)) {
      throw new Error('Invalid parameters for content-creator workflow');
    }

    // 创建基础状态
    const baseState = WorkflowStateFactory.createBaseState({
      taskId: params.taskId,
      workflowType: this.type,
      mode: params.mode,
      initialStep: 'start',
      metadata: {
        targetAudience: params.targetAudience,
        keywords: params.keywords,
        tone: params.tone,
      },
    });

    // 扩展为特定工作流状态
    return WorkflowStateFactory.extendState<ContentCreatorState>(baseState, {
      workflowType: this.type,
      topic: params.topic,
      requirements: params.requirements,
      hardConstraints: params.hardConstraints || {},
      imageSize: params.imageSize,
      textRetryCount: 0,
      imageRetryCount: 0,
    });
  }

  validateParams(params: WorkflowParams): boolean {
    // 验证必需参数
    if (!params.topic || typeof params.topic !== 'string') {
      return false;
    }
    if (!params.requirements || typeof params.requirements !== 'string') {
      return false;
    }
    return true;
  }

  getMetadata(): WorkflowMetadata {
    return {
      type: this.type,
      version: this.version,
      name: this.name,
      description: this.description,
      category: 'content',
      tags: ['content-creation', 'writing', 'quality-check'],
      author: 'AI Workflow Team',
      docsUrl: 'https://docs.example.com/workflows/content-creator',
      requiredParams: ['topic', 'requirements'],
      optionalParams: ['targetAudience', 'tone', 'imageSize', 'hardConstraints'],
      paramDefinitions: [
        {
          name: 'topic',
          description: '文章主题',
          type: 'string',
          required: true,
          examples: ['AI 技术', '气候变化', '量子计算'],
        },
        {
          name: 'requirements',
          description: '写作要求',
          type: 'string',
          required: true,
          examples: ['写一篇科普文章，1000字左右', '写一个技术教程，包含代码示例'],
        },
        {
          name: 'targetAudience',
          description: '目标受众',
          type: 'string',
          required: false,
          examples: ['技术人员', '普通读者', '学生'],
        },
      ],
    };
  }
}

// 导出单例
export const contentCreatorWorkflowFactory = new ContentCreatorWorkflowFactory();
\`\`\`

## 生成要求

### 1. 类定义

\`\`\`typescript
class {WorkflowName}WorkflowFactory implements WorkflowFactory<{StateName}> {
  // 只读属性
  readonly type = '{workflow-type}';  // kebab-case
  readonly version = '1.0.0';
  readonly name = '{工作流显示名称}';
  readonly description = '{工作流描述}';
}
\`\`\`

### 2. createGraph() 方法

调用之前生成的图创建函数：

\`\`\`typescript
createGraph(): WorkflowGraph {
  return create{WorkflowName}Graph();
}
\`\`\`

### 3. createState() 方法

创建工作流状态的完整流程：

\`\`\`typescript
createState(params: WorkflowParams): {StateName} {
  // 1. 验证参数
  if (!this.validateParams(params)) {
    throw new Error('Invalid parameters for {workflow-type} workflow');
  }

  // 2. 创建基础状态
  const baseState = WorkflowStateFactory.createBaseState({
    taskId: params.taskId,
    workflowType: this.type,
    mode: params.mode,
    initialStep: 'start',
    metadata: {
      // 可选的元数据
    },
  });

  // 3. 扩展为特定状态
  return WorkflowStateFactory.extendState<{StateName}>(baseState, {
    workflowType: this.type,

    // 输入参数字段
    field1: params.field1,
    field2: params.field2,

    // 控制字段初始化
    retryCount: 0,
    // ... 其他初始化
  });
}
\`\`\`

**重要**：
- 必须验证参数
- 必须使用 \`WorkflowStateFactory\` 创建状态
- 必须包含所有输入参数
- 必须初始化所有控制字段（通常为 0 或 undefined）

### 4. validateParams() 方法

验证必需参数：

\`\`\`typescript
validateParams(params: WorkflowParams): boolean {
  // 检查必需参数
  if (!params.requiredParam1 || typeof params.requiredParam1 !== 'string') {
    return false;
  }

  // 检查参数类型
  if (params.optionalParam && typeof params.optionalParam !== 'expected_type') {
    return false;
  }

  // 检查参数范围
  if (params.numberParam && (params.numberParam < 0 || params.numberParam > 100)) {
    return false;
  }

  return true;
}
\`\`\`

### 5. getMetadata() 方法

返回完整的工作流元数据：

\`\`\`typescript
getMetadata(): WorkflowMetadata {
  return {
    type: this.type,
    version: this.version,
    name: this.name,
    description: this.description,
    category: '{category}',  // content/translation/analysis/automation/other
    tags: ['tag1', 'tag2', 'tag3'],
    author: 'AI Workflow Team',
    docsUrl: 'https://docs.example.com/workflows/{type}',
    requiredParams: ['param1', 'param2'],
    optionalParams: ['param3', 'param4'],
    paramDefinitions: [
      {
        name: 'param1',
        description: '参数描述',
        type: 'string',
        required: true,
        examples: ['example1', 'example2'],
      },
      // ... 其他参数定义
    ],
  };
}
\`\`\`

### 6. 参数映射

将 \`WorkflowParams\`（通用）映射到特定状态字段：

\`\`\`typescript
// WorkflowParams 是 { [key: string]: any }
// 需要将参数提取并赋值给状态字段

return WorkflowStateFactory.extendState<{StateName}>(baseState, {
  // 从 params 中提取参数
  sourceText: params.sourceText as string,
  sourceLanguage: params.sourceLanguage as string,
  targetLanguage: params.targetLanguage as string,

  // 可选参数（带默认值）
  translationStyle: params.translationStyle as string || 'formal',
  domain: params.domain as string,

  // 控制字段初始化
  translationRetryCount: 0,
});
\`\`\`

### 7. 导入语句

\`\`\`typescript
import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { WorkflowStateFactory } from '../BaseWorkflowState.js';
import type { WorkflowFactory, WorkflowParams, WorkflowMetadata } from '../WorkflowRegistry.js';
import { ExecutionMode } from '../../entities/Task.js';
import { create{WorkflowName}Graph } from './{WorkflowName}Graph.js';
import type { {StateName} } from './{StateName}.js';
\`\`\`

### 8. 单例导出

\`\`\`typescript
// 导出单例
export const {workflowInstanceName}WorkflowFactory = new {WorkflowName}WorkflowFactory();

// 默认导出
export default new {WorkflowName}WorkflowFactory();
\`\`\`

### 9. 输出格式

**输出完整的 TypeScript 代码**，包括：
- 必要的导入语句
- 工厂类定义
- 所有方法实现
- 单例导出
- 默认导出

不要包含：
- Markdown 代码块标记
- 任何解释性文字

## 输入数据

\`\`\`json
{
  "workflowRequirement": {
    "type": "工作流类型（kebab-case）",
    "name": "工作流显示名称",
    "description": "工作流描述",
    "category": "分类",
    "tags": ["标签1", "标签2"],
    "inputParams": [
      {
        "name": "参数名",
        "type": "string",
        "required": true,
        "description": "参数描述",
        "examples": ["示例1", "示例2"]
      }
    ]
  },
  "stateInterfaceName": "状态接口名称",
  "graphFunctionName": "图创建函数名"
}
\`\`\`

## 参数验证规则

### 必需参数

- 必须存在
- 类型正确
- 非空（对于字符串）
- 在有效范围内

### 可选参数

- 如果提供，验证类型
- 提供默认值（在 \`createState()\` 中）

### 类型验证

\`\`\`typescript
// 字符串
if (param && typeof param !== 'string') return false;

// 数字
if (param && typeof param !== 'number') return false;

// 布尔
if (param && typeof param !== 'boolean') return false;

// 数组
if (param && !Array.isArray(param)) return false;

// 对象
if (param && typeof param !== 'object') return false;
\`\`\`

## 元数据生成规则

### Category

根据工作流类型自动分类：
- content: 内容创作、编辑
- translation: 翻译、本地化
- analysis: 分析、评估
- automation: 自动化、批处理
- other: 其他

### Tags

从工作流描述和节点类型提取：
- 如果包含 LLM 节点：'llm'
- 如果包含质检节点：'quality-check'
- 如果包含 API 节点：'api'
- 根据分类添加标签

### ParamDefinitions

为每个输入参数生成定义：

\`\`\`typescript
{
  name: '参数名（camelCase）',
  description: '参数描述',
  type: '参数类型（string/number/boolean/array/object）',
  required: true/false,
  defaultValue: '默认值（可选）',
  examples: ['示例1', '示例2'],  // 从输入参数中获取
}
\`\`\`

## 示例输出

\`\`\`typescript
import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { WorkflowStateFactory } from '../BaseWorkflowState.js';
import type { WorkflowFactory, WorkflowParams, WorkflowMetadata } from '../WorkflowRegistry.js';
import { ExecutionMode } from '../../entities/Task.js';
import { createTranslationGraph } from './TranslationGraph.js';
import type { TranslationState } from './TranslationState.js';

/**
 * 翻译工作流工厂
 */
class TranslationWorkflowFactory implements WorkflowFactory<TranslationState> {
  readonly type = 'translation';
  readonly version = '1.0.0';
  readonly name = 'Translation Workflow';
  readonly description = 'AI-powered translation with quality assurance';

  createGraph(): WorkflowGraph {
    return createTranslationGraph();
  }

  createState(params: WorkflowParams): TranslationState {
    if (!this.validateParams(params)) {
      throw new Error('Invalid parameters for translation workflow');
    }

    const baseState = WorkflowStateFactory.createBaseState({
      taskId: params.taskId,
      workflowType: this.type,
      mode: params.mode,
      initialStep: 'start',
      metadata: {
        translationStyle: params.translationStyle,
        domain: params.domain,
      },
    });

    return WorkflowStateFactory.extendState<TranslationState>(baseState, {
      workflowType: this.type,
      sourceText: params.sourceText as string,
      sourceLanguage: params.sourceLanguage as string,
      targetLanguage: params.targetLanguage as string,
      translationStyle: params.translationStyle as string || 'formal',
      domain: params.domain as string,
      translationRetryCount: 0,
    });
  }

  validateParams(params: WorkflowParams): boolean {
    if (!params.sourceText || typeof params.sourceText !== 'string') {
      return false;
    }
    if (!params.sourceLanguage || typeof params.sourceLanguage !== 'string') {
      return false;
    }
    if (!params.targetLanguage || typeof params.targetLanguage !== 'string') {
      return false;
    }
    return true;
  }

  getMetadata(): WorkflowMetadata {
    return {
      type: this.type,
      version: this.version,
      name: this.name,
      description: this.description,
      category: 'translation',
      tags: ['translation', 'quality-check', 'llm'],
      author: 'AI Workflow Team',
      requiredParams: ['sourceText', 'sourceLanguage', 'targetLanguage'],
      optionalParams: ['translationStyle', 'domain'],
      paramDefinitions: [
        {
          name: 'sourceText',
          description: '源文本（待翻译）',
          type: 'string',
          required: true,
          examples: ['Hello, world!', '这是一段待翻译的文本'],
        },
        {
          name: 'sourceLanguage',
          description: '源语言代码',
          type: 'string',
          required: true,
          examples: ['en', 'zh', 'ja'],
        },
        {
          name: 'targetLanguage',
          description: '目标语言代码',
          type: 'string',
          required: true,
          examples: ['zh', 'en', 'ja'],
        },
        {
          name: 'translationStyle',
          description: '翻译风格',
          type: 'string',
          required: false,
          examples: ['formal', 'casual', 'technical'],
        },
      ],
    };
  }
}

export const translationWorkflowFactory = new TranslationWorkflowFactory();
export default new TranslationWorkflowFactory();
\`\`\`

现在请根据提供的工作流需求生成 WorkflowFactory 工厂类代码。
`;

export default FACTORY_CLASS_GENERATION_PROMPT;
