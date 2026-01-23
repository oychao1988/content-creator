/**
 * QualityCheck 领域模型
 *
 * 表示质量检查记录
 */

/**
 * 检查类型
 */
export enum CheckType {
  HARD_RULE = 'hard_rule',       // 硬规则检查
  LLM = 'llm',                   // LLM 检查
  TEXT = 'text',                 // 文本质检
  IMAGE = 'image',               // 图片质检
}

/**
 * 检查类别
 */
export enum CheckCategory {
  // 文本检查类别
  TEXT_LENGTH = 'text_length',           // 文本长度
  TEXT_FORMAT = 'text_format',           // 文本格式
  SPELLING = 'spelling',                 // 拼写检查
  GRAMMAR = 'grammar',                   // 语法检查
  STYLE = 'style',                       // 风格检查
  PLAGIARISM = 'plagiarism',             // 原创性检查

  // 图片检查类别
  IMAGE_SIZE = 'image_size',             // 图片尺寸
  IMAGE_FORMAT = 'image_format',         // 图片格式
  IMAGE_QUALITY = 'image_quality',       // 图片质量
  CONTENT_SAFETY = 'content_safety',     // 内容安全

  // 内容检查类别
  RELEVANCE = 'relevance',               // 相关性
  COMPLETENESS = 'completeness',         // 完整性
  ENGAGEMENT = 'engagement',             // 吸引力
  BRAND_SAFETY = 'brand_safety',         // 品牌安全
}

/**
 * 质量检查实体
 */
export interface QualityCheck {
  // 基础字段
  id: number;                    // 自增 ID
  taskId: string;                // 所属任务 ID
  checkType: CheckType;          // 检查类型 (text/image)

  // 评分
  score: number;                 // 1-10 分
  passed: boolean;               // 是否通过
  hardConstraintsPassed: boolean; // 硬性约束是否通过

  // 详情
  details: QualityCheckDetails;  // 检查详情

  // 改进建议（用于重写/重生成）
  fixSuggestions?: string[];     // 改进建议

  // 元数据
  rubricVersion?: string;        // 评分标准版本
  modelName?: string;            // 使用的模型
  promptHash?: string;           // Prompt hash

  // 时间戳
  checkedAt: Date;               // 检查时间

  // 兼容旧接口（可选）
  resultId?: string;             // 关联的结果 ID（可选）
  category?: CheckCategory;      // 检查类别（可选）
  reason?: string;               // 原因说明（可选）
  createdAt?: Date;              // 创建时间（可选）
}

/**
 * 检查详情
 */
export interface QualityCheckDetails {
  // 硬规则检查结果
  hardRules?: {
    wordCount?: { passed: boolean; wordCount: number };
    keywords?: { passed: boolean; found: string[] };
    structure?: { passed: boolean; checks: object };
  };

  // 软评分（LLM）
  softScores?: {
    relevance?: { score: number; reason: string };
    coherence?: { score: number; reason: string };
    completeness?: { score: number; reason: string };
    readability?: { score: number; reason: string };
  };

  // 文本质检
  wordCount?: number;            // 字数统计
  keywordsFound?: string[];      // 找到的关键词
  structureCheck?: {
    hasTitle: boolean;
    hasIntro: boolean;
    hasBody: boolean;
    hasConclusion: boolean;
  };

  // 配图质检
  relevanceScore?: number;       // 相关性评分
  aestheticScore?: number;       // 美学评分
  promptMatch?: number;          // 提示词匹配度

  // 其他详情（兼容旧接口）
  rule?: {
    name: string;
    threshold?: any;
    actual?: any;
    expected?: any;
  };
  llm?: {
    prompt: string;
    response: string;
    reasoning?: string;
    criteria: string[];
  };
  issues?: CheckIssue[];

  // 扩展字段
  [key: string]: any;
}

/**
 * 兼容旧接口的 CheckDetails 类型别名
 */
export interface CheckDetails extends QualityCheckDetails {}

/**
 * 检查问题
 */
export interface CheckIssue {
  severity: 'error' | 'warning' | 'info'; // 严重程度
  message: string;               // 问题描述
  location?: string;             // 位置（可选）
  suggestion?: string;           // 建议修改（可选）
}

/**
 * 创建硬规则检查参数
 */
export interface CreateHardRuleCheckParams {
  taskId: string;
  resultId?: string;
  category: CheckCategory;
  rule: {
    name: string;
    threshold?: any;
    expected?: any;
  };
  actual: any;
}

/**
 * 创建 LLM 检查参数
 */
export interface CreateLLMCheckParams {
  taskId: string;
  resultId?: string;
  category: CheckCategory;
  content: string;
  criteria: string[];
  prompt?: string;
}

/**
 * 检查结果
 */
export interface CheckResult {
  passed: boolean;
  score?: number;
  reason?: string;
  details?: CheckDetails;
}

/**
 * 质量阈值配置
 */
export interface QualityThresholds {
  // 文本质量阈值
  minLength?: number;            // 最小长度
  maxLength?: number;            // 最大长度
  minScore?: number;             // 最低质量分

  // 图片质量阈值
  minWidth?: number;             // 最小宽度
  minHeight?: number;            // 最小高度
  maxWidth?: number;             // 最大宽度
  maxHeight?: number;            // 最大高度
  maxSize?: number;              // 最大文件大小（字节）

  // 质量评分阈值
  passScore?: number;            // 及格分
  goodScore?: number;            // 良好分
  excellentScore?: number;       // 优秀分
}
