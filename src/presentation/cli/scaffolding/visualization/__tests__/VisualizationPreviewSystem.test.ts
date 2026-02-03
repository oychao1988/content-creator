/**
 * VisualizationPreviewSystem Tests
 *
 * 测试可视化预览系统组件
 */

import { describe, it, expect } from 'vitest';
import { MermaidDiagramGenerator } from '../MermaidDiagramGenerator.js';
import { NodeTableGenerator } from '../NodeTableGenerator.js';
import { DataFlowDiagramGenerator } from '../DataFlowDiagramGenerator.js';
import { VisualizationPreviewSystem } from '../VisualizationPreviewSystem.js';
import type { WorkflowRequirement } from '../../schemas/WorkflowRequirementSchema.js';

// 测试数据
const mockRequirement: WorkflowRequirement = {
  type: 'text-summarizer',
  name: '文本摘要工作流',
  description: '使用 LLM 对输入文本进行摘要处理，支持自定义摘要长度',
  category: 'content',
  tags: ['摘要', 'NLP'],
  inputParams: [
    {
      name: 'sourceText',
      type: 'string',
      required: true,
      description: '待摘要的源文本',
      examples: ['这是一段需要摘要的长文本...'],
    },
    {
      name: 'maxLength',
      type: 'number',
      required: false,
      description: '摘要最大长度',
      defaultValue: 200,
    },
  ],
  outputFields: ['summarizedText', 'originalLength', 'summaryLength'],
  nodes: [
    {
      name: 'summarize',
      displayName: '文本摘要',
      description: '使用 LLM 生成文本摘要',
      nodeType: 'llm',
      timeout: 120000,
      useLLM: true,
      llmSystemPrompt: '请对以下文本进行摘要...',
      enableQualityCheck: true,
      qualityCheckPrompt: '检查摘要质量',
      dependencies: [],
    },
    {
      name: 'checkQuality',
      displayName: '质检',
      description: '检查摘要质量',
      nodeType: 'quality_check',
      timeout: 60000,
      useLLM: false,
      enableQualityCheck: false,
      dependencies: ['summarize'],
    },
  ],
  connections: [
    { from: 'START', to: 'summarize' },
    { from: 'summarize', to: 'checkQuality', condition: 'summary成功' },
    { from: 'checkQuality', to: 'END', condition: '质检通过' },
    { from: 'checkQuality', to: 'summarize', condition: '质检失败' },
  ],
  enableQualityCheck: true,
  maxRetries: 3,
  enableCheckpoint: true,
};

describe('MermaidDiagramGenerator', () => {
  it('should generate Mermaid diagram', () => {
    const generator = new MermaidDiagramGenerator();
    const mermaidCode = generator.generateMermaidDiagram(mockRequirement);

    expect(mermaidCode).toContain('graph LR');
    expect(mermaidCode).toContain('summarize');
    expect(mermaidCode).toContain('checkQuality');
    expect(mermaidCode).toContain('-->');
  });

  it('should include conditions in diagram', () => {
    const generator = new MermaidDiagramGenerator({ showConditions: true });
    const mermaidCode = generator.generateMermaidDiagram(mockRequirement);

    expect(mermaidCode).toContain('summary成功');
    expect(mermaidCode).toContain('质检通过');
    expect(mermaidCode).toContain('质检失败');
  });

  it('should generate simplified diagram', () => {
    const generator = new MermaidDiagramGenerator();
    const simplified = generator.generateSimplifiedDiagram(mockRequirement);

    expect(simplified).toContain('graph LR');
    expect(simplified).toContain('START');
    expect(simplified).toContain('END');
  });

  it('should support different directions', () => {
    const generator = new MermaidDiagramGenerator({ direction: 'TB' });
    const mermaidCode = generator.generateMermaidDiagram(mockRequirement);

    expect(mermaidCode).toContain('graph TB');
  });

  it('should apply styles to different node types', () => {
    const generator = new MermaidDiagramGenerator();
    const mermaidCode = generator.generateMermaidDiagram(mockRequirement);

    // LLM 节点样式
    expect(mermaidCode).toContain('classDef llmNode');
    // 质检节点样式
    expect(mermaidCode).toContain('classDef qualityNode');
  });
});

describe('NodeTableGenerator', () => {
  it('should generate node table', () => {
    const generator = new NodeTableGenerator();
    const table = generator.generateNodeTable(mockRequirement.nodes, mockRequirement.connections);

    expect(table).toContain('节点名称');
    expect(table).toContain('类型');
    expect(table).toContain('超时');
    expect(table).toContain('文本摘要');
    expect(table).toContain('质检');
  });

  it('should show dependencies', () => {
    const generator = new NodeTableGenerator();
    const table = generator.generateNodeTable(mockRequirement.nodes, mockRequirement.connections);

    expect(table).toContain('summarize'); // checkQuality 的依赖
  });

  it('should generate simplified table', () => {
    const generator = new NodeTableGenerator();
    const table = generator.generateNodeTable(mockRequirement.nodes, mockRequirement.connections);
    const simplified = generator.generateSimplifiedTable(mockRequirement.nodes, mockRequirement.connections);

    expect(simplified).toContain('节点');
    expect(simplified).toContain('类型');
    expect(simplified.length).toBeLessThan(table.length);
  });

  it('should handle empty nodes', () => {
    const generator = new NodeTableGenerator();
    const table = generator.generateNodeTable([], []);

    expect(table).toContain('No nodes to display');
  });
});

