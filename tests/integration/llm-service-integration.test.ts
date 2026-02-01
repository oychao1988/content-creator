/**
 * LLM 服务集成测试
 *
 * 测试真实的 API 和 CLI 调用，包括流式和非流式模式
 *
 * 运行方式：
 * - 测试 API 模式：npm test -- tests/integration/llm-service-integration.test.ts
 * - 测试 CLI 模式：LLM_SERVICE_TYPE=cli npm test -- tests/integration/llm-service-integration.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { LLMServiceFactory } from '../../src/services/llm/LLMServiceFactory.js';
import { config } from '../../src/config/index.js';

describe('LLM 服务集成测试', () => {
  describe('API 模式 (EnhancedLLMService)', () => {
    // 跳过集成测试（除非显式启用）
    const shouldRun = process.env.LLM_SERVICE_TYPE !== 'cli' && process.env.RUN_INTEGRATION_TESTS === 'true';

    if (!shouldRun) {
      it.skip('跳过 API 集成测试（设置 RUN_INTEGRATION_TESTS=true 启用）', () => {});
      return;
    }

    let apiService: ReturnType<typeof LLMServiceFactory.createAPI>;

    beforeAll(() => {
      apiService = LLMServiceFactory.createAPI();
    });

    describe('非流式模式', () => {
      it('应该成功调用并返回完整响应', async () => {
        const result = await apiService.chat({
          messages: [
            { role: 'system', content: '你是一个助手' },
            { role: 'user', content: '用一句话介绍 TypeScript' },
          ],
          stream: false,
        });

        expect(result).toBeDefined();
        expect(result.content).toBeTruthy();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.usage).toBeDefined();
        expect(result.usage.totalTokens).toBeGreaterThan(0);
        expect(result.cost).toBeGreaterThanOrEqual(0);

        console.log('✓ API 非流式响应长度:', result.content.length);
        console.log('✓ Token 使用:', result.usage.totalTokens);
        console.log('✓ 成本:', result.cost);
      }, 30000);

      it('应该支持多轮对话', async () => {
        const result = await apiService.chat({
          messages: [
            { role: 'system', content: '你是一个助手' },
            { role: 'user', content: '1+1等于几？' },
            { role: 'assistant', content: '1+1等于2' },
            { role: 'user', content: '那2+2呢？' },
          ],
          stream: false,
        });

        expect(result.content).toContain('2');
        expect(result.usage.totalTokens).toBeGreaterThan(0);
      }, 30000);
    });

    describe('流式模式', () => {
      it('应该成功调用流式 API 并返回完整响应', async () => {
        const result = await apiService.chat({
          messages: [
            { role: 'system', content: '你是一个助手' },
            { role: 'user', content: '列举三个编程语言' },
          ],
          stream: true,
        });

        expect(result).toBeDefined();
        expect(result.content).toBeTruthy();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.usage).toBeDefined();
        expect(result.usage.totalTokens).toBeGreaterThan(0);

        // 流式响应应该包含多个编程语言
        const languages = ['Python', 'JavaScript', 'Java', 'TypeScript', 'Go', 'Rust'];
        const hasLanguages = languages.some(lang => result.content.includes(lang));
        expect(hasLanguages).toBe(true);

        console.log('✓ API 流式响应长度:', result.content.length);
        console.log('✓ Token 使用:', result.usage.totalTokens);
      }, 30000);

      it('流式和非流式应该返回相同质量的结果', async () => {
        const prompt = {
          messages: [
            { role: 'user', content: '什么是 API？' },
          ],
        };

        const [streamResult, nonStreamResult] = await Promise.all([
          apiService.chat({ ...prompt, stream: true }),
          apiService.chat({ ...prompt, stream: false }),
        ]);

        // 两种模式都应该返回有效响应
        expect(streamResult.content.length).toBeGreaterThan(50);
        expect(nonStreamResult.content.length).toBeGreaterThan(50);

        // 两种模式的 Token 使用应该相近
        const tokenDiff = Math.abs(
          streamResult.usage.totalTokens - nonStreamResult.usage.totalTokens
        );
        expect(tokenDiff).toBeLessThan(100); // 允许一定的差异

        console.log('✓ 流式 Token:', streamResult.usage.totalTokens);
        console.log('✓ 非流式 Token:', nonStreamResult.usage.totalTokens);
      }, 60000);
    });
  });

  describe('CLI 模式 (ClaudeCLIService)', () => {
    // 只在明确配置为 CLI 模式时运行
    const shouldRun = config.llmServiceType === 'cli' && process.env.RUN_INTEGRATION_TESTS === 'true';

    if (!shouldRun) {
      it.skip('跳过 CLI 集成测试（需要 LLM_SERVICE_TYPE=cli 和 RUN_INTEGRATION_TESTS=true）', () => {});
      return;
    }

    let cliService: ReturnType<typeof LLMServiceFactory.createCLI>;

    beforeAll(() => {
      cliService = LLMServiceFactory.createCLI();
    });

    describe('非流式模式', () => {
      it('应该成功调用 Claude CLI 并返回完整响应', async () => {
        const result = await cliService.chat({
          messages: [
            { role: 'system', content: '你是一个助手' },
            { role: 'user', content: '用一句话介绍 Node.js' },
          ],
          stream: false,
        });

        expect(result).toBeDefined();
        expect(result.content).toBeTruthy();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.usage).toBeDefined();
        expect(result.usage.totalTokens).toBeGreaterThan(0);
        expect(result.cost).toBeGreaterThanOrEqual(0);

        console.log('✓ CLI 非流式响应长度:', result.content.length);
        console.log('✓ Token 使用:', result.usage.totalTokens);
        console.log('✓ 成本:', result.cost);
      }, 180000);

      it('应该正确传递 system 消息', async () => {
        const result = await cliService.chat({
          messages: [
            { role: 'system', content: '你是一个数学专家。所有回答必须是数字。' },
            { role: 'user', content: '1+1等于几？' },
          ],
          stream: false,
        });

        expect(result.content).toMatch(/\d+/);
        expect(result.content).not.toContain('我不会');
      }, 180000);
    });

    describe('流式模式', () => {
      it('应该成功调用流式 CLI 并返回完整响应', async () => {
        const result = await cliService.chat({
          messages: [
            { role: 'system', content: '你是一个助手' },
            { role: 'user', content: '列出三个前端框架' },
          ],
          stream: true,
        });

        expect(result).toBeDefined();
        expect(result.content).toBeTruthy();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.usage).toBeDefined();

        // 应该包含前端框架名称
        const frameworks = ['React', 'Vue', 'Angular', 'Svelte', 'Solid'];
        const hasFrameworks = frameworks.some(fw => result.content.includes(fw));
        expect(hasFrameworks).toBe(true);

        console.log('✓ CLI 流式响应长度:', result.content.length);
        console.log('✓ Token 使用:', result.usage.totalTokens);
      }, 180000);

      it('应该正确解析流式 JSON 输出', async () => {
        // 测试实际 CLI 的流式 JSON 解析
        const result = await cliService.chat({
          messages: [
            { role: 'user', content: '说 "hello world"' },
          ],
          stream: true,
        });

        expect(result.content).toBeDefined();
        expect(result.content.toLowerCase()).toContain('hello');
        expect(result.content.toLowerCase()).toContain('world');

        console.log('✓ 流式解析结果:', result.content);
      }, 180000);
    });
  });

  describe('健康检查', () => {
    const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';

    if (!shouldRun) {
      it.skip('跳过健康检查测试（设置 RUN_INTEGRATION_TESTS=true 启用）', () => {});
      return;
    }

    it('API 服务健康检查应该通过', async () => {
      const apiService = LLMServiceFactory.createAPI();
      const isHealthy = await apiService.healthCheck();

      expect(isHealthy).toBe(true);
      console.log('✓ API 服务健康检查通过');
    }, 30000);

    if (config.llmServiceType === 'cli') {
      it('CLI 服务健康检查应该通过', async () => {
        const cliService = LLMServiceFactory.createCLI();
        const isHealthy = await cliService.healthCheck();

        expect(isHealthy).toBe(true);
        console.log('✓ CLI 服务健康检查通过');
      }, 30000);
    }
  });

  describe('Token 估算', () => {
    const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';

    if (!shouldRun) {
      it.skip('跳过 Token 估算测试（设置 RUN_INTEGRATION_TESTS=true 启用）', () => {});
      return;
    }

    it('API 服务应该正确估算 Token', async () => {
      const apiService = LLMServiceFactory.createAPI();

      const text = 'This is a test string for token estimation.';
      const estimatedTokens = apiService.estimateTokens(text);

      expect(estimatedTokens).toBeGreaterThan(0);
      expect(estimatedTokens).toBeLessThan(text.length); // Token 数应该少于字符数

      console.log('✓ 文本长度:', text.length);
      console.log('✓ 估算 Token:', estimatedTokens);
    });

    it('CLI 服务应该正确估算 Token', async () => {
      const cliService = LLMServiceFactory.createCLI();

      const text = '这是测试字符串的 token 估算。';
      const estimatedTokens = cliService.estimateTokens(text);

      expect(estimatedTokens).toBeGreaterThan(0);
      // 中文 Token 估算应该大约是字符数 / 1.5
      expect(estimatedTokens).toBeGreaterThanOrEqual(text.length / 2);

      console.log('✓ 文本长度:', text.length);
      console.log('✓ 估算 Token:', estimatedTokens);
    });
  });

  describe('成本估算', () => {
    const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';

    if (!shouldRun) {
      it.skip('跳过成本估算测试（设置 RUN_INTEGRATION_TESTS=true 启用）', () => {});
      return;
    }

    it('API 服务应该正确估算成本', () => {
      const apiService = LLMServiceFactory.createAPI();

      const cost = apiService.estimateCost(1000, 500);

      expect(cost).toBeGreaterThan(0);
      console.log('✓ 估算成本 (1000 in, 500 out):', cost);
    });

    it('CLI 服务应该正确估算成本', () => {
      const cliService = LLMServiceFactory.createCLI();

      const cost = cliService.estimateCost(1000, 500);

      expect(cost).toBeGreaterThan(0);
      console.log('✓ 估算成本 (1000 in, 500 out):', cost);
    });
  });
});
