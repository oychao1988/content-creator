/**
 * Workflow Scaffolding CLI Command - 工作流脚手架 CLI 命令
 *
 * 提供交互式工作流创建功能
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../../../infrastructure/logging/logger.js';
import { buildProjectContext } from '../utils/contextBuilder.js';
import { AINeuralUnderstandingEngine } from '../ai/AINeuralUnderstandingEngine.js';
import { VisualizationPreviewSystem } from '../visualization/VisualizationPreviewSystem.js';
import { AICodeGenerator } from '../ai/AICodeGenerator.js';
import { AutoValidatorOptimizer } from '../validation/AutoValidatorOptimizer.js';
import {
  validateWorkflowRequirement,
  type WorkflowRequirement,
} from '../schemas/WorkflowRequirementSchema.js';

const logger = createLogger('WorkflowScaffolding:CLI');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * CLI 选项
 */
interface CreateWorkflowOptions {
  /** 自然语言描述 */
  description?: string;
  /** 交互式模式 */
  interactive?: boolean;
  /** 跳过所有确认 */
  yes?: boolean;
  /** 仅生成预览 */
  preview?: boolean;
  /** 保存规范到文件 */
  saveSpec?: string;
  /** 从规范文件创建 */
  fromSpec?: string;
}

/**
 * CLI 上下文
 */
interface CLIContext {
  /** 项目上下文 */
  projectContext: Awaited<ReturnType<typeof buildProjectContext>>;
  /** AI 理解引擎 */
  understandingEngine: AINeuralUnderstandingEngine;
  /** 代码生成器 */
  codeGenerator: AICodeGenerator;
  /** 验证优化器 */
  validatorOptimizer: AutoValidatorOptimizer;
}

// ============================================================================
// 命令定义
// ============================================================================

/**
 * 创建工作流脚手架命令
 */
export const createWorkflowCommand = new Command('scaffold')
  .description('AI 工作流脚手架 - 用自然语言创建工作流')
  .argument('[description]', '工作流的自然语言描述')
  .option('-i, --interactive', '交互式确认模式')
  .option('-y, --yes', '跳过所有确认')
  .option('-p, --preview', '仅生成预览，不创建文件')
  .option('-s, --save-spec <file>', '保存规范到文件')
  .option('-f, --from-spec <file>', '从规范文件创建')
  .action(async (description: string | undefined, options: CreateWorkflowOptions) => {
    try {
      await executeCreateWorkflow(description, options);
    } catch (error) {
      handleError(error as Error);
      process.exit(1);
    }
  });

// ============================================================================
// 主流程
// ============================================================================

/**
 * 执行创建工作流流程
 */
