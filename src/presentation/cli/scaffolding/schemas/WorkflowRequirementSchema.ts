/**
 * WorkflowRequirementSchema - 工作流需求 Schema 定义
 *
 * 定义工作流脚手架系统的数据结构和验证规则
 * 用于 AI 需求理解引擎的输入输出
 */

import { z } from 'zod';

// ============================================================================
// 参数定义 Schema
// ============================================================================

/**
 * 参数定义 Schema
 * 定义工作流输入参数的结构
 */
export const ParamDefinitionSchema = z.object({
  /** 参数名称（camelCase 格式） */
  name: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, {
    message: 'Parameter name must be camelCase (e.g., "sourceText")',
  }),

  /** 参数类型 */
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),

  /** 是否必需 */
  required: z.boolean(),

  /** 参数描述 */
  description: z.string().min(1, 'Description is required'),

  /** 默认值（可选） */
  defaultValue: z.any().optional(),

  /** 示例值（可选） */
  examples: z.array(z.any()).optional(),
});

/**
 * 参数定义类型
 */
export type ParamDefinition = z.infer<typeof ParamDefinitionSchema>;

// ============================================================================
// 节点设计 Schema
// ============================================================================

/**
 * 节点类型枚举
 */
export const NodeTypeEnum = z.enum([
  'llm',           // LLM 调用节点
  'api',           // 外部 API 调用节点
  'transform',     // 数据转换节点
  'quality_check', // 质量检查节点
  'custom',        // 自定义节点
]);

/**
 * 节点设计 Schema
 * 定义工作流节点的结构
 */
export const NodeDesignSchema = z.object({
  /** 节点名称（camelCase 格式） */
  name: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, {
    message: 'Node name must be camelCase (e.g., "searchNode")',
  }),

  /** 节点显示名称 */
  displayName: z.string().min(1, 'Display name is required'),

  /** 节点描述 */
  description: z.string().min(1, 'Description is required'),

  /** 节点类型 */
  nodeType: NodeTypeEnum,

  /** 超时时间（毫秒） */
  timeout: z.number().int().positive().default(60000),

  /** 是否使用 LLM */
  useLLM: z.boolean().default(false),

  /** LLM 系统 Prompt（当 useLLM=true 时必需） */
  llmSystemPrompt: z.string().optional(),

  /** 是否启用质量检查 */
  enableQualityCheck: z.boolean().default(false),

  /** 质量检查 Prompt（当 enableQualityCheck=true 时必需） */
  qualityCheckPrompt: z.string().optional(),

  /** 依赖的节点列表（节点名称数组） */
  dependencies: z.array(z.string()).default([]),
});

/**
 * 节点设计类型
 */
export type NodeDesign = z.infer<typeof NodeDesignSchema>;

// ============================================================================
// 连接关系 Schema
// ============================================================================

/**
 * 连接关系 Schema
 * 定义节点之间的连接关系
 */
export const ConnectionSchema = z.object({
  /** 源节点名称 */
  from: z.string().min(1, 'Source node name is required'),

  /** 目标节点名称 */
  to: z.string().min(1, 'Target node name is required'),

  /** 条件表达式（可选，用于条件路由） */
  condition: z.string().optional(),
});

/**
 * 连接关系类型
 */
export type Connection = z.infer<typeof ConnectionSchema>;

// ============================================================================
// 工作流需求 Schema
// ============================================================================

/**
 * 工作流分类枚举
 */
export const WorkflowCategoryEnum = z.enum([
  'content',       // 内容创作
  'translation',   // 翻译
  'analysis',      // 分析
  'automation',    // 自动化
  'other',         // 其他
]);

/**
 * 工作流需求 Schema
 * 定义完整的工作流需求结构
 */
