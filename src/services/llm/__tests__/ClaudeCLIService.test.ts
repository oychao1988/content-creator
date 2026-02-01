import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCLIService } from '../ClaudeCLIService.js';
import { LLMServiceFactory } from '../LLMServiceFactory.js';
import { EnhancedLLMService } from '../EnhancedLLMService.js';

describe('ClaudeCLIService', () => {
  describe('constructor', () => {
    it('should initialize with default config', () => {
      const service = new ClaudeCLIService();
      expect(service).toBeInstanceOf(ClaudeCLIService);
    });

    it('should initialize with custom config', () => {
      const config = {
        defaultModel: 'opus',
        defaultTimeout: 300000,
        enableMCP: true,
      };
      const service = new ClaudeCLIService(config);
      expect(service).toBeInstanceOf(ClaudeCLIService);
    });
  });

  describe('healthCheck', () => {
    it('should return true for healthy service', async () => {
      // 创建一个模拟 ClaudeCLIService 子类，重写 chat 方法
      class MockClaudeCLIService extends ClaudeCLIService {
        async chat() {
          return {
            content: 'test response',
            usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            cost: 0.0001,
          };
        }
      }

      const service = new MockClaudeCLIService();
      const result = await service.healthCheck();
      expect(result).toBe(true);
    });

    it('should return false for unhealthy service', async () => {
      class MockClaudeCLIService extends ClaudeCLIService {
        async chat() {
          throw new Error('API Error');
        }
      }

      const service = new MockClaudeCLIService();
      const result = await service.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens correctly for English text', () => {
      const service = new ClaudeCLIService();
      const text = 'Hello world! This is a test message.';
      const tokens = service.estimateTokens(text);
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens correctly for Chinese text', () => {
      const service = new ClaudeCLIService();
      const text = '你好，世界！这是一条测试消息。';
      const tokens = service.estimateTokens(text);
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens correctly for mixed text', () => {
      const service = new ClaudeCLIService();
      const text = 'Hello 世界！This is a 测试 message.';
      const tokens = service.estimateTokens(text);
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('cost estimation', () => {
    it('should estimate cost correctly for sonnet model', () => {
      const service = new ClaudeCLIService();
      const cost = service.estimateCost(1000, 1000);
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
    });

    it('should estimate cost correctly for opus model', () => {
      const service = new ClaudeCLIService({ defaultModel: 'opus' });
      const cost = service.estimateCost(1000, 1000);
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
    });
  });
});

describe('LLMServiceFactory', () => {
  describe('service creation', () => {
    it('should create API service by default', () => {
      const service = LLMServiceFactory.create();
      expect(service).toBeInstanceOf(EnhancedLLMService);
    });

    it('should create API service explicitly', () => {
      const service = LLMServiceFactory.createAPI();
      expect(service).toBeInstanceOf(EnhancedLLMService);
    });

    it('should create CLI service explicitly', () => {
      const service = LLMServiceFactory.createCLI();
      expect(service).toBeInstanceOf(ClaudeCLIService);
    });
  });
});