async function executeCreateWorkflow(
  description: string | undefined,
  options: CreateWorkflowOptions
): Promise<void> {
  console.log();
  console.log(chalk.blue.bold('🤖 AI 工作流脚手架'));
  console.log(chalk.gray('基于 LangGraph 的智能工作流生成系统\n'));

  // ==================== 阶段 1: 初始化 ====================
  const spinner = ora('初始化中...').start();

  const context = await initializeContext(spinner);

  spinner.succeed('初始化完成');

  // ==================== 阶段 2: 获取需求 ====================
  let requirement: WorkflowRequirement;

  if (options.fromSpec) {
    // 从规范文件加载
    requirement = await loadSpecification(options.fromSpec, spinner);
  } else {
    // 从自然语言生成
    requirement = await generateRequirement(description, options.interactive, context, spinner);
  }

  // ==================== 阶段 3: 可视化预览 ====================
  spinner.start('生成工作流预览...');
  const preview = await VisualizationPreviewSystem.displayPreview(
    requirement,
    context.projectContext
  );
  spinner.succeed('预览生成完成');

  // 显示预览
  console.log();
  console.log(preview);
  console.log();

  // ==================== 阶段 4: 交互式确认 ====================
  if (options.interactive && !options.yes && !options.preview) {
    const confirmed = await confirmCreation(requirement);
    if (!confirmed) {
      console.log(chalk.yellow('\n✖ 操作已取消'));
      process.exit(0);
    }
  }

  // ==================== 阶段 5: 预览模式检查 ====================
  if (options.preview) {
    console.log(chalk.blue('\n📊 预览模式：未创建任何文件\n'));
    process.exit(0);
  }

  // ==================== 阶段 6: 保存规范 ====================
  if (options.saveSpec) {
    spinner.start('保存规范文件...');
    await saveSpecification(options.saveSpec, requirement);
    spinner.succeed(`规范已保存到: ${options.saveSpec}`);
  }

  // ==================== 阶段 7: 生成代码 ====================
  spinner.start('AI 正在生成代码...');
  const generatedFiles = await context.codeGenerator.generateWorkflow(
    requirement,
    context.projectContext
  );
  spinner.succeed('代码生成完成');

  // 显示生成进度
  console.log();
  console.log(chalk.gray('生成的文件:'));
  if (generatedFiles.state) console.log(chalk.gray('  ✓ State.ts'));
  generatedFiles.nodes.forEach((_, name) => console.log(chalk.gray(`  ✓ ${name}.ts`)));
  if (generatedFiles.routeFunctions) console.log(chalk.gray('  ✓ routes.ts'));
  if (generatedFiles.graph) console.log(chalk.gray('  ✓ Graph.ts'));
  if (generatedFiles.factory) console.log(chalk.gray('  ✓ Factory.ts'));
  if (generatedFiles.index) console.log(chalk.gray('  ✓ index.ts'));
  console.log();

  // ==================== 阶段 8: 验证和优化 ====================
  spinner.start('验证代码质量...');
  const validation = await context.validatorOptimizer.validateAndFix(
    generatedFiles,
    context.projectContext.codePatterns,
    context.projectContext.bestPractices,
    {
      enableESLintFix: true,
      enableAIOptimization: false,
      maxRetries: 2,
    }
  );
  spinner.succeed(`验证完成（得分: ${validation.result.overallScore}/100）`);

  // 显示验证结果
  if (validation.result.stats.totalIssues > 0) {
    console.log();
    if (validation.result.stats.highPriorityIssues > 0) {
      console.log(chalk.red(`  ⚠ 发现 ${validation.result.stats.highPriorityIssues} 个高优先级问题`));
    }
    if (validation.result.stats.mediumPriorityIssues > 0) {
      console.log(chalk.yellow(`  ⚠ 发现 ${validation.result.stats.mediumPriorityIssues} 个中优先级问题`));
    }
    if (validation.result.stats.lowPriorityIssues > 0) {
      console.log(chalk.gray(`  ℹ 发现 ${validation.result.stats.lowPriorityIssues} 个低优先级问题`));
    }
    console.log();
  }

  // ==================== 阶段 9: 写入文件 ====================
  spinner.start('写入文件...');
  const outputPath = await writeFiles(requirement, validation.files);
  spinner.succeed(`文件已写入到: ${outputPath}`);

  // ==================== 阶段 10: 自动注册 ====================
  spinner.start('注册工作流...');
  const registered = await registerWorkflow(requirement);
  if (registered) {
    spinner.succeed('工作流已自动注册');
  } else {
    spinner.warn('自动注册失败，请手动注册');
  }

  // ==================== 阶段 11: 完成提示 ====================
  displayCompletionMessage(requirement, outputPath, registered);
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 初始化上下文
 */
async function initializeContext(spinner: Ora): Promise<CLIContext> {
  spinner.text = '构建项目上下文...';

  const projectContext = await buildProjectContext();

  spinner.text = '初始化 AI 服务...';

  const understandingEngine = new AINeuralUnderstandingEngine();
  const codeGenerator = new AICodeGenerator();
  const validatorOptimizer = new AutoValidatorOptimizer();

  return {
    projectContext,
    understandingEngine,
    codeGenerator,
    validatorOptimizer,
  };
}

/**
 * 生成需求（从自然语言）
 */
async function generateRequirement(
  description: string | undefined,
  interactive: boolean | undefined,
  context: CLIContext,
  spinner: Ora
): Promise<WorkflowRequirement> {
  // 如果没有提供描述，提示用户输入
  if (!description) {
    spinner.stop();
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: '请描述您要创建的工作流:',
        validate: (input: string) => input.trim().length > 0 || '描述不能为空',
      },
    ]);
    description = answers.description;
    spinner.start('AI 正在理解您的需求...');
  }

  // AI 理解需求
  spinner.text = 'AI 正在理解您的需求...';
  const understanding = await context.understandingEngine.understandRequirement(
    description!,
    context.projectContext
  );

  spinner.text = 'AI 正在优化设计...';
  const optimized = await context.understandingEngine.optimizeRequirement(
    understanding.requirement,
    understanding.suggestions,
    context.projectContext
  );

  return optimized.requirement;
}

/**
 * 从规范文件加载
 */
