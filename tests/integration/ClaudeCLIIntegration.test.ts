/**
 * Claude CLI 集成测试
 *
 * 测试使用真实的 Claude CLI 生成内容
 * 注意：此测试需要本地安装并配置 Claude CLI
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ClaudeCLIService } from '../../src/services/llm/ClaudeCLIService.js';
import { spawn } from 'child_process';

// 检查 Claude CLI 是否可用
async function isClaudeCLIAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('claude', ['--version']);
    let hasOutput = false;

    proc.stdout?.on('data', () => {
      hasOutput = true;
    });

    proc.on('close', (code) => {
      resolve(code === 0 && hasOutput);
    });

    proc.on('error', () => {
      resolve(false);
    });

    // 5秒超时
    setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);
  });
}

describe('Claude CLI Integration Tests', () => {
  let cliAvailable = false;

  beforeAll(async () => {
    cliAvailable = await isClaudeCLIAvailable();
    if (!cliAvailable) {
      console.warn('⚠️  Claude CLI 不可用，跳过集成测试');
    }
  }, 10000);

  describe('Basic Functionality', () => {
    it('should check if Claude CLI is available', async () => {
      if (!cliAvailable) {
        console.log('⚠️  Claude CLI 不可用，跳过测试');
        return;
      }

      const cliService = new ClaudeCLIService();

      // 检查 Claude CLI 是否可用
      const isAvailable = await cliService.healthCheck();
      expect(isAvailable).toBe(true);
    }, 300000); // 5分钟超时

    it('should generate content using Claude CLI', async () => {
      if (!cliAvailable) {
        console.log('⚠️  Claude CLI 不可用，跳过测试');
        return;
      }

      const cliService = new ClaudeCLIService();

      // 测试生成简单内容
      const response = await cliService.chat({
        messages: [
          {
            role: 'user',
            content: '请写一首简短的关于春天的诗，不超过50字',
          },
        ],
        model: 'sonnet',
      });

      // 验证响应
      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.usage.promptTokens).toBeGreaterThan(0);
      expect(response.usage.completionTokens).toBeGreaterThan(0);
      expect(response.cost).toBeGreaterThan(0);

      console.log('Generated content:', response.content);
      console.log('Token usage:', response.usage);
      console.log('Cost:', response.cost);
    }, 300000); // 5分钟超时
  });

  describe('Model Selection', () => {
    it('should use Sonnet model by default', async () => {
      if (!cliAvailable) {
        console.log('⚠️  Claude CLI 不可用，跳过测试');
        return;
      }

      const cliService = new ClaudeCLIService();

      const response = await cliService.chat({
        messages: [
          {
            role: 'user',
            content: '请回答：1+1等于多少？',
          },
        ],
      });

      expect(response.content).toBeDefined();
      expect(response.usage.promptTokens).toBeGreaterThan(0);
    }, 300000); // 5分钟超时

    it('should use Opus model when specified', async () => {
      if (!cliAvailable) {
        console.log('⚠️  Claude CLI 不可用，跳过测试');
        return;
      }

      const cliService = new ClaudeCLIService({ defaultModel: 'opus' });

      const response = await cliService.chat({
        messages: [
          {
            role: 'user',
            content: '请回答：1+1等于多少？',
          },
        ],
        model: 'opus',
      });

      expect(response.content).toBeDefined();
      expect(response.usage.promptTokens).toBeGreaterThan(0);
    }, 300000); // 5分钟超时
  });

  describe('Token Estimation', () => {
    it('should estimate tokens correctly for English text', async () => {
      const cliService = new ClaudeCLIService();
      const text = 'Hello world! This is a test message.';
      const tokens = cliService.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens correctly for Chinese text', async () => {
      const cliService = new ClaudeCLIService();
      const text = '你好，世界！这是一条测试消息。';
      const tokens = cliService.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate cost correctly for Sonnet model', async () => {
      const cliService = new ClaudeCLIService({ defaultModel: 'sonnet' });
      const cost = cliService.estimateCost(1000, 1000);
      expect(cost).toBeGreaterThan(0);
    });

    it('should estimate cost correctly for Opus model', async () => {
      const cliService = new ClaudeCLIService({ defaultModel: 'opus' });
      const cost = cliService.estimateCost(1000, 1000);
      expect(cost).toBeGreaterThan(0);
    });
  });
});
