/**
 * NodeTableGenerator - 节点关系表生成器
 *
 * 生成 ASCII 表格显示节点信息
 * 包括节点名称、类型、超时、依赖等
 */

import type { NodeDesign } from '../schemas/WorkflowRequirementSchema.js';
import type { Connection } from '../schemas/WorkflowRequirementSchema.js';

/**
 * 表格列配置
 */
export interface TableColumn {
  /** 列标题 */
  header: string;
  /** 列宽度 */
  width: number;
  /** 对齐方式 */
  align: 'left' | 'center' | 'right';
  /** 获取值的函数 */
  getValue: (node: NodeDesign, allNodes: NodeDesign[]) => string;
}

/**
 * 节点表生成器配置
 */
export interface NodeTableConfig {
  /** 自定义列配置 */
  columns?: TableColumn[];
  /** 是否显示边框 */
  showBorder?: boolean;
  /** 是否显示表头 */
  showHeader?: boolean;
  /** 是否显示行号 */
  showRowNumbers?: boolean;
}

/**
 * 节点关系表生成器
 */
export class NodeTableGenerator {
  private config: Required<NodeTableConfig>;

  constructor(config: NodeTableConfig = {}) {
    this.config = {
      columns: config.columns || this.getDefaultColumns(),
      showBorder: config.showBorder ?? true,
      showHeader: config.showHeader ?? true,
      showRowNumbers: config.showRowNumbers ?? false,
    };
  }

  /**
   * 生成节点关系表
   *
   * @param nodes - 节点数组
   * @param connections - 连接关系数组
   * @returns ASCII 表格字符串
   */
  generateNodeTable(nodes: NodeDesign[], connections: Connection[]): string {
    if (nodes.length === 0) {
      return 'No nodes to display.';
    }

    // 构建依赖关系映射
    const dependencies = this.buildDependenciesMap(nodes, connections);

    // 生成表格数据
    const tableData = nodes.map((node) => {
      const row: string[] = [];

      // 添加行号（如果启用）
      if (this.config.showRowNumbers) {
        const idx = nodes.indexOf(node) + 1;
        row.push(idx.toString());
      }

      // 添加每列的值
      this.config.columns.forEach((col) => {
        row.push(col.getValue(node, nodes));
      });

      return row;
    });

    // 计算列宽
    const columnWidths = this.calculateColumnWidths(tableData);

    // 生成表格
    return this.renderTable(tableData, columnWidths);
  }

  /**
   * 构建依赖关系映射
   *
   * @param nodes - 节点数组
   * @param connections - 连接关系数组
   * @returns 依赖关系映射
   */
  private buildDependenciesMap(nodes: NodeDesign[], connections: Connection[]): Map<string, string[]> {
    const dependencies = new Map<string, string[]>();

    // 初始化
    nodes.forEach((node) => {
      dependencies.set(node.name, []);
    });

    // 从连接关系中提取依赖
    connections.forEach((conn) => {
      if (conn.from !== 'START' && conn.from !== '__start__') {
        const currentDeps = dependencies.get(conn.to) || [];
        if (!currentDeps.includes(conn.from)) {
          currentDeps.push(conn.from);
        }
        dependencies.set(conn.to, currentDeps);
      }
    });

    return dependencies;
  }

  /**
   * 计算列宽
   *
   * @param tableData - 表格数据
   * @returns 列宽数组
   */
  private calculateColumnWidths(tableData: string[][]): number[] {
    const widths: number[] = [];

    // 初始化为表头宽度
    if (this.config.showHeader) {
      this.config.columns.forEach((col, idx) => {
        widths[idx] = Math.max(widths[idx] || 0, col.header.length);
      });

      // 如果有行号列
      if (this.config.showRowNumbers) {
        widths.unshift(4); // 行号列宽度
      }
    }

    // 根据数据调整宽度
    tableData.forEach((row) => {
      row.forEach((cell, idx) => {
        widths[idx] = Math.max(widths[idx] || 0, cell.length);
      });
    });

    // 确保最小宽度
    return widths.map((w) => Math.max(w, 8));
  }

