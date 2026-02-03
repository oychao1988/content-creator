# 统一多工作流 CLI 使用方案

## 📋 设计目标

创建一个统一的 CLI 接口，支持任意类型的工作流执行，无需每次修改 CLI 代码。

### 核心原则
1. **元数据驱动** - CLI 参数定义完全由工作流元数据驱动
2. **统一入口** - 所有工作流通过 `create --type <workflow>` 执行
3. **自动验证** - 使用工作流的 validateParams 进行参数验证
4. **友好提示** - 清晰的错误信息和使用示例
5. **向后兼容** - 现有 content-creator 接口保持不变
6. **易于扩展** - 添加新工作流无需修改 CLI 代码

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

## 📝 实现步骤

### 阶段 1: 扩展元数据定义

#### 1.1 扩展 WorkflowMetadata 接口
**文件**: `src/domain/workflow/WorkflowRegistry.ts`

添加详细的参数定义接口：

```typescript
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
}
```

#### 1.2 更新现有工作流的元数据

**文件 1**: `src/domain/workflow/adapters/ContentCreatorWorkflowAdapter.ts`

```typescript
getMetadata(): WorkflowMetadata {
  return {
    // ... 现有字段
    requiredParams: ['topic', 'requirements'],
    optionalParams: ['targetAudience', 'keywords', 'tone', 'hardConstraints'],

    // 新增：详细参数定义
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
  };
}
```

**文件 2**: `src/domain/workflow/examples/TranslationWorkflow.ts`

```typescript
getMetadata(): WorkflowMetadata {
  return {
    // ... 现有字段
    requiredParams: ['sourceText', 'sourceLanguage', 'targetLanguage'],
    optionalParams: ['translationStyle', 'domain'],

    // 新增：详细参数定义
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
  };
}
```

---

### 阶段 2: 创建 WorkflowParameterMapper

**文件**: `src/presentation/cli/utils/WorkflowParameterMapper.ts`