describe('DataFlowDiagramGenerator', () => {
  it('should generate data flow diagram', () => {
    const generator = new DataFlowDiagramGenerator();
    const diagram = generator.generateDataFlowDiagram(
      mockRequirement.inputParams,
      mockRequirement.nodes,
      mockRequirement.outputFields
    );

    expect(diagram).toContain('输入参数');
    expect(diagram).toContain('节点处理');
    expect(diagram).toContain('输出结果');
    expect(diagram).toContain('sourceText');
    expect(diagram).toContain('summarizedText');
  });

  it('should show required params with asterisk', () => {
    const generator = new DataFlowDiagramGenerator({ showRequired: true });
    const diagram = generator.generateDataFlowDiagram(
      mockRequirement.inputParams,
      mockRequirement.nodes,
      mockRequirement.outputFields
    );

    // The asterisk is separated by space, not attached to the name
    expect(diagram).toContain('sourceText');
    expect(diagram).toContain('*');
  });

  it('should show types', () => {
    const generator = new DataFlowDiagramGenerator({ showTypes: true });
    const diagram = generator.generateDataFlowDiagram(
      mockRequirement.inputParams,
      mockRequirement.nodes,
      mockRequirement.outputFields
    );

    expect(diagram).toContain('(string)');
    expect(diagram).toContain('(number)');
  });

  it('should generate simplified diagram', () => {
    const generator = new DataFlowDiagramGenerator();
    const simplified = generator.generateSimplifiedDiagram(
      mockRequirement.inputParams,
      mockRequirement.nodes,
      mockRequirement.outputFields
    );

    expect(simplified).toContain('📥 输入');
    expect(simplified).toContain('⚙️  处理');
    expect(simplified).toContain('📤 输出');
  });
});

describe('VisualizationPreviewSystem', () => {
  it('should display complete preview', async () => {
    const system = new VisualizationPreviewSystem({ useColors: false });

    // 捕获 console.log 输出
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await system.displayPreview(mockRequirement);

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0][0] as string;

    expect(output).toContain('工作流预览');
    expect(output).toContain('基本信息');
    expect(output).toContain('Mermaid 流程图');
    expect(output).toContain('节点列表');
    expect(output).toContain('数据流');

    consoleSpy.mockRestore();
  });

  it('should generate simplified preview', () => {
    const system = new VisualizationPreviewSystem({ useColors: false });
    const simplified = system.generateSimplifiedPreview(mockRequirement);

    expect(simplified).toContain(mockRequirement.name);
    expect(simplified).toContain(mockRequirement.description);
    expect(simplified).toContain('文本摘要');
  });

  it('should export Mermaid code', () => {
    const system = new VisualizationPreviewSystem();
    const mermaidCode = system.exportMermaidCode(mockRequirement);

    expect(mermaidCode).toContain('graph LR');
    expect(mermaidCode).toContain('summarize');
  });

  it('should provide access to generators', () => {
    const system = new VisualizationPreviewSystem();

    expect(system.getMermaidGenerator()).toBeInstanceOf(MermaidDiagramGenerator);
    expect(system.getNodeTableGenerator()).toBeInstanceOf(NodeTableGenerator);
    expect(system.getDataFlowGenerator()).toBeInstanceOf(DataFlowDiagramGenerator);
  });

  it('should respect config to hide sections', async () => {
    const system = new VisualizationPreviewSystem({
      showMermaid: false,
      showNodeTable: false,
      showDataFlow: false,
      useColors: false,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await system.displayPreview(mockRequirement);

    const output = consoleSpy.mock.calls[0][0] as string;

    expect(output).not.toContain('Mermaid 流程图');
    expect(output).not.toContain('节点列表');
    expect(output).not.toContain('数据流');

    consoleSpy.mockRestore();
  });
});

describe('Integration Tests', () => {
  it('should handle complex workflow', async () => {
    const complexRequirement: WorkflowRequirement = {
      ...mockRequirement,
      nodes: [
        ...mockRequirement.nodes,
        {
          name: 'postProcess',
          displayName: '后处理',
          description: '对结果进行后处理',
          nodeType: 'transform',
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: ['checkQuality'],
        },
      ],
      connections: [
        ...mockRequirement.connections,
        { from: 'checkQuality', to: 'postProcess', condition: '需要后处理' },
        { from: 'postProcess', to: 'END' },
      ],
    };

    const system = new VisualizationPreviewSystem({ useColors: false });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await system.displayPreview(complexRequirement);

    const output = consoleSpy.mock.calls[0][0] as string;

    expect(output).toContain('后处理');
    expect(output).toContain('postProcess');

    consoleSpy.mockRestore();
  });

  it('should handle workflow without quality check', async () => {
    const noQCRequirement: WorkflowRequirement = {
      ...mockRequirement,
      enableQualityCheck: false,
      nodes: mockRequirement.nodes.map((n) => ({
        ...n,
        enableQualityCheck: false,
      })),
    };

    const system = new VisualizationPreviewSystem({ useColors: false });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await system.displayPreview(noQCRequirement);

    const output = consoleSpy.mock.calls[0][0] as string;

    expect(output).toContain('禁用'); // 质量检查显示为禁用

    consoleSpy.mockRestore();
  });
});
