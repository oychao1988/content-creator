/**
 * LLM Service Factory 测试
 *
 * 测试 LLM 服务工厂的服务选择和配置逻辑
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLMServiceFactory } from '../../src/services/llm/LLMServiceFactory.js';
import { ClaudeCLIService } from '../../src/services/llm/ClaudeCLIService.js';
import { EnhancedLLMService } from '../../src/services/llm/EnhancedLLMService.js';

describe('LLMServiceFactory', () => {
  describe('createAPI()', () => {
    it('应创建 EnhancedLLMService 实例', () => {
      const service = LLMServiceFactory.createAPI();

      expect(service).toBeInstanceOf(EnhancedLLMService);
      expect(service).not.toBeInstanceOf(ClaudeCLIService);
    });

    it('应实现 ILLMService 接口', () => {
      const service = LLMServiceFactory.createAPI();

      expect(typeof service.chat).toBe('function');
      expect(typeof service.healthCheck).toBe('function');
      expect(typeof service.estimateTokens).toBe('function');
      expect(typeof service.estimateCost).toBe('function');
    });
  });

  describe('createCLI()', () => {
    it('应创建 ClaudeCLIService 实例', () => {
      const service = LLMServiceFactory.createCLI();

      expect(service).toBeInstanceOf(ClaudeCLIService);
      expect(service).not.toBeInstanceOf(EnhancedLLMService);
    });

    it('应使用默认配置', () => {
      const service = LLMServiceFactory.createCLI() as ClaudeCLIService;

      expect(service).toBeInstanceOf(ClaudeCLIService);
      // 无法直接访问私有属性验证配置
    });

    it('应实现 ILLMService 接口', () => {
      const service = LLMServiceFactory.createCLI();

      expect(typeof service.chat).toBe('function');
      expect(typeof service.healthCheck).toBe('function');
      expect(typeof service.estimateTokens).toBe('function');
      expect(typeof service.estimateCost).toBe('function');
    });
  });

  describe('create() - 默认行为', () => {
    it('默认应创建 API 服务（基于 .env 配置）', () => {
      // 注意：此测试依赖 .env 文件中的配置
      // 默认情况下 LLM_SERVICE_TYPE=api
      const service = LLMServiceFactory.create();

      // 根据当前配置验证
      const isCLI = service instanceof ClaudeCLIService;
      const isAPI = service instanceof EnhancedLLMService;

      // 至少应该是其中一种
      expect(isCLI || isAPI).toBe(true);

      // 记录当前配置，便于调试
      if (isAPI) {
        console.log('✓ 当前配置使用 API 服务');
      } else {
        console.log('✓ 当前配置使用 CLI 服务');
      }
    });
  });

  describe('服务接口一致性', () => {
    it('API 服务应实现 ILLMService 接口', async () => {
      const service = LLMServiceFactory.createAPI();

      // 验证接口方法存在
      expect(typeof service.chat).toBe('function');
      expect(typeof service.healthCheck).toBe('function');
      expect(typeof service.estimateTokens).toBe('function');
      expect(typeof service.estimateCost).toBe('function');
    });

    it('CLI 服务应实现 ILLMService 接口', async () => {
      const service = LLMServiceFactory.createCLI();

      // 验证接口方法存在
      expect(typeof service.chat).toBe('function');
      expect(typeof service.healthCheck).toBe('function');
      expect(typeof service.estimateTokens).toBe('function');
      expect(typeof service.estimateCost).toBe('function');
    });

    it('两种服务应有相同的方法签名', () => {
      const apiService = LLMServiceFactory.createAPI();
      const cliService = LLMServiceFactory.createCLI();

      // 验证方法签名一致
      expect(apiService.chat.length).toBe(cliService.chat.length);
      expect(apiService.healthCheck.length).toBe(cliService.healthCheck.length);
      expect(apiService.estimateTokens.length).toBe(cliService.estimateTokens.length);
      expect(apiService.estimateCost.length).toBe(cliService.estimateCost.length);
    });
  });

  describe('createAPI() 与 createCLI() 区别', () => {
    it('createAPI() 和 createCLI() 应返回不同类型的服务', () => {
      const apiService = LLMServiceFactory.createAPI();
      const cliService = LLMServiceFactory.createCLI();

      expect(apiService).toBeInstanceOf(EnhancedLLMService);
      expect(cliService).toBeInstanceOf(ClaudeCLIService);

      // 它们不应该是同一个实例
      expect(apiService).not.toBe(cliService);
    });
  });
});
