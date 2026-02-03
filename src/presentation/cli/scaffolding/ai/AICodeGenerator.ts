/**
 * AI Code Generator - AI 代码生成器
 *
 * 核心组件，协调所有代码生成器，生成完整的工作流代码
 */

import type { ILLMService } from '../../../../services/llm/ILLMService.js';
import { LLMServiceFactory } from '../../../../services/llm/LLMServiceFactory.js';
import { createLogger } from '../../../../infrastructure/logging/logger.js';
import type { WorkflowRequirement, NodeDesign } from '../schemas/WorkflowRequirementSchema.js';
import type { ProjectContext } from '../utils/contextBuilder.js';
import { StateInterfaceGenerator } from '../codegen/StateInterfaceGenerator.js';
import { NodeClassGenerator } from '../codegen/NodeClassGenerator.js';
import { RouteFunctionGenerator } from '../codegen/RouteFunctionGenerator.js';
import { WorkflowGraphGenerator } from '../codegen/WorkflowGraphGenerator.js';
import { FactoryClassGenerator } from '../codegen/FactoryClassGenerator.js';
import { CodePostProcessor, type WorkflowFiles } from '../codegen/CodePostProcessor.js';
import {
  toPascalCase,
  workflowTypeToStateName,
  nodeNameToClassName,
  generateImports,
  generateNodeImports,
} from '../codegen/utils.js';

const logger = createLogger('AICodeGenerator');

// ============================================================================
// 代码生成配置
// ============================================================================

/**
 * 代码生成配置
 */
export interface CodeGeneratorConfig {
  /** 是否启用后处理 */
  enablePostProcess?: boolean;
  /** 是否并行生成节点 */
  parallelNodes?: boolean;
  /** 后处理配置 */
  postProcessorConfig?: {
    enablePrettier?: boolean;
    enableESLint?: boolean;
    enableTypeCheck?: boolean;
  };
}

// ============================================================================
// AI 代码生成器类
// ============================================================================

/**
 * AI 代码生成器
 *
 * 协调所有组件，生成完整的工作流代码
 */
export class AICodeGenerator {
  private llmService: ILLMService;
  private stateGenerator: StateInterfaceGenerator;
  private nodeGenerator: NodeClassGenerator;
  private routeGenerator: RouteFunctionGenerator;
  private graphGenerator: WorkflowGraphGenerator;
  private factoryGenerator: FactoryClassGenerator;
  private postProcessor: CodePostProcessor;
  private config: CodeGeneratorConfig;

  constructor(llmService?: ILLMService, config: CodeGeneratorConfig = {}) {
    this.llmService = llmService || LLMServiceFactory.create();
    this.config = {
      enablePostProcess: true,
      parallelNodes: true,
      ...config,
    };

    // 初始化各个生成器
    this.stateGenerator = new StateInterfaceGenerator(this.llmService);
    this.nodeGenerator = new NodeClassGenerator(this.llmService);
    this.routeGenerator = new RouteFunctionGenerator(this.llmService);
    this.graphGenerator = new WorkflowGraphGenerator(this.llmService);
    this.factoryGenerator = new FactoryClassGenerator(this.llmService);
    this.postProcessor = new CodePostProcessor(this.config.postProcessorConfig);

    logger.info('AICodeGenerator initialized', {
      enablePostProcess: this.config.enablePostProcess,
      parallelNodes: this.config.parallelNodes,
    });
  }

  /**
   * 生成完整的工作流代码
   *
   * @param requirement - 工作流需求
   * @param context - 项目上下文
   * @returns 工作流文件集合
   */
  async generateWorkflow(
    requirement: WorkflowRequirement,
    context: ProjectContext
  ): Promise<WorkflowFiles> {
    const startTime = Date.now();

    logger.info('Starting workflow code generation', {
      workflowType: requirement.type,
      nodeCount: requirement.nodes.length,
    });

    try {
      // 1. 生成状态接口
      logger.info('Step 1/6: Generating state interface');
      const stateInterfaceCode = await this.stateGenerator.generate(requirement, context);
      const stateInterfaceName = this.stateGenerator.getStateInterfaceName(requirement);

      // 2. 生成节点类
      logger.info('Step 2/6: Generating node classes');
      const nodeCodes = await this.generateNodes(requirement, stateInterfaceName, context);

      // 3. 生成路由函数
      logger.info('Step 3/6: Generating route functions');
      const routeFunctionCode = await this.routeGenerator.generate(
        requirement.nodes,
        requirement.connections,
        stateInterfaceName
      );

      // 4. 生成工作流图
      logger.info('Step 4/6: Generating workflow graph');
      const nodeClassNames = Array.from(nodeCodes.keys()).map(nodeName =>
        nodeNameToClassName(requirement.nodes.find(n => n.name === nodeName)!)
      );

      const graphCode = await this.graphGenerator.generate(
        requirement,
        stateInterfaceName,
        nodeClassNames,
        routeFunctionCode,
        context
      );

      // 5. 生成工厂类
      logger.info('Step 5/6: Generating factory class');
      const graphFunctionName = this.graphGenerator.getGraphFunctionName(requirement);
      const factoryCode = await this.factoryGenerator.generate(
        requirement,
        stateInterfaceName,
        graphFunctionName,
        context
      );

      // 6. 生成导出文件
      logger.info('Step 6/6: Generating index file');
      const indexCode = this.generateIndexFile(requirement, stateInterfaceName, nodeClassNames);

      // 组装结果
      let files: WorkflowFiles = {
        state: stateInterfaceCode,
        nodes: nodeCodes,
        routeFunctions: routeFunctionCode,
        graph: graphCode,
        factory: factoryCode,
        index: indexCode,
      };

      // 后处理
      if (this.config.enablePostProcess) {
        logger.info('Post-processing generated code');
        files = await this.postProcessor.processAll(files);
      }

      const duration = Date.now() - startTime;
      logger.info('Workflow code generation completed', {
        duration,
        fileCount: 1 + files.nodes.size + 4, // state + nodes + route + graph + factory + index
      });

      return files;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Workflow code generation failed', {
        duration,
        error: errorMessage,
      });

