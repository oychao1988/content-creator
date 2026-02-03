/**
 * Context Builder - 项目上下文构建器
 *
 * 从项目现有代码中提取上下文信息，
 * 用于 AI 需求理解引擎生成更准确的工作流定义
 */

import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { createLogger } from '../../../../infrastructure/logging/logger.js';

const logger = createLogger('ContextBuilder');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 代码模式提取结果
 */
export interface CodePatterns {
  stateInterfaces: string[];
  nodeClasses: string[];
  workflowGraphs: string[];
  workflowFactories: string[];
}

/**
 * 项目上下文
 */
export interface ProjectContext {
  existingWorkflows: Array<{
    type: string;
    name: string;
    description: string;
    category?: string;
    nodes: string[];
  }>;
  codePatterns: string;
  bestPractices: string;
  commonNodes: string;
}

// ============================================================================
// 上下文构建主函数
// ============================================================================

/**
 * 构建项目上下文
 *
 * @returns 项目上下文信息
 */
export async function buildProjectContext(): Promise<ProjectContext> {
  logger.info('Building project context...');

  try {
    // 1. 获取现有工作流列表
    const existingWorkflows = await extractExistingWorkflows();

    // 2. 提取代码模式
    const codePatterns = await extractCodePatterns();

    // 3. 提取最佳实践
    const bestPractices = extractBestPractices(existingWorkflows);

    // 4. 识别常用节点
    const commonNodes = await identifyCommonNodes(existingWorkflows);

    const context: ProjectContext = {
      existingWorkflows,
      codePatterns: formatCodePatterns(codePatterns),
      bestPractices,
      commonNodes,
    };

    logger.info('Project context built successfully', {
      workflowCount: existingWorkflows.length,
      nodeTypesCount: codePatterns.nodeClasses.length,
    });

    return context;
  } catch (error) {
    logger.error('Failed to build project context', {
      error: error instanceof Error ? error.message : String(error),
    });

    // 返回默认上下文
    return getDefaultContext();
  }
}

// ============================================================================
// 提取现有工作流
// ============================================================================

/**
 * 提取现有工作流列表
 *
 * @returns 工作流列表
 */
export async function extractExistingWorkflows(): Promise<
  Array<{
    type: string;
    name: string;
    description: string;
    category?: string;
    nodes: string[];
  }>
