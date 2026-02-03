/**
 * State Interface Generator - 状态接口生成器
 *
 * 负责生成 LangGraph 工作流的状态接口代码
 */

import type { ILLMService } from '../../../../services/llm/ILLMService.js';
import { LLMServiceFactory } from '../../../../services/llm/LLMServiceFactory.js';
import { createLogger } from '../../../../infrastructure/logging/logger.js';
import type { WorkflowRequirement } from '../schemas/WorkflowRequirementSchema.js';
import type { ProjectContext } from '../utils/contextBuilder.js';
import { STATE_INTERFACE_GENERATION_PROMPT } from '../ai/prompts/generate-state.js';
import { toPascalCase } from './utils.js';

const logger = createLogger('StateInterfaceGenerator');

// ============================================================================
// 状态接口生成器
// ============================================================================

/**
 * 状态接口生成器
 *
 * 使用 LLM 生成符合项目规范的状态接口代码
 */
export class StateInterfaceGenerator {
  private llmService: ILLMService;

  constructor(llmService?: ILLMService) {
    this.llmService = llmService || LLMServiceFactory.create();
    logger.info('StateInterfaceGenerator initialized');
  }

  /**
   * 生成状态接口代码
   *
   * @param requirement - 工作流需求
   * @param context - 项目上下文
   * @returns 状态接口代码
   */
  async generate(
    requirement: WorkflowRequirement,
    context: ProjectContext
  ): Promise<string> {
    const startTime = Date.now();

    logger.info('Generating state interface', {
      workflowType: requirement.type,
      workflowName: requirement.name,
    });

    try {
      // 1. 构建 Prompt
      const prompt = this.buildPrompt(requirement, context);

      // 2. 调用 LLM
      const response = await this.llmService.chat({
        messages: [
          {
            role: 'system',
            content: '你是一位专业的 TypeScript 和 LangGraph 工作流架构专家。请严格按照要求生成代码。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2, // 低温度以获得更确定的结果
        stream: false,
      });

      // 3. 提取生成的代码
      let code = this.extractCode(response.content);

      // 4. 验证生成的代码
      const validation = this.validateGeneratedCode(code, requirement);
      if (!validation.valid) {
        logger.warn('Generated state interface has issues', {
          issues: validation.issues,
        });
      }

      // 5. 清理代码
      code = this.cleanCode(code);

      const duration = Date.now() - startTime;
      logger.info('State interface generated successfully', {
        duration,
        codeLength: code.length,
      });

      return code;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('State interface generation failed', {
        duration,
        error: errorMessage,
      });

      throw new Error(`Failed to generate state interface: ${errorMessage}`);
    }
  }

  /**
   * 构建 Prompt
   */
  private buildPrompt(requirement: WorkflowRequirement, context: ProjectContext): string {
    // 将需求转换为 JSON
    const requirementJSON = JSON.stringify(requirement, null, 2);

    // 添加项目上下文
    const contextInfo = `
## 项目上下文

### 现有工作流示例
${context.existingWorkflows.length > 0 ? context.existingWorkflows.map(w => `- ${w.type}: ${w.name}`).join('\n') : '（无现有工作流）'}

### 代码模式
${context.codePatterns || '（使用标准 LangGraph 模式）'}

### 最佳实践
${context.bestPractices || '（遵循 TypeScript 和 LangGraph 最佳实践）'}
`;

    return `${STATE_INTERFACE_GENERATION_PROMPT}\n\n${contextInfo}\n\n## 工作流需求\n\n\`\`\`json\n${requirementJSON}\n\`\`\`\n\n请根据以上信息生成状态接口代码。`;
  }

  /**
   * 从 LLM 响应中提取代码
   */
  private extractCode(content: string): string {
    let code = content.trim();

    // 移除 Markdown 代码块标记
    if (code.startsWith('```typescript')) {
      code = code.slice(12);
    } else if (code.startsWith('```ts')) {
      code = code.slice(5);
    } else if (code.startsWith('```')) {
      code = code.slice(3);
    }

    if (code.endsWith('```')) {
      code = code.slice(0, -3);
    }

    return code.trim();
  }

  /**
   * 验证生成的代码
   */
  private validateGeneratedCode(
    code: string,
    requirement: WorkflowRequirement
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // 1. 检查是否包含 interface 定义
    if (!code.includes('interface ')) {
      issues.push('Missing interface definition');
    }

    // 2. 检查是否继承 BaseWorkflowState
    if (!code.includes('extends BaseWorkflowState')) {
      issues.push('Interface must extend BaseWorkflowState');
    }

    // 3. 检查是否包含 workflowType 字段
    if (!code.includes('workflowType:')) {
      issues.push('Missing workflowType field');
    }

    // 4. 检查是否包含所有输入参数字段
    for (const param of requirement.inputParams) {
      if (!code.includes(`${param.name}:`)) {
        issues.push(`Missing input parameter field: ${param.name}`);
      }
    }

    // 5. 检查是否包含控制字段（重试计数）
    if (requirement.maxRetries > 0) {
      const hasRetryField = requirement.nodes.some(node =>
        code.includes(`${node.name}RetryCount:`) ||
        code.includes('retryCount:')
      );
      if (!hasRetryField) {
        issues.push('Missing retry count control field');
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * 清理代码
   */
  private cleanCode(code: string): string {
    // 移除多余的空行
    return code
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  /**
   * 获取状态接口名称
   *
   * @param requirement - 工作流需求
   * @returns 状态接口名称
   */
  getStateInterfaceName(requirement: WorkflowRequirement): string {
    return toPascalCase(requirement.type) + 'State';
  }
}

// ============================================================================
// 导出
// ============================================================================

export default StateInterfaceGenerator;
