/**
 * WorkflowParameterMapper - 工作流参数映射器
 *
 * 负责将 CLI 选项映射为工作流参数，提供：
 * - 动态参数验证
 * - 类型转换
 * - 友好的错误提示
 * - 使用示例生成
 */

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
      let cliValue = cliOptions[kebabName];

      // 如果没有找到 kebab-case 格式的选项，尝试查找 camelCase 格式的选项
      if (cliValue === undefined) {
        cliValue = cliOptions[name];
      }

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

/**
 * 单例实例
 */
export const workflowParameterMapper = new WorkflowParameterMapper();
