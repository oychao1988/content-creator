/**
 * Workflow Graph Generator - 工作流图生成器
 *
 * 负责生成 LangGraph StateGraph 代码
 */

import type { ILLMService } from '../../../../services/llm/ILLMService.js';
import { LLMServiceFactory } from '../../../../services/llm/LLMServiceFactory.js';
import { createLogger } from '../../../../infrastructure/logging/logger.js';
import type { WorkflowRequirement, NodeDesign } from '../schemas/WorkflowRequirementSchema.js';
import type { ProjectContext } from '../utils/contextBuilder.js';
import { WORKFLOW_GRAPH_GENERATION_PROMPT } from '../ai/prompts/generate-graph.js';
import { cleanGeneratedCode, extractCodeFromLLMResponse, toPascalCase, toCamelCase } from './utils.js';

const logger = createLogger('WorkflowGraphGenerator');

/**
 * 工作流图生成器
 *
 * 使用 LLM 生成符合项目规范的 StateGraph 代码
 */
export class WorkflowGraphGenerator {
  private llmService: ILLMService;

  constructor(llmService?: ILLMService) {
    this.llmService = llmService || LLMServiceFactory.create();
    logger.info('WorkflowGraphGenerator initialized');
  }

  /**
   * 生成工作流图代码
   *
   * @param requirement - 工作流需求
   * @param stateInterfaceName - 状态接口名称
   * @param nodeClasses - 节点类列表
   * @param routeFunctionCode - 路由函数代码
   * @param context - 项目上下文
   * @returns 工作流图代码
   */
  async generate(
    requirement: WorkflowRequirement,
    stateInterfaceName: string,
    nodeClasses: string[],
    routeFunctionCode: string,
    context: ProjectContext
  ): Promise<string> {
    const startTime = Date.now();

    logger.info('Generating workflow graph', {
      workflowType: requirement.type,
      nodeCount: requirement.nodes.length,
      connectionCount: requirement.connections.length,
    });

    try {
      // 1. 构建 Prompt
      const prompt = this.buildPrompt(requirement, stateInterfaceName, nodeClasses, context);

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

      // 调试日志
      logger.debug('LLM response received', {
        contentType: typeof response.content,
        contentLength: response.content?.length || 0,
        contentPreview: response.content?.substring(0, 200),
      });

      // 3. 提取并清理代码
      let code = extractCodeFromLLMResponse(response.content);

      logger.debug('Extracted code', {
        codeType: typeof code,
        codeLength: code?.length || 0,
        codePreview: code?.substring(0, 200),
      });

      code = cleanGeneratedCode(code);

      // 4. 如果有路由函数，插入到代码中
      if (routeFunctionCode && typeof routeFunctionCode === 'string' && routeFunctionCode.trim()) {
        code = this.insertRouteFunctions(code, routeFunctionCode);
      }

      const duration = Date.now() - startTime;
      logger.info('Workflow graph generated successfully', {
        duration,
        codeLength: code.length,
      });

      return code;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Workflow graph generation failed', {
        duration,
        error: errorMessage,
      });

      throw new Error(`Failed to generate workflow graph: ${errorMessage}`);
    }
  }

  /**
   * 构建生成 Prompt
   */
  private buildPrompt(
    requirement: WorkflowRequirement,
    stateInterfaceName: string,
    nodeClasses: string[],
    context: ProjectContext
  ): string {
    const graphInfo = {
      workflowRequirement: requirement,
      stateInterfaceName,
      nodeClasses: nodeClasses.map((className, index) => ({
        name: className,
        instanceName: toCamelCase(className),
        nodeName: requirement.nodes[index]?.name || '',
      })),
    };

    const graphJSON = JSON.stringify(graphInfo, null, 2);
    const requirementJSON = JSON.stringify(requirement, null, 2);

    return `${WORKFLOW_GRAPH_GENERATION_PROMPT}\n\n## 图信息\n\n\`\`\`json\n${graphJSON}\n\`\`\`\n\n## 工作流需求\n\n\`\`\`json\n${requirementJSON}\n\`\`\`\n\n请根据以上信息生成 StateGraph 代码。`;
  }

  /**
   * 插入路由函数
   */
  private insertRouteFunctions(graphCode: string, routeCode: string): string {
    // 在 import 语句后插入路由函数
    const importEnd = graphCode.indexOf('import');
    const importEndIndex = graphCode.indexOf('\n\n', importEnd);

    if (importEndIndex === -1) {
      return `${routeCode}\n\n${graphCode}`;
    }

    return (
      graphCode.slice(0, importEndIndex) +
      '\n\n' +
      routeCode +
      '\n\n' +
      graphCode.slice(importEndIndex)
    );
  }

  /**
   * 获取图函数名
   */
  getGraphFunctionName(requirement: WorkflowRequirement): string {
    return 'create' + toPascalCase(requirement.type) + 'Graph';
  }
}

export default WorkflowGraphGenerator;
