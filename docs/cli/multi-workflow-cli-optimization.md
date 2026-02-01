# CLI 多工作流支持优化设计文档

## 📋 文档概述

**版本**: v1.0
**创建日期**: 2026-01-29
**目标**: 统一 CLI 接口，支持任意类型的工作流执行

---

## 🎯 优化目标

创建一个统一的 CLI 接口，所有命令都支持多工作流，无需每次修改 CLI 代码。

### 核心原则
1. **元数据驱动** - CLI 参数定义完全由工作流元数据驱动
2. **统一入口** - 所有工作流通过 `create --type <workflow>` 执行
3. **自动验证** - 使用工作流的 validateParams 进行参数验证
4. **友好提示** - 清晰的错误信息和使用示例
5. **向后兼容** - 现有 content-creator 接口保持不变
6. **易于扩展** - 添加新工作流无需修改 CLI 代码

---

## 📊 当前状态分析

### CLI 命令工作流支持情况

| 命令 | 当前状态 | 问题 | 优先级 |
|-----|---------|------|--------|
| **create** | ❌ 硬编码只支持 content-creator | 参数验证、选项定义都硬编码 | 🔴 高 |
| **status** | ⚠️ 部分支持 | 步骤显示、重试统计硬编码 | 🟡 中 |
| **result** | ⚠️ 部分支持 | 结果展示格式硬编码 | 🟡 中 |
| **cancel** | ⚠️ 数据库硬编码 | 使用 PostgresTaskRepository | 🟢 低 |
| **list** | ✅ 完全支持 | 已经工作流无关 | - |
| **retry** | ✅ 完全支持 | 已经工作流无关 | - |
| **workflow** | ⚠️ 需要增强 | 缺少参数详情显示 | 🟡 中 |

---

## 🏗️ 架构设计

### 核心组件：WorkflowParameterMapper

**文件位置**: `src/presentation/cli/utils/WorkflowParameterMapper.ts`

**职责**:
- 从 WorkflowRegistry 获取工作流元数据
- 动态生成 commander.js 选项定义
- 将 CLI 选项映射为工作流参数
- 验证参数完整性
- 生成友好的错误提示

**核心接口**:

```typescript
export interface ParameterMappingResult {
  workflowType: string;
  params: WorkflowParams;
  validationErrors: string[];
  missingParams: string[];
}

export class WorkflowParameterMapper {
  // 为指定工作流生成 commander.js 选项
  getOptionsForWorkflow(workflowType: string): ParameterOption[]

  // 将 CLI 选项映射为工作流参数
  mapCliOptionsToParams(workflowType: string, cliOptions: Record<string, any>): ParameterMappingResult

  // 验证参数完整性
  validateParams(workflowType: string, params: Record<string, any>): { valid: boolean; errors: string[] }

  // 格式化错误提示
  formatMissingParamsError(workflowType: string, missingParams: string[]): string

  // 生成 CLI 使用示例
  generateUsageExample(workflowType: string): string
}
```

---

## 🔧 详细优化方案

### 1. create 命令优化

#### 问题分析
- 硬编码只支持 `content-creator` 类型
- 选项定义固定（topic, requirements, audience 等）
- 参数验证逻辑只适用于内容创建工作流
- 不支持翻译工作流等其他类型

#### 解决方案

**步骤 1: 扩展 WorkflowMetadata 接口**

```typescript
// 文件: src/domain/workflow/WorkflowRegistry.ts

export interface ParamDefinition {
  name: string;                    // 参数名 (camelCase)
  description: string;             // 参数描述
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;               // 是否必需
  defaultValue?: any;              // 默认值
  validation?: (value: any) => boolean;  // 自定义验证函数
  cliFlags?: string;               // 自定义 CLI flags (可选)
  examples?: string[];             // 参数示例值
}

export interface WorkflowMetadata {
  // ... 现有字段

  // 新增字段
  paramDefinitions?: ParamDefinition[];  // 详细的参数定义
  stepNames?: Record<string, string>;    // 步骤名称映射
  retryFields?: {                        // 重试计数字段
    name: string;
    displayName: string;
  }[];
  resultDisplay?: (result: any, console: any) => void;  // 结果展示函数
}
```