      throw new Error(`Failed to generate workflow code: ${errorMessage}`);
    }
  }

  /**
   * 生成单个文件
   *
   * @param fileType - 文件类型（state/node/route/graph/factory/index）
   * @param requirement - 工作流需求
   * @param context - 项目上下文
   * @returns 生成的代码
   */
  async generateFile(
    fileType: string,
    requirement: WorkflowRequirement,
    context: ProjectContext
  ): Promise<string> {
    logger.info('Generating single file', {
      fileType,
      workflowType: requirement.type,
    });

    const stateInterfaceName = workflowTypeToStateName(requirement.type);

    switch (fileType) {
      case 'state':
        return await this.stateGenerator.generate(requirement, context);

      case 'node': {
        // 生成第一个节点（或指定节点）
        const node = requirement.nodes[0];
        if (!node) {
          throw new Error('No nodes found in workflow requirement');
        }
        return await this.nodeGenerator.generate(node, requirement, stateInterfaceName, context);
      }

      case 'routes':
        return await this.routeGenerator.generate(
          requirement.nodes,
          requirement.connections,
          stateInterfaceName
        );

      case 'graph': {
        const nodeClassNames = requirement.nodes.map(n => nodeNameToClassName(n));
        const routeCode = await this.routeGenerator.generate(
          requirement.nodes,
          requirement.connections,
          stateInterfaceName
        );
        return await this.graphGenerator.generate(
          requirement,
          stateInterfaceName,
          nodeClassNames,
          routeCode,
          context
        );
      }

      case 'factory': {
        const graphFunctionName = 'create' + toPascalCase(requirement.type) + 'Graph';
        return await this.factoryGenerator.generate(
          requirement,
          stateInterfaceName,
          graphFunctionName,
          context
        );
      }

      case 'index': {
        const nodeClassNames = requirement.nodes.map(n => nodeNameToClassName(n));
        return this.generateIndexFile(requirement, stateInterfaceName, nodeClassNames);
      }

      default:
        throw new Error(`Unknown file type: ${fileType}`);
    }
  }

  /**
   * 生成所有节点类
   */
  private async generateNodes(
    requirement: WorkflowRequirement,
    stateInterfaceName: string,
    context: ProjectContext
  ): Promise<Map<string, string>> {
    const nodeCodes = new Map<string, string>();

    if (this.config.parallelNodes) {
      // 并行生成
      logger.info('Generating nodes in parallel');
      const promises = requirement.nodes.map(async (node) => {
        const code = await this.nodeGenerator.generate(node, requirement, stateInterfaceName, context);
        return { nodeName: node.name, code };
      });

      const results = await Promise.all(promises);
      for (const result of results) {
        nodeCodes.set(result.nodeName, result.code);
      }
    } else {
      // 串行生成
      logger.info('Generating nodes sequentially');
      for (const node of requirement.nodes) {
        const code = await this.nodeGenerator.generate(node, requirement, stateInterfaceName, context);
        nodeCodes.set(node.name, code);
      }
    }

    return nodeCodes;
  }

  /**
   * 生成导出索引文件
   */
  private generateIndexFile(
    requirement: WorkflowRequirement,
    stateInterfaceName: string,
    nodeClassNames: string[]
  ): string {
    const lines: string[] = [];

    // 导出状态接口
    lines.push(`export type { ${stateInterfaceName} } from './${stateInterfaceName}.js';`);

    // 导出节点类
    for (const nodeClassName of nodeClassNames) {
      const fileName = nodeClassName.replace(/Node$/, '');
      lines.push(`export { ${nodeClassName} } from './nodes/${fileName}.js';`);
    }

    // 导出工作流图
    const graphFunctionName = 'create' + toPascalCase(requirement.type) + 'Graph';
    lines.push(`export { ${graphFunctionName} } from './${requirement.type}Graph.js';`);

    // 导出工厂类
    const factoryClassName = toPascalCase(requirement.type) + 'WorkflowFactory';
    const factoryInstanceName = toCamelCase(requirement.type) + 'WorkflowFactory';
    lines.push(`export { ${factoryClassName}, ${factoryInstanceName} } from './${factoryClassName}.js';`);

    return lines.join('\n');
  }

  /**
   * 计算生成的代码质量分数
   */
  async calculateQualityScore(files: WorkflowFiles): Promise<number> {
    let totalScore = 0;
    let fileCount = 0;

    // 评估状态接口
    if (files.state) {
      const score = await this.postProcessor.calculateQualityScore(files.state, 'State.ts');
      totalScore += score;
      fileCount++;
    }

    // 评估节点类
    for (const [nodeName, nodeCode] of files.nodes.entries()) {
      const score = await this.postProcessor.calculateQualityScore(nodeCode, `${nodeName}.ts`);
      totalScore += score;
      fileCount++;
    }

    // 评估工作流图
    if (files.graph) {
      const score = await this.postProcessor.calculateQualityScore(files.graph, 'Graph.ts');
      totalScore += score;
      fileCount++;
    }

    // 评估工厂类
    if (files.factory) {
      const score = await this.postProcessor.calculateQualityScore(files.factory, 'Factory.ts');
      totalScore += score;
      fileCount++;
    }

    return fileCount > 0 ? Math.round(totalScore / fileCount) : 0;
  }
}

// ============================================================================
// 导出
// ============================================================================

export default AICodeGenerator;
