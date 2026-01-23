/**
 * TokenUsage 领域模型
 *
 * 表示 API Token 使用记录和成本统计
 */

/**
 * Token 使用记录实体
 */
export interface TokenUsage {
  // 基础字段
  id: number;                    // 自增 ID
  taskId: string;                // 任务 ID
  traceId: string;               // 链路追踪 ID
  stepName: string;              // 步骤名称
  apiName: string;               // API 名称 (deepseek, doubao)
  modelName: string;             // 模型名称

  // Token 统计
  tokensIn: number;              // 输入 token
  tokensOut: number;             // 输出 token
  totalTokens: number;           // 总 token

  // 成本计算
  costPer1kTokensIn: number;     // 每 1k 输入 token 成本
  costPer1kTokensOut: number;    // 每 1k 输出 token 成本
  totalCost: number;             // 总成本

  // 元数据
  metadata?: TokenUsageMetadata; // 元数据（可选）

  // 时间戳
  createdAt: Date;               // 创建时间
}

/**
 * Token 使用元数据
 */
export interface TokenUsageMetadata {
  temperature?: number;          // 温度参数
  maxTokens?: number;            // 最大 token 限制
  duration?: number;             // API 调用耗时（毫秒）

  // 其他元数据
  [key: string]: any;
}

/**
 * 创建 Token 使用记录参数
 */
export interface CreateTokenUsageParams {
  taskId: string;
  traceId: string;
  stepName: string;
  apiName: string;
  modelName: string;
  tokensIn: number;
  tokensOut: number;
  costPer1kTokensIn: number;
  costPer1kTokensOut: number;
  metadata?: TokenUsageMetadata;
}

/**
 * Token 成本配置
 */
export interface TokenCostConfig {
  apiName: string;
  modelName: string;
  costPer1kTokensIn: number;
  costPer1kTokensOut: number;
}

/**
 * 常用 API 成本配置（单位：元/1k tokens）
 */
export const TOKEN_COST_CONFIGS: Record<string, TokenCostConfig[]> = {
  deepseek: [
    {
      apiName: 'deepseek',
      modelName: 'deepseek-chat',
      costPer1kTokensIn: 0.001,  // ¥0.001/1k tokens
      costPer1kTokensOut: 0.002, // ¥0.002/1k tokens
    },
  ],
  doubao: [
    {
      apiName: 'doubao',
      modelName: 'doubao-v1',
      costPer1kTokensIn: 0.008,
      costPer1kTokensOut: 0.008,
    },
  ],
};

/**
 * 计算 Token 成本
 */
export function calculateTokenCost(
  tokensIn: number,
  tokensOut: number,
  costPer1kTokensIn: number,
  costPer1kTokensOut: number
): number {
  const costIn = (tokensIn / 1000) * costPer1kTokensIn;
  const costOut = (tokensOut / 1000) * costPer1kTokensOut;
  return Number((costIn + costOut).toFixed(6));
}

/**
 * 获取 API 成本配置
 */
export function getTokenCostConfig(
  apiName: string,
  modelName: string
): TokenCostConfig | undefined {
  const configs = TOKEN_COST_CONFIGS[apiName];
  return configs?.find(config => config.modelName === modelName);
}
