/**
 * CLI Workflow Commands
 *
 * 工作流管理命令：list 和 info
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { WorkflowRegistry, getWorkflowMetadata } from '../../../domain/workflow/WorkflowRegistry.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';
import { printSeparator } from '../utils/formatter.js';

const logger = createLogger('CLI:Workflow');

// 创建 workflow 主命令
export const workflowCommand = new Command('workflow')
  .description('工作流管理命令');

// ============================================================
// workflow list 子命令
// ============================================================
workflowCommand
  .command('list')
  .description('列出所有已注册的工作流')
  .option('-c, --category <category>', '按分类过滤')
  .option('-t, --tag <tag>', '按标签过滤（可多次使用）', [])
  .option('--json', '以 JSON 格式输出')
  .action(async (options) => {
    try {
      // 检查 WorkflowRegistry 是否已初始化
      if (!WorkflowRegistry.isInitialized()) {
        console.log(chalk.yellow('⚠️  工作流注册表尚未初始化'));
        console.log(chalk.gray('正在检查已注册的工作流...\n'));
      }

      // 获取工作流元数据列表
      let metadatas: ReturnType<typeof WorkflowRegistry.listWorkflows>;

      if (options.category || (options.tag && options.tag.length > 0)) {
        // 使用过滤条件
        const tags = Array.isArray(options.tag) ? options.tag : [options.tag];
        metadatas = WorkflowRegistry.listWorkflows({
          category: options.category,
          tags: tags.length > 0 ? tags : undefined,
        });
      } else {
        // 获取所有工作流
        metadatas = WorkflowRegistry.listWorkflows();
      }

      // JSON 格式输出
      if (options.json) {
        console.log(JSON.stringify(metadatas, null, 2));
        process.exit(0);
      }

      // 文本格式输出
      printSeparator();
      console.log(chalk.bold.blue('📋 已注册的工作流列表'));
      printSeparator();

      if (metadatas.length === 0) {
        console.log(chalk.yellow('暂无已注册的工作流'));
        console.log();
        console.log(chalk.white('💡 提示：工作流需要在应用启动时注册'));
        console.log();
        process.exit(0);
      }

      // 使用简单的文本列表格式（与其他命令保持一致）
      metadatas.forEach((metadata, index) => {
        console.log(chalk.bold.white(`${index + 1}. ${metadata.name}`));
        console.log(chalk.gray(`   类型:        ${metadata.type}`));
        console.log(chalk.gray(`   版本:        ${metadata.version}`));
        console.log(chalk.gray(`   分类:        ${metadata.category || chalk.gray('未分类')}`));
        console.log(chalk.gray(`   描述:        ${metadata.description}`));

        // 显示标签
        if (metadata.tags && metadata.tags.length > 0) {
          console.log(chalk.gray(`   标签:        ${metadata.tags.join(', ')}`));
        }

        console.log();
      });

      // 统计信息
      console.log(chalk.white(`总计: ${chalk.bold(metadatas.length)} 个工作流`));

      // 显示过滤条件（如果有）
      if (options.category) {
        console.log(chalk.gray(`分类过滤: ${options.category}`));
      }
      if (options.tag && options.tag.length > 0) {
        console.log(chalk.gray(`标签过滤: ${Array.isArray(options.tag) ? options.tag.join(', ') : options.tag}`));
      }

      console.log();
      console.log(chalk.white('💡 查看工作流详情：'));
      console.log(chalk.gray('  pnpm run cli workflow info <工作流类型>'));
      console.log();

      logger.info('Listed workflows', {
        count: metadatas.length,
        filters: {
          category: options.category,
          tags: options.tag,
        },
      });

      process.exit(0);
    } catch (error) {
      logger.error('Failed to list workflows', error as Error);
      console.error(chalk.red('❌ 列出工作流失败：'), (error as Error).message);
      process.exit(1);
    }
  });

// ============================================================
// workflow info 子命令
// ============================================================
workflowCommand
  .command('info')
  .description('显示指定工作流的详细信息')
  .argument('<type>', '工作流类型（如：content-creator, translation）')
  .option('--json', '以 JSON 格式输出')
  .action(async (type: string, options) => {
    try {
      // 检查工作流是否存在
      if (!WorkflowRegistry.has(type)) {
        console.error(chalk.red(`❌ 错误: 未找到工作流类型 "${type}"`));
        console.log();
        console.log(chalk.white('💡 可用的工作流类型：'));

        const availableTypes = WorkflowRegistry.listWorkflowTypes();
        if (availableTypes.length > 0) {
          availableTypes.forEach((availableType) => {
            console.log(chalk.gray(`  - ${availableType}`));
          });
        } else {
          console.log(chalk.gray('  （暂无已注册的工作流）'));
        }

        console.log();
        console.log(chalk.white('使用以下命令查看所有工作流：'));
        console.log(chalk.gray('  pnpm run cli workflow list'));
        console.log();
        process.exit(1);
      }

      // 获取工作流元数据
      const metadata = getWorkflowMetadata(type);

      // JSON 格式输出
      if (options.json) {
        console.log(JSON.stringify(metadata, null, 2));
        process.exit(0);
      }

      // 文本格式输出
      printSeparator();
      console.log(chalk.bold.blue('📄 工作流详细信息'));
      printSeparator();

      // 基本信息
      console.log(chalk.white.bold('🏷️  基本信息'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.white(`类型:        ${chalk.cyan(metadata.type)}`));
      console.log(chalk.white(`名称:        ${chalk.green(metadata.name)}`));
      console.log(chalk.white(`版本:        ${chalk.yellow(metadata.version)}`));
      console.log(chalk.white(`分类:        ${metadata.category || chalk.gray('未分类')}`));
      console.log(chalk.white(`描述:        ${metadata.description}`));

      // 额外信息
      if (metadata.author) {
        console.log(chalk.white(`作者:        ${metadata.author}`));
      }
      if (metadata.createdAt) {
        console.log(chalk.white(`创建时间:    ${metadata.createdAt}`));
      }
      if (metadata.docsUrl) {
        console.log(chalk.white(`文档链接:    ${metadata.docsUrl}`));
      }
      console.log();

      // 标签
      if (metadata.tags && metadata.tags.length > 0) {
        console.log(chalk.white.bold('🏷️  标签'));
        console.log(chalk.gray('─'.repeat(60)));
        metadata.tags.forEach((tag) => {
          console.log(chalk.gray(`  • ${tag}`));
        });
        console.log();
      }

      // 参数信息
      if (metadata.requiredParams && metadata.requiredParams.length > 0) {
        console.log(chalk.white.bold('✅ 必需参数'));
        console.log(chalk.gray('─'.repeat(60)));
        metadata.requiredParams.forEach((param) => {
          console.log(chalk.cyan(`  • ${param}`));
        });
        console.log();
      }

      if (metadata.optionalParams && metadata.optionalParams.length > 0) {
        console.log(chalk.white.bold('⚙️  可选参数'));
        console.log(chalk.gray('─'.repeat(60)));
        metadata.optionalParams.forEach((param) => {
          console.log(chalk.gray(`  • ${param}`));
        });
        console.log();
      }

      // 使用示例
      if (metadata.examples && metadata.examples.length > 0) {
        console.log(chalk.white.bold('📝 使用示例'));
        console.log(chalk.gray('─'.repeat(60)));

        metadata.examples.forEach((example, index) => {
          console.log(chalk.bold.white(`\n${index + 1}. ${example.name}`));
          console.log(chalk.gray(`   ${example.description}`));

          // 显示示例参数（格式化输出）
          console.log(chalk.gray('   参数:'));
          Object.entries(example.params).forEach(([key, value]) => {
            const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
            console.log(chalk.gray(`     ${key}: ${displayValue}`));
          });
        });
        console.log();
      }

      // CLI 使用提示
      console.log(chalk.white.bold('💡 CLI 使用示例'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.white(`使用此工作流创建任务：`));

      // 根据工作流类型生成不同的示例命令
      if (type === 'content-creator') {
        console.log(chalk.gray('  pnpm run cli create --type content-creator --topic "主题" --requirements "要求"'));
      } else if (type === 'translation') {
        console.log(chalk.gray('  # 翻译工作流需要通过程序接口调用'));
        console.log(chalk.gray('  # 请参考文档或示例代码'));
      } else {
        console.log(chalk.gray(`  pnpm run cli create --type ${type} [其他参数]`));
      }

      console.log();

      logger.info('Displayed workflow info', {
        workflowType: type,
        workflowName: metadata.name,
      });

      process.exit(0);
    } catch (error) {
      logger.error('Failed to display workflow info', error as Error);
      console.error(chalk.red('❌ 显示工作流信息失败：'), (error as Error).message);
      process.exit(1);
    }
  });
