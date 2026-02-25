/**
 * LLM 服务模块
 *
 * 统一导出所有 LLM 服务相关的接口和实现
 */

// ========== 统一接口 ==========
export {
  type ILLMService,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
} from './ILLMService.js';

// ========== API 服务实现 ==========
export {
  EnhancedLLMService,
  enhancedLLMService,
} from './EnhancedLLMService.js';

// ========== CLI 服务实现 ==========
export {
  ClaudeCLIService,
  type ClaudeCLIConfig,
} from './ClaudeCLIService.js';

// ========== Provider 服务实现 ==========
export {
  ClaudeCLIProviderService,
  type ClaudeCLIProviderConfig,
} from './ClaudeCLIProviderService.js';

// ========== 服务工厂 ==========
export { LLMServiceFactory } from './LLMServiceFactory.js';

// ========== 默认导出（向后兼容） ==========
export { enhancedLLMService as llmService } from './EnhancedLLMService.js';
