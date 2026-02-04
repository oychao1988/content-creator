t;
/**
 * 问候生成工作流状态接口
 *
 * 继承自 BaseWorkflowState，包含问候生成工作流的特定字段
 */
export interface GreetingGeneratorState extends BaseWorkflowState {
  // ========== 输入参数 ==========
  name: string; // 问候对象的姓名
  timeOfDay?: string; // 问候时段（morning/afternoon/evening）
  language?: string; // 问候语言（zh/en）

  // ========== 流程数据 ==========
  greetingText?: string; // 生成的问候语

  // ========== 控制数据 ==========
  greetingRetryCount: number; // 问候生成重试次数

  // ========== 工作流类型标识 ==========
  workflowType: 'greeting-generator';
}