**步骤 2: 更新工作流元数据**

Content-Creator 示例:

```typescript
// 文件: src/domain/workflow/adapters/ContentCreatorWorkflowAdapter.ts

getMetadata(): WorkflowMetadata {
  return {
    type: 'content-creator',
    version: '1.0.0',
    name: '内容创建工作流',
    description: 'AI 驱动的内容创作（搜索→组织→写作→质检→配图）',
    category: 'content',
    tags: ['ai', 'content-creation', 'writing', 'quality-check'],

    // 参数定义
    paramDefinitions: [
      {
        name: 'topic',
        description: '文章主题',
        type: 'string',
        required: true,
        examples: ['人工智能技术发展', '区块链原理'],
      },
      {
        name: 'requirements',
        description: '创作要求',
        type: 'string',
        required: true,
        examples: ['写一篇2000字的科普文章'],
      },
      {
        name: 'targetAudience',
        description: '目标受众',
        type: 'string',
        required: false,
        defaultValue: '普通读者',
      },
      {
        name: 'keywords',
        description: '关键词列表（逗号分隔）',
        type: 'array',
        required: false,
        examples: ['AI,机器学习,深度学习'],
      },
      {
        name: 'tone',
        description: '语气风格',
        type: 'string',
        required: false,
        defaultValue: '专业',
        examples: ['专业', '轻松', '幽默'],
      },
      {
        name: 'hardConstraints',
        description: '硬性约束（JSON 格式）',
        type: 'object',
        required: false,
      },
    ],

    // 步骤名称映射
    stepNames: {
      'search': '搜索内容',
      'organize': '组织信息',
      'write': '撰写内容',
      'check_text': '文本质检',
      'generate_image': '生成配图',
      'check_image': '图片质检',
    },

    // 重试计数字段
    retryFields: [
      { name: 'textRetryCount', displayName: '文本质检重试' },
      { name: 'imageRetryCount', displayName: '图片质检重试' },
    ],

    // 结果展示函数（可选）
    resultDisplay: (result: any, console: any) => {
      if (result.articleContent) {
        console.log('📝 文章内容:');
        console.log(result.articleContent);
      }
      if (result.images && result.images.length > 0) {
        console.log('🖼️ 生成的配图:');
        result.images.forEach((img: any) => console.log(img.url));
      }
    },
  };
}
```

Translation 示例:

```typescript
// 文件: src/domain/workflow/examples/TranslationWorkflow.ts

getMetadata(): WorkflowMetadata {
  return {
    type: 'translation',
    version: '1.0.0',
    name: '翻译工作流',
    description: '多语言文本翻译，支持自定义翻译风格',
    category: 'translation',
    tags: ['translation', 'multilingual', 'language'],

    // 参数定义
    paramDefinitions: [
      {
        name: 'sourceText',
        description: '待翻译的文本',
        type: 'string',
        required: true,
      },
      {
        name: 'sourceLanguage',
        description: '源语言代码（如 en, zh, ja）',
        type: 'string',
        required: true,
        examples: ['en', 'zh', 'ja'],
      },
      {
        name: 'targetLanguage',
        description: '目标语言代码（如 en, zh, ja）',
        type: 'string',
        required: true,
        examples: ['en', 'zh', 'ja'],
      },
      {
        name: 'translationStyle',
        description: '翻译风格',
        type: 'string',
        required: false,
        examples: ['formal', 'casual', 'technical'],
      },
      {
        name: 'domain',
        description: '专业领域',
        type: 'string',
        required: false,
        examples: ['technology', 'medical', 'legal'],
      },
    ],

    // 步骤名称映射
    stepNames: {
      'translate': '翻译',
      'check_translation': '翻译质检',
    },

    // 重试计数字段
    retryFields: [
      { name: 'translationRetryCount', displayName: '翻译重试' },
    ],

    // 结果展示函数
    resultDisplay: (result: any, console: any) => {
      console.log('🌐 翻译结果:');
      console.log('源文本:', result.sourceText);
      console.log('译文:', result.translatedText);

      if (result.qualityReport) {
        console.log('质量评分:', result.qualityReport.score, '/10');
      }
    },
  };
}
```

