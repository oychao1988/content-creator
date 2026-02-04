/**
 * Node Class Generator - 节点类生成器
 *
 * 负责生成 LangGraph 工作流的节点类代码
 */

import type { ILLMService } from '../../../../services/llm/ILLMService.js';
import { LLMServiceFactory } from '../../../../services/llm/LLMServiceFactory.js';
import { createLogger } from '../../../../infrastructure/logging/logger.js';
import type { WorkflowRequirement, NodeDesign } from '../schemas/WorkflowRequirementSchema.js';
import type { ProjectContext } from '../utils/contextBuilder.js';
import { NODE_CLASS_GENERATION_PROMPT } from '../ai/prompts/generate-node.js';
import { cleanGeneratedCode, extractCodeFromLLMResponse, toPascalCase, nodeNameToClassName } from './utils.js';

const logger = createLogger('NodeClassGenerator');

/**
 * 节点类生成器
 *
 * 使用 LLM 生成符合项目规范的节点类代码
 */
export class NodeClassGenerator {
  private llmService: ILLMService;

  constructor(llmService?: ILLMService) {
    this.llmService = llmService || LLMServiceFactory.create();
    logger.info('NodeClassGenerator initialized');
  }

  /**
   * 生成节点类代码
   *
   * @param node - 节点设计
   * @param requirement - 工作流需求
   * @param stateInterfaceName - 状态接口名称
   * @param context - 项目上下文
   * @returns 节点类代码
   */
  async generate(
    node: NodeDesign,
    requirement: WorkflowRequirement,
    stateInterfaceName: string,
    context: ProjectContext
  ): Promise<string> {
    const startTime = Date.now();

    logger.info('Generating node class', {
      nodeName: node.name,
      nodeType: node.nodeType,
      useLLM: node.useLLM,
    });

    try {
      // 1. 构建 Prompt
      const prompt = this.buildPrompt(node, requirement, stateInterfaceName, context);

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
      let code = extractCodeFromLLMResponse(response.content);
      code = cleanGeneratedCode(code);

      const duration = Date.now() - startTime;
      logger.info('Node class generated successfully', {
        nodeName: node.name,
        duration,
        codeLength: code.length,
      });

      return code;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Node class generation failed', {
        nodeName: node.name,
        duration,
        error: errorMessage,
      });

      throw new Error(`Failed to generate node class for ${node.name}: ${errorMessage}`);
    }
  }

  /**
   * 构建生成 Prompt
   */
  private buildPrompt(
    node: NodeDesign,
    requirement: WorkflowRequirement,
    stateInterfaceName: string,
    context: ProjectContext
  ): string {
    const nodeInfo = {
      node,
      stateInterfaceName,
      workflowRequirement: requirement,
    };

    const nodeJSON = JSON.stringify(nodeInfo, null, 2);
    const requirementJSON = JSON.stringify(requirement, null, 2);

    return `${NODE_CLASS_GENERATION_PROMPT}\n\n## 节点信息\n\n\`\`\`json\n${nodeJSON}\n\`\`\`\n\n## 工作流需求\n\n\`\`\`json\n${requirementJSON}\n\`\`\`\n\n请根据以上信息生成节点类代码。`;
  }

  /**
   * 获取节点类名
   */
  getNodeClassName(node: NodeDesign): string {
    return nodeNameToClassName(node.name);
  }
}

export default NodeClassGenerator;
