/**
 * Quality Check Repository 接口
 */

/**
 * 创建质量检查记录参数
 */
export interface CreateQualityCheckParams {
  taskId: string;
  checkType: 'text' | 'image';
  score: number;
  passed: boolean;
  hardConstraintsPassed: boolean;
  details: Record<string, any>;
  fixSuggestions?: string[];
  rubricVersion?: string;
  modelName?: string;
  promptHash?: string;
}

/**
 * 质量检查记录
 */
export interface QualityCheckRecord {
  id: number;
  taskId: string;
  checkType: 'text' | 'image';
  score: number;
  passed: boolean;
  hardConstraintsPassed: boolean;
  details: Record<string, any>;
  fixSuggestions: string[] | null;
  rubricVersion: string | null;
  modelName: string | null;
  promptHash: string | null;
  createdAt: Date;
}

/**
 * Quality Check Repository 接口
 */
export interface IQualityCheckRepository {
  /**
   * 创建质量检查记录
   */
  create(params: CreateQualityCheckParams): Promise<void>;

  /**
   * 根据任务 ID 查询质量检查
   */
  findByTaskId(taskId: string): Promise<QualityCheckRecord[]>;
}