**步骤 3: 重构 create.ts**

```typescript
// 文件: src/presentation/cli/commands/create.ts

import { workflowParameterMapper } from '../utils/WorkflowParameterMapper.js';
import { WorkflowRegistry } from '../../../domain/workflow/WorkflowRegistry.js';

export const createCommand = new Command('create')
  .description('创建并执行工作流任务')
  .option('--type <type>', '工作流类型', 'content-creator')
  .option('--mode <mode>', '执行模式 (sync|async)', 'sync')
  .option('--priority <priority>', '优先级 (low|normal|high|urgent)', 'normal')
  .allowExcessArguments(true)
  .action(async (options) => {
    // ==================== 阶段 1: 验证工作流类型 ====================
    if (!WorkflowRegistry.has(options.type)) {
      console.error(chalk.red(`❌ 错误: 未知的工作流类型 "${options.type}"`));
      console.log();
      console.log(chalk.white('💡 可用的工作流类型:'));
      WorkflowRegistry.listWorkflows().forEach(w => {
        console.log(chalk.gray(`  • ${w.type} - ${w.name}`));
      });
      console.log();
      console.log(chalk.white('使用以下命令查看所有工作流:'));
      console.log(chalk.gray('  pnpm run cli workflow list'));
      console.log();
      process.exit(1);
    }

    // ==================== 阶段 2: 映射和验证参数 ====================
    const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
      options.type,
      options
    );

    if (errors.length > 0) {
      console.error(chalk.red('❌ 参数错误:'));
      errors.forEach(error => {
        console.error(chalk.red(`  • ${error}`));
      });
      console.log();

      // 提取缺少的必需参数
      const missingParams = errors
        .filter(e => e.includes('缺少必需参数'))
        .map(e => e.replace('缺少必需参数: ', ''));

      if (missingParams.length > 0) {
        console.log(workflowParameterMapper.formatMissingParamsError(
          options.type,
          missingParams
        ));
      }
      process.exit(1);
    }

    // ==================== 阶段 3: 使用工作流验证 ====================
    const factory = WorkflowRegistry.getFactory(options.type);
    if (!factory.validateParams(params)) {
      console.error(chalk.red('❌ 参数验证失败'));
      console.log();
      console.log(workflowParameterMapper.formatMissingParamsError(
        options.type,
        factory.getMetadata()?.requiredParams || []
      ));
      process.exit(1);
    }

    // ==================== 阶段 4: 执行任务 ====================
    // ... 现有的执行逻辑保持不变
  });
```

---

### 2. status 命令优化

#### 问题分析
- `getStepDisplayName()` 硬编码了 content-creator 的步骤
- 重试统计硬编码了 `textRetryCount` 和 `imageRetryCount`

#### 解决方案

```typescript
// 文件: src/presentation/cli/commands/status.ts

// 修改前
const stepNames: Record<string, string> = {
  'search': '搜索内容',
  'organize': '组织信息',
  'write': '撰写内容',
  'check_text': '文本质检',
  'generate_image': '生成配图',
  'check_image': '图片质检',
};

function getStepDisplayName(step: string): string {
  return stepNames[step] || step;
}

// 修改后
function getStepDisplayName(step: string, workflowType?: string): string {
  if (!workflowType) {
    return step;
  }

  try {
    const metadata = WorkflowRegistry.getMetadata(workflowType);
    const stepNames = metadata.stepNames || {};
    return stepNames[step] || step;
  } catch (error) {
    return step;
  }
}

// 使用示例
const stepDisplay = getStepDisplayName(task.currentStep, task.workflowType);
console.log(chalk.white(`当前步骤: ${stepDisplay}`));

// 动态显示重试统计
const metadata = WorkflowRegistry.getMetadata(task.workflowType);
if (metadata.retryFields && metadata.retryFields.length > 0) {
  metadata.retryFields.forEach(field => {
    const count = (task as any)[field.name] || 0;
    if (count > 0) {
      console.log(chalk.gray(`${field.displayName}: ${count} 次`));
    }
  });
}
```

