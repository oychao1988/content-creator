/**
 * Result 领域模型
 *
 * 表示任务的生成结果（文本或图片）
 */

/**
 * 结果类型
 */
export enum ResultType {
  TEXT = 'text',                 // 文本结果
  IMAGE = 'image',               // 图片结果
  ARTICLE = 'article',           // 文章结果（别名）
}

/**
 * 结果实体
 */
export interface Result {
  // 基础字段
  id: number;                    // 自增 ID
  taskId: string;                // 所属任务 ID
  resultType: ResultType;        // 结果类型

  // 内容
  content?: string;              // 文本内容 (Markdown)
  filePath?: string;             // 文件路径

  // 元数据
  metadata: ResultMetadata;      // 元数据（JSON）

  // 质量信息（兼容旧接口）
  qualityScore?: number;         // 质量评分（0-100，可选）
  qualityChecks?: string[];      // 质量检查 ID 列表（可选）

  // 时间戳
  createdAt: Date;               // 创建时间
}

/**
 * 结果元数据
 */
export interface ResultMetadata {
  // 文章元数据
  wordCount?: number;            // 字数
  title?: string;                // 标题
  keywords?: string[];           // 关键词

  // 配图元数据
  prompt?: string;               // 生成提示词
  url?: string;                  // 图片 URL
  width?: number;                // 图片宽度
  height?: number;               // 图片高度

  // Token 元数据
  tokenCount?: number;           // Token 数量
  characterCount?: number;       // 字符数

  // 生成信息
  model?: string;                // 使用的模型
  parameters?: any;              // 生成参数

  // 来源引用
  sources?: Array<{
    url: string;
    title: string;
    snippet: string;
  }>;

  // 其他元数据
  [key: string]: any;
}

/**
 * 文本结果元数据
 */
export interface TextResultMetadata extends ResultMetadata {
  tokenCount: number;
  wordCount: number;
  characterCount: number;
  model: string;
  prompt?: string;
}

/**
 * 图片结果元数据
 */
export interface ImageResultMetadata extends ResultMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  model: string;
  prompt: string;
}

/**
 * 创建文本结果参数
 */
export interface CreateTextResultParams {
  taskId: string;
  content: string;
  tokenCount: number;
  wordCount?: number;
  model?: string;
  prompt?: string;
}

/**
 * 创建图片结果参数
 */
export interface CreateImageResultParams {
  taskId: string;
  imageUrl: string;
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  model?: string;
  prompt?: string;
}

/**
 * 更新结果参数
 */
export interface UpdateResultParams {
  qualityScore?: number;
  qualityChecks?: string[];
  metadata?: ResultMetadata;
}
