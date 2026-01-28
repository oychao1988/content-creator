#!/usr/bin/env node
/**
 * 翻译工作流使用示例
 *
 * 演示如何使用翻译工作流进行文本翻译
 */

import {
  WorkflowRegistry,
  registerWorkflow,
  createWorkflowGraph,
  createWorkflowState,
} from '../domain/workflow/index.js';
import { translationWorkflowFactory } from '../domain/workflow/examples/TranslationWorkflow.js';
import { ExecutionMode } from '../domain/entities/Task.js';

async function main() {
  console.log('🚀 翻译工作流使用示例\n');

  try {
    // 1. 注册翻译工作流
    registerWorkflow(translationWorkflowFactory);
    console.log('✅ 翻译工作流已注册');

    // 2. 验证工作流是否已注册
    const isRegistered = WorkflowRegistry.has('translation');
    console.log(`📋 翻译工作流是否已注册: ${isRegistered ? '是' : '否'}`);

    if (!isRegistered) {
      throw new Error('翻译工作流未成功注册');
    }

    // 3. 创建翻译工作流状态
    const state = createWorkflowState('translation', {
      taskId: `translation-task-${Date.now()}`,
      mode: ExecutionMode.SYNC,
      sourceText: 'Artificial intelligence is transforming the world',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      translationStyle: 'formal',
      domain: 'technology',
    });
    console.log('✅ 翻译工作流状态已创建');

    // 4. 创建翻译工作流图
    const graph = createWorkflowGraph('translation');
    console.log('✅ 翻译工作流图已创建');

    // 5. 执行翻译工作流
    console.log('🔄 正在执行翻译工作流...');
    const result = await graph.invoke(state);

    // 6. 输出结果
    console.log('\n📄 翻译结果');
    console.log('='.repeat(50));
    console.log(`源文本: ${result.sourceText}`);
    console.log(`翻译后: ${result.translatedText}`);
    console.log('='.repeat(50));

    // 7. 输出质量检查结果
    if (result.qualityReport) {
      console.log('\n📊 质量检查报告');
      console.log('='.repeat(50));
      console.log(`质量评分: ${result.qualityReport.score}/10`);
      console.log(`是否通过: ${result.qualityReport.passed ? '✅ 通过' : '❌ 失败'}`);

      if (result.qualityReport?.fixSuggestions && result.qualityReport.fixSuggestions.length > 0) {
        console.log('改进建议:');
        result.qualityReport.fixSuggestions.forEach((suggestion: string, index: number) => {
          console.log(`${index + 1}. ${suggestion}`);
        });
      }
    }

    console.log('\n🎉 翻译工作流执行成功！');
  } catch (error) {
    console.error('❌ 翻译工作流执行失败:', error);
    process.exit(1);
  }
}

// 运行示例
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
