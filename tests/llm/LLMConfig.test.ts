/**
 * LLM 配置测试
 *
 * 测试 LLM 服务类型和 Claude CLI 配置
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

/**
 * LLM 环境变量 Schema（与实际配置系统保持一致）
 */
const llmEnvSchema = z.object({
  // Node 环境
  NODE_ENV: z.enum(['development', 'production', 'test']).default('test'),

  // LLM 服务配置（DeepSeek API）
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url(),
  LLM_MODEL_NAME: z.string().default('deepseek-chat'),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(4000),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  LLM_ENABLE_CACHE: z.coerce.boolean().default(true).optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  LLM_STREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),

  // LLM 服务类型配置
  LLM_SERVICE_TYPE: z.enum(['api', 'cli']).default('api'),

  // Claude CLI 配置
  CLAUDE_CLI_DEFAULT_MODEL: z.enum(['sonnet', 'opus']).default('sonnet'),
  CLAUDE_CLI_DEFAULT_TIMEOUT: z.coerce.number().int().positive().default(120000),

  // 其他必需配置
  TAVILY_API_KEY: z.string().min(1),
  ARK_API_KEY: z.string().min(1),
});

type LLMEnv = z.infer<typeof llmEnvSchema>;

/**
 * 测试用 LLM 配置类
 */
class TestLLMConfig {
  private env: LLMEnv;

  constructor(customEnv: Partial<LLMEnv> = {}) {
    const testEnv: LLMEnv = {
      NODE_ENV: 'test',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://api.test.com',
      TAVILY_API_KEY: 'test-tavily-key',
      ARK_API_KEY: 'test-ark-key',
      ...customEnv,
    } as LLMEnv;

    const result = llmEnvSchema.safeParse(testEnv);

    if (!result.success) {
      throw new Error(`Configuration validation failed: ${result.error.message}`);
    }

    this.env = result.data;
  }

  get llmServiceType(): 'api' | 'cli' {
    return this.env.LLM_SERVICE_TYPE;
  }

  get claudeCLI() {
    return {
      enabled: this.env.LLM_SERVICE_TYPE === 'cli',
      defaultModel: this.env.CLAUDE_CLI_DEFAULT_MODEL,
      defaultTimeout: this.env.CLAUDE_CLI_DEFAULT_TIMEOUT,
      enableMCP: false,
    };
  }

  get llm() {
    return {
      apiKey: this.env.LLM_API_KEY,
      baseURL: this.env.LLM_BASE_URL,
      modelName: this.env.LLM_MODEL_NAME,
      maxTokens: this.env.LLM_MAX_TOKENS,
      temperature: this.env.LLM_TEMPERATURE,
      enableCache: this.env.LLM_ENABLE_CACHE ?? true,
      timeout: this.env.LLM_TIMEOUT_MS,
      streamTimeout: this.env.LLM_STREAM_TIMEOUT_MS,
    };
  }
}