---

### 3. result 命令优化

#### 问题分析
- 结果展示硬编码为文章和图片格式
- 提示信息提到"文章"、"配图"等特定词汇

#### 解决方案

```typescript
// 文件: src/presentation/cli/commands/result.ts

// 获取任务时带上工作流类型
const task = await taskRepo.findById(taskId);
if (!task) {
  console.error(chalk.red('❌ 任务不存在'));
  process.exit(1);
}

const workflowType = task.workflowType || 'content-creator';

// 使用工作流元数据的展示函数
const metadata = WorkflowRegistry.getMetadata(workflowType);

if (metadata.resultDisplay && result) {
  console.log(chalk.white.bold('📄 任务结果'));
  printSeparator();

  // 使用工作流自定义的展示函数
  metadata.resultDisplay(result, console);
} else {
  // 默认展示逻辑
  switch (result.resultType) {
    case 'article':
      console.log(chalk.white.bold('📝 文章内容:'));
      console.log(result.content);
      break;
    case 'image':
      console.log(chalk.white.bold('🖼️ 生成的配图:'));
      console.log(result.url);
      break;
    default:
      console.log(chalk.gray('结果:'));
      console.log(JSON.stringify(result, null, 2));
  }
}
```

---

### 4. cancel 命令优化

#### 问题分析
- 硬编码使用了 `PostgresTaskRepository`

#### 解决方案

```typescript
// 文件: src/presentation/cli/commands/cancel.ts

// 修改前
import { PostgresTaskRepository } from '../../../infrastructure/database/PostgresTaskRepository.js';

const taskRepo = new PostgresTaskRepository();

// 修改后
import { createTaskRepository } from '../../../infrastructure/database/index.js';

const taskRepo = createTaskRepository();
```

---

### 5. workflow info 命令增强

#### 当前功能
- 显示工作流基本信息
- 显示必需和可选参数

#### 新增功能
- 显示详细的参数定义
- 自动生成 CLI 使用示例

#### 解决方案

```typescript
// 文件: src/presentation/cli/commands/workflow.ts

// 在 info 命令中添加参数详情显示
if (metadata.paramDefinitions && metadata.paramDefinitions.length > 0) {
  console.log(chalk.white.bold('📋 参数详情'));
  console.log(chalk.gray('─'.repeat(60)));

  metadata.paramDefinitions.forEach(param => {
    const required = param.required ? chalk.red('必选') : chalk.gray('可选');
    console.log(chalk.white(`  • ${param.name}`));
    console.log(chalk.gray(`      类型: ${param.type}`));
    console.log(chalk.gray(`      必需: ${required}`));
    console.log(chalk.gray(`      描述: ${param.description}`));
    if (param.defaultValue !== undefined) {
      console.log(chalk.gray(`      默认值: ${param.defaultValue}`));
    }
    if (param.examples && param.examples.length > 0) {
      console.log(chalk.gray(`      示例: ${param.examples.join(', ')}`));
    }
    console.log();
  });
}

// 改进 CLI 使用示例生成
console.log(chalk.white.bold('💡 CLI 使用示例'));
console.log(chalk.gray('─'.repeat(60)));

const example = workflowParameterMapper.generateUsageExample(type);
console.log(chalk.gray(example));
```

---

## ✅ 使用示例

### Content-Creator 工作流

```bash
# 基础用法
pnpm run cli create \
  --type content-creator \
  --topic "AI技术" \
  --requirements "写一篇文章"

# 完整参数
pnpm run cli create \
  --type content-creator \
  --topic "区块链技术" \
  --requirements "深入浅出讲解区块链" \
  --target-audience "技术爱好者" \
  --keywords "区块链,去中心化,加密算法" \
  --tone "专业但不晦涩" \
  --mode sync

# 查看状态
pnpm run cli status --task-id <task-id>

# 查看结果
pnpm run cli result --task-id <task-id>
```

