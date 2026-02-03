/**
 * DataFlowDiagramGenerator - 数据流图生成器
 *
 * 生成显示数据流动的文本图表
 * 包括输入参数、节点处理、输出结果
 */

import type { ParamDefinition } from '../schemas/WorkflowRequirementSchema.js';
import type { NodeDesign } from '../schemas/WorkflowRequirementSchema.js';

/**
 * 数据流图配置
 */
export interface DataFlowConfig {
  /** 是否显示类型信息 */
  showTypes?: boolean;
  /** 是否显示示例值 */
  showExamples?: boolean;
  /** 是否显示必需标记 */
  showRequired?: boolean;
  /** 框线样式 */
  borderStyle?: 'single' | 'double' | 'dashed';
}

/**
 * 数据流图生成器
 */
export class DataFlowDiagramGenerator {
  private config: Required<DataFlowConfig>;

  constructor(config: DataFlowConfig = {}) {
    this.config = {
      showTypes: config.showTypes ?? true,
      showExamples: config.showExamples ?? false,
      showRequired: config.showRequired ?? true,
      borderStyle: config.borderStyle || 'single',
    };
  }

  /**
   * 生成数据流图
   *
   * @param inputParams - 输入参数数组
   * @param nodes - 节点数组
   * @param outputFields - 输出字段数组
   * @returns 数据流图字符串
   */
  generateDataFlowDiagram(
    inputParams: ParamDefinition[],
    nodes: NodeDesign[],
    outputFields: string[]
  ): string {
    const sections: string[] = [];

    // 输入参数部分
    sections.push(this.generateInputSection(inputParams));

    // 节点处理部分
    sections.push(this.generateProcessingSection(nodes));

    // 输出结果部分
    sections.push(this.generateOutputSection(outputFields));

    return sections.join('\n\n');
  }

  /**
   * 生成输入参数部分
   *
   * @param inputParams - 输入参数数组
   * @returns 输入参数字符串
   */
  private generateInputSection(inputParams: ParamDefinition[]): string {
    const lines: string[] = [];

    lines.push(this.generateSectionHeader('输入参数'));
    lines.push('');

    if (inputParams.length === 0) {
      lines.push('  (无输入参数)');
    } else {
      inputParams.forEach((param) => {
        const parts: string[] = [];

        // 参数名
        parts.push(`• ${param.name}`);

        // 类型
        if (this.config.showTypes) {
          parts.push(`(${param.type})`);
        }

        // 必需标记
        if (this.config.showRequired) {
          parts.push(param.required ? '*' : '');
        }

        // 描述
        parts.push(`: ${param.description}`);

        // 默认值
        if (param.defaultValue !== undefined) {
          parts.push(` [默认: ${JSON.stringify(param.defaultValue)}]`);
        }

        // 示例
        if (this.config.showExamples && param.examples && param.examples.length > 0) {
          parts.push(` (示例: ${param.examples.map((e) => JSON.stringify(e)).join(', ')})`);
        }

        lines.push(`  ${parts.join(' ')}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * 生成节点处理部分
   *
   * @param nodes - 节点数组
   * @returns 节点处理字符串
   */
  private generateProcessingSection(nodes: NodeDesign[]): string {
    const lines: string[] = [];

    lines.push(this.generateSectionHeader('节点处理'));
    lines.push('');

    if (nodes.length === 0) {
      lines.push('  (无处理节点)');
    } else {
      nodes.forEach((node) => {
        lines.push(`  ${node.displayName} (${node.name})`);

        // 节点类型
        lines.push(`    类型: ${this.translateNodeType(node.nodeType)}`);

        // 节点特性
        const features: string[] = [];
        if (node.useLLM) {
          features.push('使用 LLM');
        }
        if (node.enableQualityCheck) {
          features.push('包含质检');
        }
        if (node.timeout) {
          features.push(`超时: ${node.timeout / 1000}s`);
        }
        if (features.length > 0) {
          lines.push(`    特性: ${features.join(', ')}`);
        }

        // 依赖
        if (node.dependencies.length > 0) {
          lines.push(`    依赖: ${node.dependencies.join(', ')}`);
        }

        lines.push('');
      });
    }

    return lines.join('\n');
  }

  /**
   * 生成输出结果部分
   *
   * @param outputFields - 输出字段数组
   * @returns 输出结果字符串
   */
  private generateOutputSection(outputFields: string[]): string {
    const lines: string[] = [];

    lines.push(this.generateSectionHeader('输出结果'));
    lines.push('');

    if (outputFields.length === 0) {
      lines.push('  (无输出字段)');
    } else {
      outputFields.forEach((field) => {
        lines.push(`  • ${field}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * 生成章节标题
   *
   * @param title - 标题
   * @returns 标题字符串
   */
  private generateSectionHeader(title: string): string {
    const borderChars = this.getBorderChars();
    const padding = 2;
    const totalWidth = title.length + padding * 2;

    return `${borderChars.horizontal.repeat(totalWidth)}
${borderChars.vertical}${' '.repeat(padding)}${title}${' '.repeat(padding)}${borderChars.vertical}
${borderChars.horizontal.repeat(totalWidth)}`;
  }

  /**
   * 获取边框字符
   *
   * @returns 边框字符对象
   */
  private getBorderChars() {
    switch (this.config.borderStyle) {
      case 'double':
        return {
          horizontal: '═',
          vertical: '║',
          corner: '╬',
        };
      case 'dashed':
        return {
          horizontal: '─',
          vertical: '│',
          corner: '┼',
        };
      case 'single':
      default:
        return {
          horizontal: '─',
          vertical: '│',
          corner: '┼',
        };
    }
  }

  /**
   * 翻译节点类型
   *
   * @param nodeType - 节点类型
   * @returns 翻译后的类型
   */
  private translateNodeType(nodeType: string): string {
    const translations: Record<string, string> = {
      llm: 'LLM 调用',
      api: 'API 调用',
      transform: '数据转换',
      quality_check: '质量检查',
      custom: '自定义处理',
    };
    return translations[nodeType] || nodeType;
  }

  /**
   * 生成简化的数据流图
   *
   * @param inputParams - 输入参数数组
   * @param nodes - 节点数组
   * @param outputFields - 输出字段数组
   * @returns 简化的数据流图字符串
   */
  generateSimplifiedDiagram(
    inputParams: ParamDefinition[],
    nodes: NodeDesign[],
    outputFields: string[]
  ): string {
    const lines: string[] = [];

    lines.push('📥 输入');
    inputParams.forEach((param) => {
      lines.push(`  ${param.name}${param.required ? '*' : ''}`);
    });

    lines.push('');
    lines.push('⚙️  处理');
    nodes.forEach((node) => {
      lines.push(`  ${node.displayName}`);
    });

    lines.push('');
    lines.push('📤 输出');
    outputFields.forEach((field) => {
      lines.push(`  ${field}`);
    });

    return lines.join('\n');
  }

  /**
   * 更新配置
   *
   * @param config - 新配置
   */
  updateConfig(config: Partial<DataFlowConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * 获取当前配置
   *
   * @returns 当前配置
   */
  getConfig(): Required<DataFlowConfig> {
    return { ...this.config };
  }
}

export default DataFlowDiagramGenerator;