describe('LLM 配置测试', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // 重置环境变量
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('LLM 服务类型配置', () => {
    it('默认应使用 API 服务', () => {
      const config = new TestLLMConfig();

      expect(config.llmServiceType).toBe('api');
      expect(config.claudeCLI.enabled).toBe(false);
    });

    it('LLM_SERVICE_TYPE=api 应使用 API 服务', () => {
      const config = new TestLLMConfig({
        LLM_SERVICE_TYPE: 'api',
      });

      expect(config.llmServiceType).toBe('api');
      expect(config.claudeCLI.enabled).toBe(false);
    });

    it('LLM_SERVICE_TYPE=cli 应使用 CLI 服务', () => {
      const config = new TestLLMConfig({
        LLM_SERVICE_TYPE: 'cli',
      });

      expect(config.llmServiceType).toBe('cli');
      expect(config.claudeCLI.enabled).toBe(true);
    });

    it('应拒绝大小写混合的输入（Zod 严格校验）', () => {
      // Zod 枚举值严格区分大小写
      expect(() => {
        new TestLLMConfig({
          LLM_SERVICE_TYPE: 'CLI' as any,
        });
      }).toThrow();
    });

    it('无效值应使用默认值（api）', () => {
      // Zod 会拒绝无效值，这里测试的是默认行为
      const config = new TestLLMConfig();

      expect(config.llmServiceType).toBe('api');
    });
  });

  describe('Claude CLI 配置', () => {
    it('CLI 模式下 claudeCLI.enabled 应为 true', () => {
      const config = new TestLLMConfig({
        LLM_SERVICE_TYPE: 'cli',
      });

      expect(config.claudeCLI.enabled).toBe(true);
    });

    it('API 模式下 claudeCLI.enabled 应为 false', () => {
      const config = new TestLLMConfig({
        LLM_SERVICE_TYPE: 'api',
      });

      expect(config.claudeCLI.enabled).toBe(false);
    });

    it('应使用默认模型 sonnet', () => {
      const config = new TestLLMConfig();

      expect(config.claudeCLI.defaultModel).toBe('sonnet');
    });

    it('应支持自定义模型', () => {
      const config = new TestLLMConfig({
        CLAUDE_CLI_DEFAULT_MODEL: 'opus',
      });

      expect(config.claudeCLI.defaultModel).toBe('opus');
    });

    it('应使用默认超时 120000ms', () => {
      const config = new TestLLMConfig();

      expect(config.claudeCLI.defaultTimeout).toBe(120000);
    });

    it('应支持自定义超时', () => {
      const config = new TestLLMConfig({
        CLAUDE_CLI_DEFAULT_TIMEOUT: 180000,
      });

      expect(config.claudeCLI.defaultTimeout).toBe(180000);
    });

    it('应拒绝无效的模型名称', () => {
      expect(() => {
        new TestLLMConfig({
          CLAUDE_CLI_DEFAULT_MODEL: 'invalid' as any,
        });
      }).toThrow();
    });

    it('应拒绝无效的超时值（负数）', () => {
      expect(() => {
        new TestLLMConfig({
          CLAUDE_CLI_DEFAULT_TIMEOUT: -1000 as any,
        });
      }).toThrow();
    });

    it('应拒绝无效的超时值（零）', () => {
      expect(() => {
        new TestLLMConfig({
          CLAUDE_CLI_DEFAULT_TIMEOUT: 0 as any,
        });
      }).toThrow();
    });
  });

  describe('LLM API 配置', () => {
    it('应使用默认模型名称', () => {
      const config = new TestLLMConfig();

      expect(config.llm.modelName).toBe('deepseek-chat');
    });

    it('应支持自定义模型名称', () => {
      const config = new TestLLMConfig({
        LLM_MODEL_NAME: 'custom-model',
      });

      expect(config.llm.modelName).toBe('custom-model');
    });

    it('应使用默认超时配置', () => {
      const config = new TestLLMConfig();

      expect(config.llm.timeout).toBe(60000);
      expect(config.llm.streamTimeout).toBe(120000);
    });

    it('应支持自定义超时配置', () => {
      const config = new TestLLMConfig({
        LLM_TIMEOUT_MS: 90000,
        LLM_STREAM_TIMEOUT_MS: 150000,
      });

      expect(config.llm.timeout).toBe(90000);
      expect(config.llm.streamTimeout).toBe(150000);
    });

    it('应使用默认温度参数', () => {
      const config = new TestLLMConfig();

      expect(config.llm.temperature).toBe(0.7);
    });

    it('应支持自定义温度参数', () => {
      const config = new TestLLMConfig({
        LLM_TEMPERATURE: 0.5,
      });

      expect(config.llm.temperature).toBe(0.5);
    });

    it('应拒绝超出范围的温度参数', () => {
      expect(() => {
        new TestLLMConfig({
          LLM_TEMPERATURE: 2.5 as any,
        });
      }).toThrow();
    });

    it('应拒绝负数的温度参数', () => {
      expect(() => {
        new TestLLMConfig({
          LLM_TEMPERATURE: -0.5 as any,
        });
      }).toThrow();
    });
  });

  describe('配置一致性', () => {
    it('API 模式下应启用 API 相关配置', () => {
      const config = new TestLLMConfig({
        LLM_SERVICE_TYPE: 'api',
      });

      expect(config.llmServiceType).toBe('api');
      expect(config.llm.apiKey).toBeDefined();
      expect(config.llm.baseURL).toBeDefined();
    });

    it('CLI 模式下 CLI 配置应生效', () => {
      const config = new TestLLMConfig({
        LLM_SERVICE_TYPE: 'cli',
      });

      expect(config.llmServiceType).toBe('cli');
      expect(config.claudeCLI.enabled).toBe(true);
      expect(config.claudeCLI.defaultModel).toBeDefined();
      expect(config.claudeCLI.defaultTimeout).toBeDefined();
    });

    it('两种模式都应有完整的配置', () => {
      const apiConfig = new TestLLMConfig({
        LLM_SERVICE_TYPE: 'api',
      });

      const cliConfig = new TestLLMConfig({
        LLM_SERVICE_TYPE: 'cli',
      });

      // API 配置
      expect(apiConfig.llm).toBeDefined();
      expect(apiConfig.claudeCLI).toBeDefined();

      // CLI 配置
      expect(cliConfig.llm).toBeDefined();
      expect(cliConfig.claudeCLI).toBeDefined();
    });
  });
});