### Translation 工作流

```bash
# 基础翻译
pnpm run cli create \
  --type translation \
  --source-text "Hello, World!" \
  --source-language en \
  --target-language zh

# 带风格和领域
pnpm run cli create \
  --type translation \
  --source-text "Machine learning is revolutionizing industries" \
  --source-language en \
  --target-language ja \
  --translation-style technical \
  --domain technology

# 查看状态
pnpm run cli status --task-id <task-id>

# 查看结果
pnpm run cli result --task-id <task-id>
```

### 查看工作流信息

```bash
# 列出所有工作流
pnpm run cli workflow list

# 查看工作流详情
pnpm run cli workflow info translation

# 输出包含:
# - 基本信息（类型、名称、版本、描述）
# - 参数详情（名称、类型、必需、描述、示例）
# - 使用示例（自动生成的 CLI 命令）
```

---

## 📂 关键文件清单

### 新增文件
1. `src/presentation/cli/utils/WorkflowParameterMapper.ts` - 核心参数映射器
2. `src/presentation/cli/utils/__tests__/WorkflowParameterMapper.test.ts` - 单元测试
3. `tests/cli/create-command.test.ts` - 集成测试

### 修改文件
1. `src/domain/workflow/WorkflowRegistry.ts` - 扩展 WorkflowMetadata 接口
2. `src/domain/workflow/adapters/ContentCreatorWorkflowAdapter.ts` - 添加详细元数据
3. `src/domain/workflow/examples/TranslationWorkflow.ts` - 添加详细元数据
4. `src/presentation/cli/commands/create.ts` - 重构为动态参数处理
5. `src/presentation/cli/commands/status.ts` - 动态步骤显示
6. `src/presentation/cli/commands/result.ts` - 动态结果展示
7. `src/presentation/cli/commands/cancel.ts` - 使用工厂函数
8. `src/presentation/cli/commands/workflow.ts` - 增强参数详情显示

---

## 🎯 预期效果

### 用户体验改善

**之前**:
```bash
$ pnpm run cli create --type translation
❌ 错误: 不支持的工作流类型 "translation"
💡 支持的工作流类型：
  - content-creator
```

**之后**:
```bash
$ pnpm run cli create --type translation
❌ 错误: 缺少必需参数

工作流类型: 翻译工作流 (translation)

缺少以下参数:
  • sourceText
  • sourceLanguage
  • targetLanguage

💡 使用示例:
pnpm run cli create --type translation --source-text "Hello" --source-language en --target-language zh
```

### 扩展性改善

添加新工作流时，只需要：
1. 实现 WorkflowFactory 接口
2. 在 getMetadata() 中定义完整的元数据
3. 注册到 WorkflowRegistry

✅ **无需修改任何 CLI 代码！**

---

## 🚀 实施计划

### 第一阶段：核心功能（必须）
1. ✅ 扩展 WorkflowMetadata 接口
2. ✅ 创建 WorkflowParameterMapper
3. ✅ 更新 ContentCreatorWorkflowAdapter 元数据
4. ✅ 更新 TranslationWorkflow 元数据
5. ✅ 重构 create.ts 命令

### 第二阶段：增强功能（推荐）
6. ✅ 优化 status.ts（动态步骤显示）
7. ✅ 优化 result.ts（动态结果展示）
8. ✅ 修复 cancel.ts（使用工厂函数）
9. ✅ 更新 workflow info（显示参数详情）

### 第三阶段：测试和文档
10. 编写单元测试
11. 编写集成测试
12. 更新用户文档
13. 更新开发者文档
14. 编写迁移指南

---

## 📚 参考资料

- [工作流扩展指南](../workflow/workflow-extension-guide.md)
- [未来开发指南](../workflow/workflow-extension-FUTURE-GUIDE.md)
- [CLI 参考手册](../cli-reference.md)