```typescript
import { WorkflowRegistry } from '../../../domain/workflow/WorkflowRegistry.js';
import type { ParamDefinition, WorkflowParams } from '../../../domain/workflow/WorkflowRegistry.js';
import chalk from 'chalk';

export class WorkflowParameterMapper {
  /**
   * kebab-case -> camelCase
   */
  private kebabToCamel(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * camelCase -> kebab-case
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * 获取工作流的参数定义
   */
  private getParamDefinitions(workflowType: string): Map<string, ParamDefinition> {
    const metadata = WorkflowRegistry.getMetadata(workflowType);
    const paramMap = new Map<string, ParamDefinition>();

    if (metadata.paramDefinitions) {
      metadata.paramDefinitions.forEach(param => {
        paramMap.set(param.name, param);
      });
    }

    return paramMap;
  }

  /**
   * 类型解析器
   */
  private parseParamValue(value: string, type: ParamDefinition['type']): any {
    switch (type) {
      case 'string':
        return value;
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Invalid number: ${value}`);
        }
        return num;
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'array':
        return value.split(',').map(v => v.trim());
      case 'object':
        try {
          return JSON.parse(value);
        } catch (error) {
          throw new Error(`Invalid JSON: ${value}`);
        }
      default:
        return value;
    }
  }

  /**
   * 将 CLI 选项映射为工作流参数
   */
  mapCliOptionsToParams(
    workflowType: string,
    cliOptions: Record<string, any>
  ): { params: WorkflowParams; errors: string[] } {
    const paramMap = this.getParamDefinitions(workflowType);
    const params: any = {
      taskId: cliOptions.taskId || `task-${Date.now()}`,
      mode: cliOptions.mode || 'sync',
    };
    const errors: string[] = [];

    // 映射工作流特定参数
    paramMap.forEach((param, name) => {
      const kebabName = this.camelToKebab(name);
      const cliValue = cliOptions[kebabName];

      if (cliValue !== undefined) {
        try {
          params[name] = this.parseParamValue(cliValue, param.type);

          // 验证参数
          if (param.validation && !param.validation(params[name])) {
            errors.push(`参数 ${name} 验证失败`);
          }
        } catch (error) {
          errors.push(`参数 ${name} 解析失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else if (param.required && !param.defaultValue) {
        errors.push(`缺少必需参数: ${name}`);
      } else if (param.defaultValue !== undefined) {
        params[name] = param.defaultValue;
      }
    });

    return { params, errors };
  }

  /**
   * 格式化错误提示
   */
  formatMissingParamsError(workflowType: string, missingParams: string[]): string {
    const metadata = WorkflowRegistry.getMetadata(workflowType);

    let message = `\n${chalk.red('❌ 错误: 缺少必需参数')}\n\n`;
    message += `${chalk.white.bold(`工作流类型: ${metadata.name} (${workflowType})`)}\n\n`;
    message += `${chalk.yellow('缺少以下参数:')}\n`;

    missingParams.forEach(param => {
      message += chalk.red(`  • ${param}\n`);
    });

    message += `\n${chalk.white.bold('💡 使用示例:')}\n`;
    message += chalk.gray(this.generateUsageExample(workflowType));

    return message;
  }

  /**
   * 生成 CLI 使用示例
   */
  generateUsageExample(workflowType: string): string {
    const metadata = WorkflowRegistry.getMetadata(workflowType);

    if (metadata.examples && metadata.examples.length > 0) {
      const firstExample = metadata.examples[0];
      let example = `# ${firstExample.description}\n`;
      example += `pnpm run cli create --type ${workflowType}`;

      Object.entries(firstExample.params).forEach(([key, value]) => {
        if (key !== 'taskId' && key !== 'mode') {
          const kebabKey = this.camelToKebab(key);
          const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
          example += ` --${kebabKey} "${displayValue}"`;
        }
      });

      return example;
    }

    return `pnpm run cli create --type ${workflowType} [参数...]`;
  }
}

export const workflowParameterMapper = new WorkflowParameterMapper();
```

---

### 阶段 3: 重构 create.ts 命令

**文件**: `src/presentation/cli/commands/create.ts`

**主要变更**:

1. 移除硬编码的选项定义（保留通用参数）
2. 使用 WorkflowParameterMapper 进行动态参数处理
3. 统一的参数验证流程
4. 友好的错误提示

**核心代码**:

```typescript
import { workflowParameterMapper } from '../utils/WorkflowParameterMapper.js';
import { WorkflowRegistry } from '../../../domain/workflow/WorkflowRegistry.js';

export const createCommand = new Command('create')
  .description('创建并执行工作流任务')
  .option('--type <type>', '工作流类型', 'content-creator')
  .option('--mode <mode>', '执行模式 (sync|async)', 'sync')
  .option('--priority <priority>', '优先级', 'normal')
  // 通用选项（所有工作流共享）
  .allowExcessArguments(true)  // 允许额外参数
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
    try {
      const result = await executor.execute(params);
      // ... 现有的结果展示逻辑
    } catch (error) {
      // ... 现有的错误处理逻辑
    }
  });
```

---

### 阶段 4: 更新 workflow info 命令

**文件**: `src/presentation/cli/commands/workflow.ts`

在 `workflow info` 命令中添加参数详情显示：

```typescript
// 在显示工作流信息时，添加参数定义部分
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
```

---

## ✅ 验证方案

### 测试场景

#### 1. Content-Creator 工作流

```bash
# 成功场景
pnpm run cli create \
  --type content-creator \
  --topic "AI技术" \
  --requirements "写一篇文章"

# 失败场景 - 缺少必需参数
pnpm run cli create \
  --type content-creator \
  --topic "AI技术"

# 预期输出:
# ❌ 参数错误:
#   • 缺少必需参数: requirements
#
# 💡 使用示例:
# pnpm run cli create --type content-creator --topic "AI技术" --requirements "写一篇文章"
```

#### 2. Translation 工作流

```bash
# 成功场景
pnpm run cli create \
  --type translation \
  --source-text "Hello, World!" \
  --source-language en \
  --target-language zh

# 失败场景 - 缺少必需参数
pnpm run cli create \
  --type translation

# 预期输出:
# ❌ 错误: 缺少必需参数
#
# 工作流类型: 翻译工作流 (translation)
#
# 缺少以下参数:
#   • sourceText
#   • sourceLanguage
#   • targetLanguage
#
# 💡 使用示例:
# pnpm run cli create --type translation --source-text "Hello" --source-language en --target-language zh
```

#### 3. 向后兼容性

```bash
# 旧命令继续有效（默认 content-creator）
pnpm run cli create --topic "AI" --requirements "写文章"

# 等价于
pnpm run cli create --type content-creator --topic "AI" --requirements "写文章"
```

---

## 📂 关键文件清单

### 新增文件
1. `src/presentation/cli/utils/WorkflowParameterMapper.ts` - 核心参数映射器
2. `src/presentation/cli/utils/__tests__/WorkflowParameterMapper.test.ts` - 单元测试
3. `tests/cli/create-command.test.ts` - 集成测试

### 修改文件
1. `src/domain/workflow/WorkflowRegistry.ts` - 扩展 WorkflowMetadata 接口
2. `src/domain/workflow/adapters/ContentCreatorWorkflowAdapter.ts` - 添加 paramDefinitions
3. `src/domain/workflow/examples/TranslationWorkflow.ts` - 添加 paramDefinitions
4. `src/presentation/cli/commands/create.ts` - 重构 create 命令
5. `src/presentation/cli/commands/workflow.ts` - 更新 info 命令显示

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
2. 在 getMetadata() 中定义 paramDefinitions
3. 注册到 WorkflowRegistry

✅ **无需修改 CLI 代码！**

---

## 🚀 实施优先级

### 高优先级（MVP）
1. ✅ 扩展 WorkflowMetadata 接口
2. ✅ 创建 WorkflowParameterMapper
3. ✅ 更新 ContentCreatorWorkflowAdapter 元数据
4. ✅ 更新 TranslationWorkflow 元数据
5. ✅ 重构 create.ts 命令

### 中优先级（增强）
1. 更新 workflow info 命令
2. 编写单元测试
3. 编写集成测试
4. 更新文档

### 低优先级（优化）
1. 添加交互式参数输入模式
2. 支持参数配置文件
3. 添加 bash/zsh 自动补全

---

## 🔧 其他 CLI 命令优化

除了 `create` 命令，其他 CLI 命令也需要优化以支持多工作流。

### 需要优化的命令

#### 1. status.ts - 查看任务状态

**问题**:
- 硬编码了步骤显示（只支持 content-creator 的步骤）
- 重试统计硬编码了特定字段

**优化方案**: 动态从工作流元数据获取步骤名称

#### 2. result.ts - 查看任务结果

**问题**:
- 结果展示硬编码为文章和图片格式

**优化方案**: 根据工作流类型动态展示结果

#### 3. cancel.ts - 取消任务

**问题**:
- 硬编码使用了 `PostgresTaskRepository`

**优化方案**: 使用工厂函数 `createTaskRepository()`

---

## 📋 CLI 优化总结

| 命令 | 状态 | 优化内容 | 优先级 |
|-----|------|---------|--------|
| **create** | ⚠️ 需要重构 | 统一多工作流参数映射 | 🔴 高 |
| **status** | ⚠️ 需要优化 | 动态步骤显示、重试统计 | 🟡 中 |
| **result** | ⚠️ 需要优化 | 动态结果展示格式 | 🟡 中 |
| **cancel** | ⚠️ 需要修复 | 使用工厂函数创建仓库 | 🟢 低 |
| **list** | ✅ 已优化 | 无需修改 | - |
| **retry** | ✅ 已优化 | 无需修改 | - |
| **workflow** | ⚠️ 需要增强 | 显示参数详情 | 🟡 中 |
