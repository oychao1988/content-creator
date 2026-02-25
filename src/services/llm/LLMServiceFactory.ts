/**
 * LLMServiceFactory - LLM 服务工厂
 *
 * 根据配置创建对应的 LLM 服务实例
 * 支持 API、CLI 和 Provider 三种服务类型
 */

import { config } from '../../config/index.js';
import type { ILLMService } from './ILLMService.js';
import { EnhancedLLMService } from './EnhancedLLMService.js';
import { ClaudeCLIService } from './ClaudeCLIService.js';
import { ClaudeCLIProviderService } from './ClaudeCLIProviderService.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('LLMFactory');

/**
 * LLM 服务工厂类
 */
export class LLMServiceFactory {
  /**
   * 根据配置创建默认服务实例
   *
   * @returns LLM 服务实例
   */
  static create(): ILLMService {
    const serviceType = config.llmServiceType || 'api';

    logger.debug('Creating LLM service', { type: serviceType });

    if (serviceType === 'cli') {
      return this.createCLI();
    }

    if (serviceType === 'provider') {
      return this.createProvider();
    }

    return this.createAPI();
  }

  /**
   * 创建 CLI 服务实例
   *
   * @returns Claude CLI 服务实例
   */
  static createCLI(): ILLMService {
    logger.info('Creating Claude CLI service', {
      model: config.claudeCLI.defaultModel,
      timeout: config.claudeCLI.defaultTimeout,
    });

    return new ClaudeCLIService({
      defaultModel: config.claudeCLI.defaultModel,
      defaultTimeout: config.claudeCLI.defaultTimeout,
      enableMCP: config.claudeCLI.enableMCP,
    });
  }

  /**
   * 创建 API 服务实例
   *
   * @returns Enhanced LLM 服务实例
   */
  static createAPI(): ILLMService {
    logger.info('Creating Enhanced LLM API service');

    return new EnhancedLLMService();
  }

  /**
   *创建 Provider 服务实例（远程 claude-cli-provider）
   *
   * @returns claude-cli-provider 服务实例
   */
  static createProvider(): ILLMService {
    logger.info('Creating claude-cli-provider service', {
      baseURL: config.provider.baseURL,
      model: config.provider.defaultModel,
    });

    return new ClaudeCLIProviderService({
      baseURL: config.provider.baseURL,
      apiKey: config.provider.apiKey,
      defaultTimeout: config.provider.defaultTimeout,
      defaultModel: config.provider.defaultModel,
    });
  }
}