async function loadSpecification(specPath: string, spinner: Ora): Promise<WorkflowRequirement> {
  spinner.text = `加载规范文件: ${specPath}`;

  try {
    const content = await fs.readFile(specPath, 'utf-8');
    const spec = JSON.parse(content);

    // 验证规范
    const validation = validateWorkflowRequirement(spec);
    if (!validation.success) {
      throw new Error(`规范验证失败:\n${validation.errors.join('\n')}`);
    }

    return spec as WorkflowRequirement;
  } catch (error) {
    throw new Error(`加载规范文件失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 保存规范文件
 */
async function saveSpecification(savePath: string, requirement: WorkflowRequirement): Promise<void> {
  const content = JSON.stringify(requirement, null, 2);
  await fs.writeFile(savePath, content, 'utf-8');
}

/**
 * 确认创建
 */
async function confirmCreation(requirement: WorkflowRequirement): Promise<boolean> {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `是否创建工作流 "${requirement.name}"?`,
      default: true,
    },
  ]);

  return answers.confirm;
}

/**
 * 写入文件
 */
async function writeFiles(
  requirement: WorkflowRequirement,
  files: Awaited<ReturnType<AICodeGenerator['generateWorkflow']>>
): Promise<string> {
  // 构建输出路径
  const workflowName = toPascalCase(requirement.type);
  const outputPath = path.join(process.cwd(), 'src', 'domain', 'workflows', workflowName);

  // 创建目录
  await fs.mkdir(outputPath, { recursive: true });

  // 写入状态接口
  if (files.state) {
    await fs.writeFile(path.join(outputPath, `${workflowName}State.ts`), files.state, 'utf-8');
  }

  // 写入节点类
  for (const [nodeName, nodeCode] of files.nodes.entries()) {
    await fs.writeFile(path.join(outputPath, `${nodeName}.ts`), nodeCode, 'utf-8');
  }

  // 写入路由函数
  if (files.routeFunctions) {
    await fs.writeFile(path.join(outputPath, 'routes.ts'), files.routeFunctions, 'utf-8');
  }

  // 写入工作流图
  if (files.graph) {
    await fs.writeFile(path.join(outputPath, `${workflowName}Graph.ts`), files.graph, 'utf-8');
  }

  // 写入工厂类
  if (files.factory) {
    await fs.writeFile(path.join(outputPath, `${workflowName}WorkflowFactory.ts`), files.factory, 'utf-8');
  }

  // 写入导出文件
  if (files.index) {
    await fs.writeFile(path.join(outputPath, 'index.ts'), files.index, 'utf-8');
  }

  return outputPath;
}

/**
 * 注册工作流
 */
async function registerWorkflow(requirement: WorkflowRequirement): Promise<boolean> {
  try {
    // 构建工作流类型
    const workflowName = toPascalCase(requirement.type);
    const importPath = `./workflows/${workflowName}`;

    // 更新 initialize.ts（如果存在）
    const initFilePath = path.join(process.cwd(), 'src', 'domain', 'workflow', 'initialize.ts');

    try {
      let content = await fs.readFile(initFilePath, 'utf-8');

      // 检查是否已经导入
      const importStatement = `import { ${workflowName}WorkflowFactory } from '${importPath}.js';`;
      if (!content.includes(importStatement)) {
        // 在其他导入后添加新导入
        const importIndex = content.lastIndexOf('import ');
        if (importIndex !== -1) {
          const lineEnd = content.indexOf('\n', importIndex);
          content = content.slice(0, lineEnd + 1) + importStatement + '\n' + content.slice(lineEnd + 1);
        }
      }

      // 在 WorkflowRegistry.register 调用中添加注册
      const registerCall = `WorkflowRegistry.register(new ${workflowName}WorkflowFactory());`;
      if (!content.includes(registerCall)) {
        content = content.replace(
          /(WorkflowRegistry\.register\([^)]+\);\s*)/,
          `$1${registerCall}\n    `
        );
      }

      await fs.writeFile(initFilePath, content, 'utf-8');
      return true;
    } catch (error) {
      logger.warn('Failed to register workflow automatically', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  } catch (error) {
    logger.error('Registration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * 显示完成消息
 */
function displayCompletionMessage(
  requirement: WorkflowRequirement,
  outputPath: string,
  registered: boolean
): void {
  console.log();
  console.log(chalk.green.bold('✅ 工作流创建成功！'));
  console.log();

  console.log(chalk.white('📁 文件位置:'));
  console.log(chalk.gray(`   ${outputPath}`));
  console.log();

  console.log(chalk.white('🚀 立即使用:'));
  console.log(chalk.gray(`   pnpm run cli create --type ${requirement.type} --help`));
  console.log();

  if (!registered) {
    console.log(chalk.yellow.bold('⚠️  注意: 需要手动注册工作流'));
    console.log();
    console.log(chalk.white('请在 src/domain/workflow/initialize.ts 中添加:'));
    console.log(chalk.gray(`   import { ${toPascalCase(requirement.type)}WorkflowFactory } from './workflows/${toPascalCase(requirement.type)}';`));
    console.log(chalk.gray(`   WorkflowRegistry.register(new ${toPascalCase(requirement.type)}WorkflowFactory());`));
    console.log();
  }

  console.log(chalk.white('💡 提示:'));
  console.log(chalk.gray('   - 查看工作流列表: pnpm run cli workflow list'));
  console.log(chalk.gray('   - 查看工作流详情: pnpm run cli workflow info ' + requirement.type));
  console.log();
}

/**
 * 错误处理
 */
function handleError(error: Error): void {
  console.error();
  console.error(chalk.red.bold('❌ 错误:'), chalk.red(error.message));
  console.error();

  if (process.env.DEBUG) {
    console.error(chalk.gray('堆栈信息:'));
    console.error(chalk.gray(error.stack));
    console.error();
  }

  logger.error('CLI command failed', error);
}

/**
 * 转换为 PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// ============================================================================
// 导出
// ============================================================================

export default createWorkflowCommand;