  /**
   * 渲染表格
   *
   * @param tableData - 表格数据
   * @param columnWidths - 列宽数组
   * @returns 表格字符串
   */
  private renderTable(tableData: string[][], columnWidths: number[]): string {
    const lines: string[] = [];

    // 生成分隔线
    const separator = this.generateSeparator(columnWidths);

    // 添加上边框
    if (this.config.showBorder) {
      lines.push(separator);
    }

    // 添加表头
    if (this.config.showHeader) {
      const headers: string[] = [];

      // 行号表头
      if (this.config.showRowNumbers) {
        headers.push(this.padCell('#', columnWidths[0], 'center'));
      }

      // 列表头
      this.config.columns.forEach((col, idx) => {
        const widthIdx = this.config.showRowNumbers ? idx + 1 : idx;
        headers.push(this.padCell(col.header, columnWidths[widthIdx], col.align));
      });

      lines.push(`│ ${headers.join(' │ ')} │`);

      // 添加表头分隔线
      if (this.config.showBorder) {
        lines.push(this.generateSeparator(columnWidths, '━'));
      }
    }

    // 添加数据行
    tableData.forEach((row) => {
      const cells: string[] = [];

      // 行号
      if (this.config.showRowNumbers) {
        cells.push(this.padCell(row[0], columnWidths[0], 'center'));
      }

      // 数据单元格
      row.forEach((cell, idx) => {
        const widthIdx = this.config.showRowNumbers ? idx + 1 : idx;
        const align = this.config.columns[idx]?.align || 'left';
        cells.push(this.padCell(cell, columnWidths[widthIdx], align));
      });

      lines.push(`│ ${cells.join(' │ ')} │`);
    });

    // 添加下边框
    if (this.config.showBorder) {
      lines.push(separator);
    }

    return lines.join('\n');
  }

  /**
   * 生成分隔线
   *
   * @param columnWidths - 列宽数组
   * @param style - 分隔线样式
   * @returns 分隔线字符串
   */
  private generateSeparator(columnWidths: number[], style: string = '─'): string {
    const parts = columnWidths.map((width) => style.repeat(width + 2));
    return `├${parts.join('┼')}┤`;
  }

  /**
   * 填充单元格内容
   *
   * @param content - 内容
   * @param width - 宽度
   * @param align - 对齐方式
   * @returns 填充后的字符串
   */
  private padCell(content: string, width: number, align: 'left' | 'center' | 'right'): string {
    if (content.length >= width) {
      return content.substring(0, width);
    }

    const padding = width - content.length;

    switch (align) {
      case 'center':
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
      case 'right':
        return ' '.repeat(padding) + content;
      case 'left':
      default:
        return content + ' '.repeat(padding);
    }
  }

  /**
   * 获取默认列配置
   *
   * @returns 默认列配置
   */
  private getDefaultColumns(): TableColumn[] {
    return [
      {
        header: '节点名称',
        width: 20,
        align: 'left',
        getValue: (node) => node.displayName,
      },
      {
        header: '类型',
        width: 12,
        align: 'center',
        getValue: (node) => this.translateNodeType(node.nodeType),
      },
      {
        header: '超时',
        width: 10,
        align: 'center',
        getValue: (node) => `${node.timeout / 1000}s`,
      },
      {
        header: '依赖',
        width: 20,
        align: 'left',
        getValue: (node, allNodes) => {
          if (node.dependencies.length === 0) {
            return '-';
          }
          return node.dependencies.join(', ');
        },
      },
      {
        header: '特性',
        width: 15,
        align: 'left',
        getValue: (node) => {
          const features: string[] = [];
          if (node.useLLM) features.push('LLM');
          if (node.enableQualityCheck) features.push('质检');
          return features.join(', ') || '-';
        },
      },
    ];
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
  updateConfig(config: Partial<NodeTableConfig>): void {
    if (config.columns) {
      this.config.columns = config.columns;
    }
    if (config.showBorder !== undefined) {
      this.config.showBorder = config.showBorder;
    }
    if (config.showHeader !== undefined) {
      this.config.showHeader = config.showHeader;
    }
    if (config.showRowNumbers !== undefined) {
      this.config.showRowNumbers = config.showRowNumbers;
    }
  }

  /**
   * 生成简化的节点表（仅关键信息）
   *
   * @param nodes - 节点数组
   * @param connections - 连接关系数组
   * @returns 简化的表格字符串
   */
  generateSimplifiedTable(nodes: NodeDesign[], connections: Connection[]): string {
    const simplifiedConfig: NodeTableConfig = {
      columns: [
        {
          header: '节点',
          width: 15,
          align: 'left',
          getValue: (node) => node.displayName,
        },
        {
          header: '类型',
          width: 8,
          align: 'center',
          getValue: (node) => this.translateNodeType(node.nodeType),
        },
      ],
      showBorder: true,
      showHeader: true,
      showRowNumbers: false,
    };

    const generator = new NodeTableGenerator(simplifiedConfig);
    return generator.generateNodeTable(nodes, connections);
  }
}

export default NodeTableGenerator;
