/**
 * VisualizationPreviewSystem - 可视化预览系统集成
 *
 * 集成所有可视化组件，提供统一的预览接口
 * 使用 chalk 美化终端输出
 */

import chalk from 'chalk';
import type { WorkflowRequirement } from '../schemas/WorkflowRequirementSchema.js';
import { MermaidDiagramGenerator } from './MermaidDiagramGenerator.js';
import { NodeTableGenerator } from './NodeTableGenerator.js';
import { DataFlowDiagramGenerator } from './DataFlowDiagramGenerator.js';

/**
 * 预览系统配置
 */
export interface PreviewSystemConfig {
  /** 是否显示 Mermaid 图 */
  showMermaid?: boolean;
  /** 是否显示节点表 */
  showNodeTable?: boolean;
  /** 是否显示数据流图 */
  showDataFlow?: boolean;
  /** 是否使用颜色 */
  useColors?: boolean;
  /** Mermaid 生成器配置 */
  mermaidConfig?: Parameters<MermaidDiagramGenerator['constructor']>[0];
  /** 节点表配置 */
  nodeTableConfig?: Parameters<NodeTableGenerator['constructor']>[0];
  /** 数据流图配置 */
  dataFlowConfig?: Parameters<DataFlowDiagramGenerator['constructor']>[0];
}

/**
 * 可视化预览系统
 */
export class VisualizationPreviewSystem {
  private config: Required<Omit<PreviewSystemConfig, 'mermaidConfig' | 'nodeTableConfig' | 'dataFlowConfig'>>;
  private mermaidGenerator: MermaidDiagramGenerator;
  private nodeTableGenerator: NodeTableGenerator;
  private dataFlowGenerator: DataFlowDiagramGenerator;

  constructor(config: PreviewSystemConfig = {}) {
    this.config = {
      showMermaid: config.showMermaid ?? true,
      showNodeTable: config.showNodeTable ?? true,
      showDataFlow: config.showDataFlow ?? true,
      useColors: config.useColors ?? true,
    };

    this.mermaidGenerator = new MermaidDiagramGenerator(config.mermaidConfig);
    this.nodeTableGenerator = new NodeTableGenerator(config.nodeTableConfig);
    this.dataFlowGenerator = new DataFlowDiagramGenerator(config.dataFlowConfig);
  }

  /**
   * 显示完整预览
   *
   * @param requirement - 工作流需求
   * @returns Promise<void>
   */
  async displayPreview(requirement: WorkflowRequirement): Promise<void> {
    const sections: string[] = [];

    // 标题
    sections.push(this.generateTitle());

    // 基本信息
    sections.push(this.generateBasicInfo(requirement));
    sections.push('');

    // Mermaid 流程图
    if (this.config.showMermaid) {
      sections.push(this.generateMermaidSection(requirement));
      sections.push('');
    }

    // 节点列表
    if (this.config.showNodeTable) {
      sections.push(this.generateNodeTableSection(requirement));
      sections.push('');
    }

    // 数据流图
    if (this.config.showDataFlow) {
      sections.push(this.generateDataFlowSection(requirement));
      sections.push('');
    }

    // 配置信息
    sections.push(this.generateConfigSection(requirement));

    // 输出
    console.log(sections.join('\n'));
  }

  /**
   * 生成标题
   *
   * @returns 标题字符串
   */
  private generateTitle(): string {
    const title = '📊 工作流预览';
    const line = '═'.repeat(50);

    if (this.config.useColors) {
      return chalk.cyan.bold(`${title}\n${line}`);
    }
    return `${title}\n${line}`;
  }

  /**
   * 生成分隔线
   *
   * @param title - 小节标题
   * @returns 分隔线字符串
   */
  private generateSection(title: string): string {
    const line = '─'.repeat(50);
    return `${line}\n${title}\n${line}`;
  }

  /**
   * 生成基本信息部分
   *
   * @param requirement - 工作流需求
   * @returns 基本信息字符串
   */
  private generateBasicInfo(requirement: WorkflowRequirement): string {
    const lines: string[] = [];

    lines.push(this.generateSection('基本信息'));
    lines.push('');

    const info = [
      { label: '类型', value: requirement.type },
      { label: '名称', value: requirement.name },
      { label: '分类', value: this.translateCategory(requirement.category) },
      { label: '描述', value: requirement.description },
      { label: '节点数', value: requirement.nodes.length.toString() },
      { label: '连接数', value: requirement.connections.length.toString() },
    ];

    if (requirement.tags.length > 0) {
      info.push({ label: '标签', value: requirement.tags.join(', ') });
    }

    const maxLabelLength = Math.max(...info.map((i) => i.label.length));

    info.forEach((item) => {
      const paddedLabel = item.label.padEnd(maxLabelLength);
      let line = `  ${paddedLabel}: ${item.value}`;

      if (this.config.useColors) {
        line = chalk.white(line);
        if (item.label === '类型' || item.label === '名称') {
          line = chalk.green(line);
        }
      }

      lines.push(line);
    });

    return lines.join('\n');
  }

  /**
   * 生成 Mermaid 流程图部分
   *
   * @param requirement - 工作流需求
   * @returns Mermaid 部分字符串
   */
  private generateMermaidSection(requirement: WorkflowRequirement): string {
    const lines: string[] = [];

    lines.push(this.generateSection('Mermaid 流程图'));
    lines.push('');

    const mermaidCode = this.mermaidGenerator.generateMermaidDiagram(requirement);

    // 添加代码块标记
    lines.push('```mermaid');
    lines.push(mermaidCode);
    lines.push('```');

    if (this.config.useColors) {
      return chalk.gray(lines.join('\n'));
    }
    return lines.join('\n');
  }