> {
  logger.debug('Extracting existing workflows...');

  const workflows: Array<{
    type: string;
    name: string;
    description: string;
    category?: string;
    nodes: string[];
  }> = [];

  try {
    // 扫描工作流实现文件
    const workflowFiles = await glob('src/domain/workflow/**/*Workflow.ts', {
      cwd: process.cwd(),
      absolute: false,
    });

    logger.debug(`Found ${workflowFiles.length} workflow files`, {
      files: workflowFiles,
    });

    for (const file of workflowFiles) {
      try {
        const content = await readFile(file, 'utf-8');

        // 提取工作流类型（从 WorkflowFactory 的 type 属性）
        const typeMatch = content.match(/public\s+readonly\s+type:\s+string\s*=\s*['"]([^'"]+)['"]/);
        const type = typeMatch ? typeMatch[1] : null;

        if (!type) {
          continue;
        }

        // 提取工作流名称
        const nameMatch = content.match(/public\s+readonly\s+name:\s+string\s*=\s*['"]([^'"]+)['"]/);
        const name = nameMatch ? nameMatch[1] : type;

        // 提取工作流描述
        const descMatch = content.match(/public\s+readonly\s+description:\s+string\s*=\s*['"]([^'"]+)['"]/);
        const description = descMatch ? descMatch[1] : 'No description';

        // 提取分类
        const categoryMatch = content.match(/category:\s*['"]([^'"]+)['"]/);
        const category = categoryMatch ? categoryMatch[1] : undefined;

        // 提取节点列表
        const nodeMatches = content.matchAll(/class\s+(\w+Node)\s+extends/g);
        const nodes = Array.from(nodeMatches).map((m) => m[1]);

        workflows.push({
          type,
          name,
          description,
          category,
          nodes,
        });

        logger.debug(`Extracted workflow: ${type}`, {
          name,
          nodesCount: nodes.length,
        });
      } catch (error) {
        logger.warn(`Failed to parse workflow file: ${file}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return workflows;
  } catch (error) {
    logger.error('Failed to extract existing workflows', {
      error: error instanceof Error ? error.message : String(error),
    });

    return [];
  }
}

// ============================================================================
// 提取代码模式
// ============================================================================

/**
 * 提取现有代码模式
 *
 * @returns 代码模式
 */
export async function extractCodePatterns(): Promise<CodePatterns> {
  logger.debug('Extracting code patterns...');

  const patterns: CodePatterns = {
    stateInterfaces: [],
    nodeClasses: [],
    workflowGraphs: [],
    workflowFactories: [],
  };

  try {
    // 1. 提取状态接口模式
    const stateFiles = await glob('src/domain/workflow/**/*State.ts', {
      cwd: process.cwd(),
      absolute: false,
    });

    for (const file of stateFiles) {
      try {
        const content = await readFile(file, 'utf-8');

        // 提取接口定义
        const interfaceMatches = content.matchAll(
          /export\s+interface\s+(\w+)\s+extends\s+BaseWorkflowState\s*\{([^}]+)\}/g
        );

        for (const match of interfaceMatches) {
          const interfaceName = match[1];
          const interfaceBody = match[2];

          patterns.stateInterfaces.push(`${interfaceName}: ${interfaceBody.substring(0, 100)}...`);
        }
      } catch (error) {
        logger.warn(`Failed to parse state file: ${file}`);
      }
    }

    // 2. 提取节点类模式
    const nodeFiles = await glob('src/domain/workflow/nodes/*.ts', {
      cwd: process.cwd(),
      absolute: false,
    });

    for (const file of nodeFiles) {
      try {
        const content = await readFile(file, 'utf-8');

        // 提取节点类定义
        const classMatches = content.matchAll(
          /export\s+class\s+(\w+Node)\s+extends\s+BaseNode/g
        );

        for (const match of classMatches) {
          patterns.nodeClasses.push(match[1]);
        }
      } catch (error) {
        logger.warn(`Failed to parse node file: ${file}`);
      }
    }

    // 3. 提取工作流图模式
    const graphFiles = await glob('src/domain/workflow/**/*Graph.ts', {
      cwd: process.cwd(),
      absolute: false,
    });

    for (const file of graphFiles) {
      const fileName = file.split('/').pop();
      if (fileName) {
        patterns.workflowGraphs.push(fileName);
      }
    }

    // 4. 提取工作流工厂模式
    const factoryMatches = await glob('src/domain/workflow/**/*WorkflowFactory.ts', {
      cwd: process.cwd(),
      absolute: false,
    });

    for (const file of factoryMatches) {
      const fileName = file.split('/').pop();
      if (fileName) {
        patterns.workflowFactories.push(fileName);
      }
    }

    logger.debug('Code patterns extracted', {
      stateInterfaces: patterns.stateInterfaces.length,
      nodeClasses: patterns.nodeClasses.length,
      workflowGraphs: patterns.workflowGraphs.length,
      workflowFactories: patterns.workflowFactories.length,
    });

    return patterns;
  } catch (error) {
    logger.error('Failed to extract code patterns', {
      error: error instanceof Error ? error.message : String(error),
    });

    return patterns;
  }
}

/**
 * 格式化代码模式
 *
 * @param patterns - 代码模式
 * @returns 格式化后的代码模式字符串
 */
function formatCodePatterns(patterns: CodePatterns): string {
  const sections: string[] = [];

  if (patterns.stateInterfaces.length > 0) {
    sections.push('### 状态接口模式\n\n');
    sections.push('项目中的状态接口继承自 `BaseWorkflowState`，包含以下示例：\n\n');
    patterns.stateInterfaces.slice(0, 3).forEach((iface) => {
      sections.push(`- ${iface}\n`);
    });
  }

  if (patterns.nodeClasses.length > 0) {
    sections.push('\n### 节点类模式\n\n');
    sections.push('项目中的节点类继承自 `BaseNode<TState>`，实现 `executeLogic()` 方法。\n\n');
    sections.push('现有节点类：\n\n');
    patterns.nodeClasses.forEach((node) => {
      sections.push(`- ${node}\n`);
    });
  }

  if (patterns.workflowGraphs.length > 0) {
    sections.push('\n### 工作流图模式\n\n');
    sections.push('工作流图使用 LangGraph 的 `StateGraph` 创建，包含以下文件：\n\n');
    patterns.workflowGraphs.forEach((graph) => {
      sections.push(`- ${graph}\n`);
    });
  }

  if (patterns.workflowFactories.length > 0) {
    sections.push('\n### 工作流工厂模式\n\n');
    sections.push('工作流工厂实现 `WorkflowFactory` 接口，提供以下方法：\n\n');
    sections.push('- `createGraph()`: 创建 LangGraph 图实例\n');
    sections.push('- `createState(params)`: 创建工作流状态\n');
    sections.push('- `validateParams(params)`: 验证参数\n');
    sections.push('- `getMetadata()`: 获取元数据\n');
  }

  return sections.join('');
}

// ============================================================================
// 提取最佳实践
// ============================================================================

/**
 * 提取最佳实践
 *
 * @param workflows - 工作流列表
 * @returns 最佳实践字符串
 */
function extractBestPractices(
  workflows: Array<{
    type: string;
    name: string;
    description: string;
    category?: string;
    nodes: string[];
  }>
): string {
  const practices: string[] = [];

  practices.push('### 命名规范\n\n');
  practices.push('- 工作流类型：kebab-case (e.g., "content-creator", "text-summarizer")\n');
  practices.push('- 节点名称：camelCase + "Node" 后缀 (e.g., "SearchNode", "TranslateNode")\n');
  practices.push('- 状态接口：PascalCase + "State" 后缀 (e.g., "TranslationState")\n');

  practices.push('\n### 节点设计原则\n\n');
  practices.push('- 每个节点应该有单一、明确的职责\n');
  practices.push('- LLM 节点超时时间：90-180 秒（考虑流式请求）\n');
  practices.push('- API 节点超时时间：30-60 秒\n');
  practices.push('- Transform 节点超时时间：10-30 秒\n');

  practices.push('\n### 状态管理\n\n');
  practices.push('- 所有状态必须可序列化（不能包含函数、循环引用）\n');
  practices.push('- 使用 `Partial<State>` 返回状态更新\n');
  practices.push('- 继承 `BaseWorkflowState` 获取基础字段\n');

  practices.push('\n### 质量检查\n\n');
  practices.push('- 对关键节点启用质检\n');
  practices.push('- 质检失败支持重试（通常 2-3 次）\n');
  practices.push('- 使用 LLM 评估 + 硬规则检查双重保障\n');

  practices.push('\n### 工作流连接\n\n');
  practices.push('- 必须有明确的起始点（START）\n');
  practices.push('- 必须有明确的结束点（END）\n');
  practices.push('- 使用条件边处理质检失败重试\n');

  if (workflows.length > 0) {
    practices.push('\n### 现有工作流统计\n\n');
    const nodeCounts = workflows.map((w) => w.nodes.length);
    const avgNodes = Math.round(nodeCounts.reduce((a, b) => a + b, 0) / nodeCounts.length);
    practices.push(`- 工作流总数：${workflows.length}\n`);
    practices.push(`- 平均节点数：${avgNodes}\n`);
    practices.push(`- 常用节点：${getTopNodes(workflows, 5).join(', ')}\n`);
  }

  return practices.join('');
}

/**
 * 获取最常用的节点
 *
 * @param workflows - 工作流列表
 * @param topN - 返回前 N 个
 * @returns 节点名称列表
 */
function getTopNodes(
  workflows: Array<{ nodes: string[] }>,
  topN: number
): string[] {
  const nodeCount = new Map<string, number>();

  workflows.forEach((w) => {
    w.nodes.forEach((node) => {
      nodeCount.set(node, (nodeCount.get(node) || 0) + 1);
    });
  });

  return Array.from(nodeCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map((e) => e[0]);
}

// ============================================================================
// 识别常用节点
// ============================================================================

/**
 * 识别常用节点类型
 *
 * @param workflows - 工作流列表
 * @returns 常用节点描述
 */
async function identifyCommonNodes(
  workflows: Array<{
    type: string;
    name: string;
    description: string;
    category?: string;
    nodes: string[];
  }>
): Promise<string> {
  const descriptions: string[] = [];

  descriptions.push('### 常用节点类型\n\n');

  // 从项目节点目录扫描
  const nodeFiles = await glob('src/domain/workflow/nodes/*.ts', {
    cwd: process.cwd(),
    absolute: false,
  });

  const nodeTypes = new Map<string, string>();

  for (const file of nodeFiles) {
    try {
      const content = await readFile(file, 'utf-8');

      // 提取节点类名和描述
      const classMatch = content.match(/class\s+(\w+Node)\s+extends/);
      const descMatch = content.match(
        /\*\s*([^\n]*?(?:节点|Node)[^\n]*?)\n\s*\*\//
      );

      if (classMatch) {
        const className = classMatch[1];
        const description = descMatch ? descMatch[1].trim() : '节点';
        nodeTypes.set(className, description);
      }
    } catch (error) {
      logger.warn(`Failed to parse node file: ${file}`);
    }
  }

  // 按类型分组
  const llmNodes: string[] = [];
  const apiNodes: string[] = [];
  const transformNodes: string[] = [];
  const qualityNodes: string[] = [];

  nodeTypes.forEach((desc, name) => {
    const lowerDesc = desc.toLowerCase();
    if (lowerDesc.includes('llm') || lowerDesc.includes('翻译') || lowerDesc.includes('写作') || lowerDesc.includes('摘要')) {
      llmNodes.push(`${name}: ${desc}`);
    } else if (lowerDesc.includes('api') || lowerDesc.includes('搜索') || lowerDesc.includes('图片')) {
      apiNodes.push(`${name}: ${desc}`);
    } else if (lowerDesc.includes('quality') || lowerDesc.includes('质检') || lowerDesc.includes('检查')) {
      qualityNodes.push(`${name}: ${desc}`);
    } else {
      transformNodes.push(`${name}: ${desc}`);
    }
  });

  if (llmNodes.length > 0) {
    descriptions.push('#### LLM 节点\n\n');
    llmNodes.forEach((n) => descriptions.push(`- ${n}\n`));
  }

  if (apiNodes.length > 0) {
    descriptions.push('\n#### API 节点\n\n');
    apiNodes.forEach((n) => descriptions.push(`- ${n}\n`));
  }

  if (qualityNodes.length > 0) {
    descriptions.push('\n#### 质量检查节点\n\n');
    qualityNodes.forEach((n) => descriptions.push(`- ${n}\n`));
  }

  if (transformNodes.length > 0) {
    descriptions.push('\n#### 数据转换节点\n\n');
    transformNodes.forEach((n) => descriptions.push(`- ${n}\n`));
  }

  return descriptions.join('');
}

// ============================================================================
// 默认上下文
// ============================================================================

/**
 * 获取默认上下文
 *
 * @returns 默认项目上下文
 */
function getDefaultContext(): ProjectContext {
  return {
    existingWorkflows: [],
    codePatterns: `### 代码模式

项目使用 LangGraph 框架，采用 TypeScript 实现。

状态接口继承自 \`BaseWorkflowState\`：
- 必须可序列化（不能包含函数）
- 使用 \`Partial<State>\` 返回状态更新

节点类继承自 \`BaseNode<TState>\`：
- 实现 \`executeLogic(state)\` 方法
- 支持超时控制和重试

工作流工厂实现 \`WorkflowFactory\` 接口：
- \`createGraph()\`: 创建 LangGraph 图
- \`createState(params)\`: 创建初始状态
- \`validateParams(params)\`: 验证参数
- \`getMetadata()\`: 获取元数据
`,
    bestPractices: `### 最佳实践

1. **命名规范**：
   - 工作流类型：kebab-case (e.g., "content-creator")
   - 节点名称：camelCase + "Node" 后缀
   - 状态接口：PascalCase + "State" 后缀

2. **节点设计**：
   - 单一职责原则
   - LLM 节点超时：90-180 秒
   - API 节点超时：30-60 秒

3. **质量检查**：
   - 关键节点启用质检
   - 支持 2-3 次重试

4. **工作流连接**：
   - 必须有明确起点和终点
   - 使用条件边处理失败重试
`,
    commonNodes: `### 常用节点类型

- **LLM 节点**：调用 LLM 进行推理或生成
- **API 节点**：调用外部 API（搜索、图片生成等）
- **Transform 节点**：数据转换和处理
- **Quality Check 节点**：质量检查和评分
`,
  };
}

// ============================================================================
// 导出
// ============================================================================

// 所有函数和类型已在定义处导出