export const WorkflowRequirementSchema = z.object({
  /** 工作流类型（kebab-case 格式） */
  type: z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, {
    message: 'Workflow type must be kebab-case (e.g., "content-creator")',
  }),

  /** 工作流名称 */
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),

  /** 工作流描述 */
  description: z.string().min(10, 'Description too short').max(500, 'Description too long'),

  /** 工作流分类 */
  category: WorkflowCategoryEnum,

  /** 标签列表 */
  tags: z.array(z.string()).default([]),

  /** 输入参数定义列表 */
  inputParams: z.array(ParamDefinitionSchema).min(1, 'At least one input parameter is required'),

  /** 输出字段列表 */
  outputFields: z.array(z.string()).min(1, 'At least one output field is required'),

  /** 节点设计列表 */
  nodes: z.array(NodeDesignSchema).min(1, 'At least one node is required'),

  /** 连接关系列表 */
  connections: z.array(ConnectionSchema).min(1, 'At least one connection is required'),

  /** 是否启用质量检查 */
  enableQualityCheck: z.boolean().default(true),

  /** 最大重试次数 */
  maxRetries: z.number().int().min(0).max(10).default(3),

  /** 是否启用检查点 */
  enableCheckpoint: z.boolean().default(true),
}).refine(
  (data) => {
    // 验证：所有连接中的节点必须在 nodes 列表中存在
    const nodeNames = new Set(data.nodes.map((n) => n.name));
    const fromNodes = new Set(data.connections.map((c) => c.from));
    const toNodes = new Set(data.connections.map((c) => c.to));

    for (const fromNode of fromNodes) {
      if (!nodeNames.has(fromNode) && fromNode !== 'START') {
        return false;
      }
    }

    for (const toNode of toNodes) {
      if (!nodeNames.has(toNode) && toNode !== 'END') {
        return false;
      }
    }

    return true;
  },
  {
    message: 'All nodes in connections must exist in the nodes list (except START and END)',
  }
).refine(
  (data) => {
    // 验证：所有节点的依赖必须在 nodes 列表中存在
    const nodeNames = new Set(data.nodes.map((n) => n.name));

    for (const node of data.nodes) {
      for (const dep of node.dependencies) {
        if (!nodeNames.has(dep)) {
          return false;
        }
      }
    }

    return true;
  },
  {
    message: 'All node dependencies must exist in the nodes list',
  }
).refine(
  (data) => {
    // 验证：如果节点使用 LLM，必须提供 llmSystemPrompt
    for (const node of data.nodes) {
      if (node.useLLM && !node.llmSystemPrompt) {
        return false;
      }
    }

    return true;
  },
  {
    message: 'Nodes with useLLM=true must provide llmSystemPrompt',
  }
).refine(
  (data) => {
    // 验证：如果节点启用质量检查，必须提供 qualityCheckPrompt
    for (const node of data.nodes) {
      if (node.enableQualityCheck && !node.qualityCheckPrompt) {
        return false;
      }
    }

    return true;
  },
  {
    message: 'Nodes with enableQualityCheck=true must provide qualityCheckPrompt',
  }
);

/**
 * 工作流需求类型
 */
export type WorkflowRequirement = z.infer<typeof WorkflowRequirementSchema>;

// ============================================================================
// 辅助类型和函数
// ============================================================================

/**
 * 验证结果
 */
export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 验证工作流需求
 *
 * @param data - 待验证的数据
 * @returns 验证结果
 */
export function validateWorkflowRequirement(data: unknown): ValidationResult {
  const result: ValidationResult = {
    success: true,
    errors: [],
    warnings: [],
  };

  try {
    WorkflowRequirementSchema.parse(data);

    // 额外的业务逻辑验证
    const requirement = data as WorkflowRequirement;

    // 检查是否有起始节点
    const hasStartConnection = requirement.connections.some(
      (c) => c.from === 'START' || c.from === '__start__'
    );
    if (!hasStartConnection) {
      result.warnings.push('No START connection found. Workflow may not have an entry point.');
    }

    // 检查是否有结束节点
    const hasEndConnection = requirement.connections.some(
      (c) => c.to === 'END' || c.to === '__end__'
    );
    if (!hasEndConnection) {
      result.warnings.push('No END connection found. Workflow may not have a proper exit point.');
    }

    // 检查是否有孤立节点
    const connectedNodes = new Set<string>();
    requirement.connections.forEach((c) => {
      connectedNodes.add(c.from);
      connectedNodes.add(c.to);
    });
    const orphanNodes = requirement.nodes.filter(
      (n) => !connectedNodes.has(n.name)
    );
    if (orphanNodes.length > 0) {
      result.warnings.push(
        `Found ${orphanNodes.length} orphaned nodes: ${orphanNodes.map((n) => n.name).join(', ')}`
      );
    }

    // 检查节点名称是否重复
    const nodeNames = requirement.nodes.map((n) => n.name);
    const duplicates = nodeNames.filter(
      (name, index) => nodeNames.indexOf(name) !== index
    );
    if (duplicates.length > 0) {
      result.errors.push(`Duplicate node names found: ${[...new Set(duplicates)].join(', ')}`);
      result.success = false;
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      result.success = false;
      result.errors = error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
    } else {
      result.success = false;
      result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

/**
 * 获取工作流需求的默认值
 *
 * @returns 工作流需求的默认值
 */
export function getDefaultWorkflowRequirement(): Partial<WorkflowRequirement> {
  return {
    category: 'other',
    tags: [],
    enableQualityCheck: true,
    maxRetries: 3,
    enableCheckpoint: true,
  };
}

// ============================================================================
// 导出
// ============================================================================

export default {
  ParamDefinitionSchema,
  NodeDesignSchema,
  ConnectionSchema,
  WorkflowRequirementSchema,
  validateWorkflowRequirement,
  getDefaultWorkflowRequirement,
};