  /**
   * 生成节点表部分
   *
   * @param requirement - 工作流需求
   * @returns 节点表字符串
   */
  private generateNodeTableSection(requirement: WorkflowRequirement): string {
    const lines: string[] = [];

    lines.push(this.generateSection('节点列表'));
    lines.push('');

    const table = this.nodeTableGenerator.generateNodeTable(
      requirement.nodes,
      requirement.connections
    );

    lines.push(table);

    if (this.config.useColors) {
      return chalk.white(lines.join('\n'));
    }
    return lines.join('\n');
  }

  /**
   * 生成数据流图部分
   *
   * @param requirement - 工作流需求
   * @returns 数据流图字符串
   */
  private generateDataFlowSection(requirement: WorkflowRequirement): string {
    const lines: string[] = [];

    lines.push(this.generateSection('数据流'));
    lines.push('');

    const dataFlow = this.dataFlowGenerator.generateDataFlowDiagram(
      requirement.inputParams,
      requirement.nodes,
      requirement.outputFields
    );

    lines.push(dataFlow);

    if (this.config.useColors) {
      return chalk.white(lines.join('\n'));
    }
    return lines.join('\n');
  }

  /**
   * 生成配置信息部分
   *
   * @param requirement - 工作流需求
   * @returns 配置信息字符串
   */
  private generateConfigSection(requirement: WorkflowRequirement): string {
    const lines: string[] = [];

    lines.push(this.generateSection('配置'));
    lines.push('');

    const configs = [
      { label: '质量检查', value: requirement.enableQualityCheck ? '启用' : '禁用' },
      { label: '最大重试', value: requirement.maxRetries.toString() },
      { label: '检查点', value: requirement.enableCheckpoint ? '启用' : '禁用' },
    ];

    const maxLabelLength = Math.max(...configs.map((c) => c.label.length));

    configs.forEach((config) => {
      const paddedLabel = config.label.padEnd(maxLabelLength);
      let line = `  ${paddedLabel}: ${config.value}`;

      if (this.config.useColors) {
        if (config.value === '启用') {
          line = chalk.green(line);
        } else if (config.value === '禁用') {
          line = chalk.red(line);
        } else {
          line = chalk.white(line);
        }
      }

      lines.push(line);
    });

    return lines.join('\n');
  }

  /**
   * 翻译工作流分类
   *
   * @param category - 分类
   * @returns 翻译后的分类
   */
  private translateCategory(category: string): string {
    const translations: Record<string, string> = {
      content: '内容创作',
      translation: '翻译',
      analysis: '分析',
      automation: '自动化',
      other: '其他',
    };
    return translations[category] || category;
  }

  /**
   * 生成简化预览（仅关键信息）
   *
   * @param requirement - 工作流需求
   * @returns 简化预览字符串
   */
  generateSimplifiedPreview(requirement: WorkflowRequirement): string {
    const sections: string[] = [];

    sections.push(chalk.cyan.bold(`\n📋 ${requirement.name}\n`));
    sections.push(chalk.gray(requirement.description));
    sections.push('');
    sections.push(chalk.white('节点:'));
    requirement.nodes.forEach((node) => {
      sections.push(`  • ${node.displayName} (${this.translateNodeType(node.nodeType)})`);
    });

    return sections.join('\n');
  }

  /**
   * 翻译节点类型
   *
   * @param nodeType - 节点类型
   * @returns 翻译后的类型
   */
  private translateNodeType(nodeType: string): string {
    const translations: Record<string, string> = {
      llm: 'LLM',
      api: 'API',
      transform: '转换',
      quality_check: '质检',
      custom: '自定义',
    };
    return translations[nodeType] || nodeType;
  }

  /**
   * 更新配置
   *
   * @param config - 新配置
   */
  updateConfig(config: Partial<PreviewSystemConfig>): void {
    if (config.showMermaid !== undefined) {
      this.config.showMermaid = config.showMermaid;
    }
    if (config.showNodeTable !== undefined) {
      this.config.showNodeTable = config.showNodeTable;
    }
    if (config.showDataFlow !== undefined) {
      this.config.showDataFlow = config.showDataFlow;
    }
    if (config.useColors !== undefined) {
      this.config.useColors = config.useColors;
    }
  }

  /**
   * 获取 Mermaid 生成器
   *
   * @returns Mermaid 生成器
   */
  getMermaidGenerator(): MermaidDiagramGenerator {
    return this.mermaidGenerator;
  }

  /**
   * 获取节点表生成器
   *
   * @returns 节点表生成器
   */
  getNodeTableGenerator(): NodeTableGenerator {
    return this.nodeTableGenerator;
  }

  /**
   * 获取数据流图生成器
   *
   * @returns 数据流图生成器
   */
  getDataFlowGenerator(): DataFlowDiagramGenerator {
    return this.dataFlowGenerator;
  }

  /**
   * 导出 Mermaid 代码
   *
   * @param requirement - 工作流需求
   * @returns Mermaid 代码
   */
  exportMermaidCode(requirement: WorkflowRequirement): string {
    return this.mermaidGenerator.generateMermaidDiagram(requirement);
  }
}

export default VisualizationPreviewSystem;
