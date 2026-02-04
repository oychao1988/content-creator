t;
/**
 * 问候工作流状态接口
 *
 * 继承自 BaseWorkflowState，包含问候工作流的特定字段
 */
export interface GreetingState extends BaseWorkflowState {
  // ========== 输入参数 ==========
  name: string; // 问候对象的名字
  timeOfDay?: string; // 问候的时间段

  // ========== 流程数据 ==========
  greetingMessage?: string; // 生成的问候语

  // ========== 控制数据 ==========
  greetingRetryCount: number; // 问候语生成重试次数
}
