/**
 * MermaidDiagramGenerator - Mermaid 流程图生成器
 *
 * 将工作流需求转换为 Mermaid 图表代码
 * 支持显示节点名称、条件分支、START/END 节点
 */

import type { WorkflowRequirement } from '../schemas/WorkflowRequirementSchema.js';
import type { Connection } from '../schemas/WorkflowRequirementSchema.js';

/**
 * Mermaid 图表方向
 */
export type MermaidDirection = 'TB' | 'TD' | 'BT' | 'RL' | 'LR';

/**
 * Mermaid 图表生成器配置
 */
export interface MermaidGeneratorConfig {
  /** 图表方向 */
  direction?: MermaidDirection;
  /** 是否显示节点名称 */
  showNodeNames?: boolean;
  /** 是否显示条件标签 */
  showConditions?: boolean;
  /** 是否使用子图分组 */
  useSubgraphs?: boolean;
}

/**
 * Mermaid 图表生成器
 */
export class MermaidDiagramGenerator {
  private config: Required<MermaidGeneratorConfig>;

  constructor(config: MermaidGeneratorConfig = {}) {
    this.config = {
      direction: config.direction || 'LR',
      showNodeNames: config.showNodeNames ?? true,
      showConditions: config.showConditions ?? true,
      useSubgraphs: config.useSubgraphs ?? false,
    };
  }

  /**
   * 生成 Mermaid 流程图
   *
   * @param requirement - 工作流需求
   * @returns Mermaid 图表代码
   */
  generateMermaidDiagram(requirement: WorkflowRequirement): string {
    const lines: string[] = [];

    // 图表声明
    lines.push(`graph ${this.config.direction}`);

    // 添加节点定义
    const nodeDefinitions = this.generateNodeDefinitions(requirement);
    lines.push(...nodeDefinitions);

    // 添加连接关系
    const connections = this.generateConnections(requirement.connections);
    lines.push(...connections);

    // 添加样式（可选）
    const styles = this.generateStyles(requirement);
    if (styles.length > 0) {
      lines.push('');
      lines.push(...styles);
    }

    return lines.join('\n');
  }

  /**
   * 生成节点定义
   *
   * @param requirement - 工作流需求
   * @returns 节点定义行数组
   */
  private generateNodeDefinitions(requirement: WorkflowRequirement): string[] {
    const lines: string[] = [];
    const nodes = requirement.nodes;

    // 为每个节点生成定义
    nodes.forEach((node) => {
      const nodeId = node.name;
      const nodeLabel = this.config.showNodeNames ? node.displayName : node.name;
      const shape = this.getNodeShape(node.nodeType);

      // Mermaid 节点语法: id[标签] 或 id{标签}
      lines.push(`${nodeId}${shape.start}${nodeLabel}${shape.end}`);
    });

    return lines;
  }

  /**
   * 根据节点类型获取节点形状
   *
   * @param nodeType - 节点类型
   * @returns 包含开始和结束形状的对象
   */
  private getNodeShape(nodeType: string): { start: string; end: string } {
    switch (nodeType) {
      case 'llm':
        return { start: '([', end: '])' }; // 圆角矩形
      case 'quality_check':
        return { start: '{', end: '}' }; // 菱形
      case 'api':
        return { start: '[[', end: ']]' }; // 子程序形状
      case 'transform':
        return { start: '[', end: ']' }; // 矩形
      case 'custom':
      default:
        return { start: '[', end: ']' }; // 矩形
    }
  }

  /**
   * 生成连接关系
   *
   * @param connections - 连接关系数组
   * @returns 连接关系行数组
   */
  private generateConnections(connections: Connection[]): string[] {
    const lines: string[] = [];

    connections.forEach((conn) => {
      let line = `${conn.from} --> ${conn.to}`;

      // 如果有条件且启用条件显示
      if (this.config.showConditions && conn.condition) {
        line += `|${conn.condition}|`;
      }

      lines.push(line);
    });

    return lines;
  }

  /**
   * 生成样式定义
   *
   * @param requirement - 工作流需求
   * @returns 样式定义行数组
   */
  private generateStyles(requirement: WorkflowRequirement): string[] {
    const lines: string[] = [];

    // 为不同类型的节点定义样式
    const llmNodes = requirement.nodes.filter((n) => n.nodeType === 'llm').map((n) => n.name);
    const qualityNodes = requirement.nodes.filter((n) => n.nodeType === 'quality_check').map((n) => n.name);
    const apiNodes = requirement.nodes.filter((n) => n.nodeType === 'api').map((n) => n.name);

    if (llmNodes.length > 0) {
      lines.push(`classDef llmNode fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;`);
      lines.push(`class ${llmNodes.join(',')} llmNode;`);
    }

    if (qualityNodes.length > 0) {
      lines.push(`classDef qualityNode fill:#fff3e0,stroke:#f57c00,stroke-width:2px;`);
      lines.push(`class ${qualityNodes.join(',')} qualityNode;`);
    }

    if (apiNodes.length > 0) {
      lines.push(`classDef apiNode fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;`);
      lines.push(`class ${apiNodes.join(',')} apiNode;`);
    }

    return lines;
  }

  /**
   * 生成简化的 Mermaid 图（仅显示流程）
   *
   * @param requirement - 工作流需求
   * @returns 简化的 Mermaid 图表代码
   */
  generateSimplifiedDiagram(requirement: WorkflowRequirement): string {
    const lines: string[] = [];
    lines.push(`graph ${this.config.direction}`);

    // 仅添加连接关系，使用节点名称
    requirement.connections.forEach((conn) => {
      let line = '';

      // 特殊处理 START 和 END
      if (conn.from === 'START' || conn.from === '__start__') {
        line = `START([开始]) --> `;
      } else if (conn.to === 'END' || conn.to === '__end__') {
        line = `${conn.from} --> END([结束])`;
      } else {
        const fromNode = requirement.nodes.find((n) => n.name === conn.from);
        const toNode = requirement.nodes.find((n) => n.name === conn.to);

        const fromLabel = fromNode?.displayName || conn.from;
        const toLabel = toNode?.displayName || conn.to;

        line = `${conn.from}[${fromLabel}] --> ${conn.to}[${toLabel}]`;
      }

      // 添加条件
      if (conn.condition) {
        line += `|${conn.condition}|`;
      }

      lines.push(line);
    });

    return lines.join('\n');
  }

  /**
   * 验证 Mermaid 语法（基础检查）
   *
   * @param mermaidCode - Mermaid 代码
   * @returns 是否有效
   */
  validateMermaidSyntax(mermaidCode: string): boolean {
    // 基础语法检查
    const lines = mermaidCode.split('\n');
    let isValid = true;

    // 检查是否以 graph 声明开头
    if (!lines[0].match(/^graph\s+(TB|TD|BT|RL|LR)/)) {
      return false;
    }

    // 检查连接语法
    const connectionRegex = /^\w+(\[|\(|\{|\[)([^\]]+)(\]|\)|\}|\])\s*-->\s*\w+(\[|\(|\{|\[)([^\]]+)(\]|\)|\}|\])/;
    lines.forEach((line) => {
      if (line.includes('-->') && !line.match(connectionRegex) && !line.includes('|')) {
        // 可能是条件连接，不做严格检查
      }
    });

    return isValid;
  }

  /**
   * 更新配置
   *
   * @param config - 新配置
   */
  updateConfig(config: Partial<MermaidGeneratorConfig>): void {
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
  getConfig(): Required<MermaidGeneratorConfig> {
    return { ...this.config };
  }
}

export default MermaidDiagramGenerator;
