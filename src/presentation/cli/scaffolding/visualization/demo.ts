/**
 * VisualizationPreviewSystem Demo
 *
 * 演示可视化预览系统的功能
 */

import { VisualizationPreviewSystem } from './VisualizationPreviewSystem.js';
import type { WorkflowRequirement } from '../schemas/WorkflowRequirementSchema.js';

// 示例工作流需求
const demoRequirement: WorkflowRequirement = {
  type: 'text-summarizer',
  name: '文本摘要工作流',
  description: '使用 LLM 对输入文本进行智能摘要，支持自定义长度和质量检查',
  category: 'content',
  tags: ['摘要', 'NLP', '内容创作'],
  inputParams: [
    {
      name: 'sourceText',
      type: 'string',
      required: true,
      description: '待摘要的源文本',
      examples: ['这是一段需要摘要的长文本内容...'],
    },
    {
      name: 'maxLength',
      type: 'number',
      required: false,
      description: '摘要最大长度（字数）',
      defaultValue: 200,
      examples: [200, 300, 500],
    },
    {
      name: 'style',
      type: 'string',
      required: false,
      description: '摘要风格',
      defaultValue: '简洁',
      examples: ['简洁', '详细', '要点式'],
    },
  ],
  outputFields: ['summarizedText', 'originalLength', 'summaryLength', 'keyPoints'],
  nodes: [
    {
      name: 'summarize',
      displayName: '文本摘要',
      description: '使用 LLM 生成文本摘要',
      nodeType: 'llm',
      timeout: 120000,
      useLLM: true,
      llmSystemPrompt: '请对以下文本进行摘要，要求简洁明了，保留关键信息...',
      enableQualityCheck: true,
      qualityCheckPrompt: '检查摘要是否准确、完整、简洁',
      dependencies: [],
    },
    {
      name: 'checkQuality',
      displayName: '质量检查',
      description: '检查摘要质量和准确性',
      nodeType: 'quality_check',
      timeout: 60000,
      useLLM: true,
      llmSystemPrompt: '评估摘要质量...',
      enableQualityCheck: false,
      dependencies: ['summarize'],
    },
    {
      name: 'extractKeyPoints',
      displayName: '提取要点',
      description: '从摘要中提取关键要点',
      nodeType: 'transform',
      timeout: 30000,
      useLLM: false,
      enableQualityCheck: false,
      dependencies: ['checkQuality'],
    },
  ],
  connections: [
    { from: 'START', to: 'summarize' },
    { from: 'summarize', to: 'checkQuality' },
    {
      from: 'checkQuality',
      to: 'extractKeyPoints',
      condition: 'qualityScore >= 0.8',
    },
    {
      from: 'checkQuality',
      to: 'summarize',
      condition: 'qualityScore < 0.8 && retryCount < 2',
    },
    { from: 'extractKeyPoints', to: 'END' },
  ],
  enableQualityCheck: true,
  maxRetries: 2,
  enableCheckpoint: true,
};

/**
 * 运行演示
 */
async function runDemo(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('  可视化预览系统演示');
  console.log('='.repeat(60) + '\n');

  // 创建可视化预览系统
  const visualizer = new VisualizationPreviewSystem({
    useColors: true,
  });

  // 显示完整预览
  await visualizer.displayPreview(demoRequirement);

  console.log('\n' + '='.repeat(60));
  console.log('  演示完成！');
  console.log('='.repeat(60) + '\n');

  // 额外演示：导出 Mermaid 代码
  console.log('\n' + '─'.repeat(60));
  console.log('  Mermaid 代码导出示例');
  console.log('─'.repeat(60) + '\n');

  const mermaidCode = visualizer.exportMermaidCode(demoRequirement);
  console.log(mermaidCode);

  console.log('\n' + '─'.repeat(60));
  console.log('  简化预览示例');
  console.log('─'.repeat(60) + '\n');

  const simplified = visualizer.generateSimplifiedPreview(demoRequirement);
  console.log(simplified);
  console.log('\n');
}

// 运行演示
runDemo().catch((error) => {
  console.error('演示运行失败:', error);
  process.exit(1);
});
