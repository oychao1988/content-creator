/**
 * Route Function Generator - 路由函数生成器
 *
 * 负责生成 LangGraph 工作流的路由函数代码
 */

import type { ILLMService } from '../../../../services/llm/ILLMService.js';
import { LLMServiceFactory } from '../../../../services/llm/LLMServiceFactory.js';
import { createLogger } from '../../../../infrastructure/logging/logger.js';
import type { WorkflowRequirement, NodeDesign, Connection } from '../schemas/WorkflowRequirementSchema.js';
import type { ProjectContext } from '../utils/contextBuilder.js';
import { toPascalCase, toCamelCase } from './utils.js';

const logger = createLogger('RouteFunctionGenerator');

/**
 * 路由函数生成器
 *
 * 为条件边生成路由函数
 */
export class RouteFunctionGenerator {
  private llmService: ILLMService;

  constructor(llmService?: ILLMService) {
    this.llmService = llmService || LLMServiceFactory.create();
    logger.info('RouteFunctionGenerator initialized');
  }

  /**
   * 生成路由函数代码
   *
   * @param nodes - 节点列表
   * @param connections - 连接关系列表
   * @param stateInterfaceName - 状态接口名称
   * @returns 路由函数代码
   */
  async generate(
    nodes: NodeDesign[],
    connections: Connection[],
    stateInterfaceName: string
  ): Promise<string> {
    const startTime = Date.now();

    logger.info('Generating route functions', {
      nodeCount: nodes.length,
      connectionCount: connections.length,
    });

    try {
      // 1. 识别条件连接
      const conditionalConnections = connections.filter(c => c.condition);

      if (conditionalConnections.length === 0) {
        logger.info('No conditional edges found, returning empty route functions');
        return '// No conditional edges in this workflow\n';
      }

      // 2. 生成路由函数
      const routeFunctions: string[] = [];

      for (const conn of conditionalConnections) {
        const func = this.generateRouteFunction(conn, stateInterfaceName);
        routeFunctions.push(func);
      }

      // 3. 合并所有路由函数
      const code = routeFunctions.join('\n\n');

      const duration = Date.now() - startTime;
      logger.info('Route functions generated successfully', {
        functionCount: routeFunctions.length,
        duration,
      });

      return code;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Route function generation failed', {
        duration,
        error: errorMessage,
      });

      throw new Error(`Failed to generate route functions: ${errorMessage}`);
    }
  }

  /**
   * 生成单个路由函数
   */
  private generateRouteFunction(
    connection: Connection,
    stateInterfaceName: string
  ): string {
    const functionName = `route${toPascalCase(connection.from)}`;
    const condition = connection.condition || 'true';

    return `/**
 * 路由函数：${connection.from} 节点后的决策
 *
 * 条件：${condition}
 */
function ${functionName}(state: ${stateInterfaceName}): string {
  // TODO: 实现路由逻辑
  // 根据条件表达式: ${condition}

  // 示例路由逻辑（需要根据实际条件实现）
  if (${condition}) {
    return '${toCamelCase(connection.to)}';
  }

  // 默认路由
  return 'end';
}`;
  }

  /**
   * 解析条件表达式并生成路由逻辑
   */
  private parseConditionToLogic(condition: string): string {
    // 简单的条件解析（实际实现可能需要更复杂的逻辑）
    const logic: string[] = [];

    // 处理常见模式
    if (condition.includes('&&')) {
      const parts = condition.split('&&').map(p => p.trim());
      logic.push(`if (${parts.join(' && ')}) {`);
    } else if (condition.includes('||')) {
      const parts = condition.split('||').map(p => p.trim());
      logic.push(`if (${parts.join(' || ')}) {`);
    } else {
      logic.push(`if (${condition}) {`);
    }

    return logic.join('\n  ');
  }
}

export default RouteFunctionGenerator;
