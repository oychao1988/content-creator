/**
 * Factory Class Generator - 工厂类生成器
 *
 * 负责生成 WorkflowFactory 工厂类代码
 */

import type { ILLMService } from '../../../../services/llm/ILLMService.js';
import { LLMServiceFactory } from '../../../../services/llm/LLMServiceFactory.js';
import { createLogger } from '../../../../infrastructure/logging/logger.js';
import type { WorkflowRequirement } from '../schemas/WorkflowRequirementSchema.js';
import type { ProjectContext } from '../utils/contextBuilder.js';
import { FACTORY_CLASS_GENERATION_PROMPT } from '../ai/prompts/generate-factory.js';
import { toPascalCase, toCamelCase } from './utils.js';

const logger = createLogger('FactoryClassGenerator');

/**
 * 工厂类生成器
 *
 * 使用 LLM 生成符合项目规范的 WorkflowFactory 代码
 */
export class FactoryClassGenerator {
  private llmService: ILLMService;

  constructor(llmService?: ILLMService) {
    this.llmService = llmService || LLMServiceFactory.create();
    logger.info('FactoryClassGenerator initialized');
  }

  /**
   * 生成工厂类代码
   *
   * @param requirement - 工作流需求
   * @param stateInterfaceName - 状态接口名称
   * @param graphFunctionName - 图函数名
   * @param context - 项目上下文
   * @returns 工厂类代码
   */
  async generate(
    requirement: WorkflowRequirement,
    stateInterfaceName: string,
    graphFunctionName: string,
    context: ProjectContext
  ): Promise<string> {
    const startTime = Date.now();

    logger.info('Generating factory class', {
      workflowType: requirement.type,
    });

    try {
      // 1. 构建 Prompt
      const prompt = this.buildPrompt(requirement, stateInterfaceName, graphFunctionName, context);

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
        temperature: 0.2,
        stream: false,
      });

      // 3. 提取并清理代码
      let code = this.extractCode(response.content);
      code = this.cleanCode(code);

      const duration = Date.now() - startTime;
      logger.info('Factory class generated successfully', {
        duration,
        codeLength: code.length,
      });

      return code;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Factory class generation failed', {
        duration,
        error: errorMessage,
      });

      throw new Error(`Failed to generate factory class: ${errorMessage}`);
    }
  }

  /**
   * 构建生成 Prompt
   */
  private buildPrompt(
    requirement: WorkflowRequirement,
    stateInterfaceName: string,
    graphFunctionName: string,
    context: ProjectContext
  ): string {
    const factoryInfo = {
      workflowRequirement: requirement,
      stateInterfaceName,
      graphFunctionName,
    };

    const factoryJSON = JSON.stringify(factoryInfo, null, 2);
    const requirementJSON = JSON.stringify(requirement, null, 2);

    return `${FACTORY_CLASS_GENERATION_PROMPT}\n\n## 工厂信息\n\n\`\`\`json\n${factoryJSON}\n\`\`\`\n\n## 工作流需求\n\n\`\`\`json\n${requirementJSON}\n\`\`\`\n\n请根据以上信息生成 WorkflowFactory 工厂类代码。`;
  }

  /**
   * 从 LLM 响应中提取代码
   */
  private extractCode(content: string): string {
    let code = content.trim();

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
   * 清理代码
   */
  private cleanCode(code: string): string {
    return code
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  /**
   * 获取工厂类名
   */
  getFactoryClassName(requirement: WorkflowRequirement): string {
    return toPascalCase(requirement.type) + 'WorkflowFactory';
  }

  /**
   * 获取工厂实例名
   */
  getFactoryInstanceName(requirement: WorkflowRequirement): string {
    return toCamelCase(requirement.type) + 'WorkflowFactory';
  }
}

export default FactoryClassGenerator;
