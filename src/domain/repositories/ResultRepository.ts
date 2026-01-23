/**
 * Result Repository 接口
 */

/**
 * 创建结果参数
 */
export interface CreateResultParams {
  taskId: string;
  resultType: 'article' | 'image' | 'text';
  content?: string;
  filePath?: string;
  metadata?: Record<string, any>;
}

/**
 * 结果记录
 */
export interface ResultRecord {
  id: number;
  taskId: string;
  resultType: 'article' | 'image' | 'text';
  content: string | null;
  filePath: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

/**
 * Result Repository 接口
 */
export interface IResultRepository {
  /**
   * 创建结果记录
   */
  create(params: CreateResultParams): Promise<void>;

  /**
   * 根据任务 ID 查询结果
   */
  findByTaskId(taskId: string): Promise<ResultRecord[]>;

  /**
   * 删除任务的所有结果
   */
  deleteByTaskId(taskId: string): Promise<void>;
}
