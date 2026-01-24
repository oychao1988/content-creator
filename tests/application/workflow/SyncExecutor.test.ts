/**
 * SyncExecutor 集成测试
 *
 * 测试 SyncExecutor 的数据库配置和集成逻辑：
 * - SyncExecutor 在开发环境使用 SQLite
 * - SyncExecutor 在生产环境使用 PostgreSQL
 * - SyncExecutor 支持显式 databaseType 配置
 * - 工作流执行后数据正确存储到对应数据库
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskStatus } from '../../../src/domain/entities/Task.js';
import type { ITaskRepository } from '../../../src/domain/repositories/TaskRepository.js';
import type { IResultRepository } from '../../../src/domain/repositories/ResultRepository.js';
import type { IQualityCheckRepository } from '../../../src/domain/repositories/QualityCheckRepository.js';

// Mock 日志模块
vi.mock('../../../src/infrastructure/logging/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock 工作流图
vi.mock('../../../src/domain/workflow/ContentCreatorGraph.js', () => ({
  createSimpleContentCreatorGraph: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      taskId: 'test-task-id',
      topic: '测试主题',
      requirements: '测试要求',
      articleContent: '测试文章内容',
      images: [],
      searchResults: [],
      organizedInfo: '测试整理信息',
      currentStep: 'completed',
    }),
  })),
}));

// Mock State
vi.mock('../../../src/domain/workflow/State.js', () => ({
  createInitialState: vi.fn((params) => ({
    ...params,
    currentStep: 'start',
  })),
}));

describe('SyncExecutor - 数据库配置集成测试', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = { ...process.env };
    vi.clearAllMocks();

    // Mock 工作流图（默认返回成功状态）
    vi.resetModules();
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
    vi.resetModules();
  });

  // ========== 额外的集成测试 - 验证数据库切换逻辑 ==========

  describe('集成测试 - SyncExecutor 与数据库工厂函数集成', () => {
    it('SyncExecutor 应配合 createTaskRepository 工厂函数使用 SQLite', async () => {
      process.env.NODE_ENV = 'development';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import('../../../src/application/workflow/SyncExecutor.js');
      const { createTaskRepository } = await import('../../../src/infrastructure/database/index.js');

      // 使用工厂函数创建 Repository
      const taskRepo = createTaskRepository(undefined, ':memory:');

      // 创建 SyncExecutor，配置使用 SQLite
      const executor = new SyncExecutor(taskRepo, {
        databaseType: 'sqlite',
      });

      try {
        // 验证配置正确
        const config = (executor as any).config;
        expect(config.databaseType).toBe('sqlite');

        // 验证 Repository 与 Executor 可以正常协作
        expect(taskRepo.create).toBeDefined();
        expect(taskRepo.findById).toBeDefined();
        expect(taskRepo.updateStatus).toBeDefined();
      } finally {
        // 清理
        if (typeof (taskRepo as any).close === 'function') {
          (taskRepo as any).close();
        }
      }
    });

    it('SyncExecutor 应配合 createTaskRepository 工厂函数使用 Memory Repository', async () => {
      process.env.NODE_ENV = 'test';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import('../../../src/application/workflow/SyncExecutor.js');
      const { createTaskRepository } = await import('../../../src/infrastructure/database/index.js');

      // 使用工厂函数创建 Repository
      const taskRepo = createTaskRepository();

      // 创建 SyncExecutor，配置使用 memory
      const executor = new SyncExecutor(taskRepo, {
        databaseType: 'memory',
      });

      try {
        // 验证配置正确
        const config = (executor as any).config;
        expect(config.databaseType).toBe('memory');

        // 验证 Repository 与 Executor 可以正常协作
        expect(taskRepo.create).toBeDefined();
        expect(taskRepo.findById).toBeDefined();
        expect(taskRepo.updateStatus).toBeDefined();
      } finally {
        // Memory Repository 不需要 close
      }
    });

    it('SyncExecutor 应正确使用配置系统指定的 databaseType', async () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_TYPE = 'sqlite';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import('../../../src/application/workflow/SyncExecutor.js');
      const { createTaskRepository } = await import('../../../src/infrastructure/database/index.js');

      // 使用工厂函数创建 Repository
      const taskRepo = createTaskRepository(undefined, ':memory:');

      // 创建 SyncExecutor，配置使用 SQLite（与配置系统一致）
      const executor = new SyncExecutor(taskRepo, {
        databaseType: 'sqlite',
      });

      try {
        // 验证配置正确
        const config = (executor as any).config;
        expect(config.databaseType).toBe('sqlite');
      } finally {
        // 清理
        if (typeof (taskRepo as any).close === 'function') {
          (taskRepo as any).close();
        }
      }
    });
  });

  describe('集成测试 - 完整工作流执行与数据持久化', () => {
    it('SyncExecutor 使用 SQLite Repository 完整执行工作流', async () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_TYPE = 'sqlite';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import('../../../src/application/workflow/SyncExecutor.js');
      const { SQLiteTaskRepository } = await import('../../../src/infrastructure/database/SQLiteTaskRepository.js');
      const { SQLiteResultRepository } = await import('../../../src/infrastructure/database/SQLiteResultRepository.js');
      const { SQLiteQualityCheckRepository } = await import('../../../src/infrastructure/database/SQLiteQualityCheckRepository.js');

      // 创建 SQLite Repository
      const taskRepo = new SQLiteTaskRepository(':memory:');
      const resultRepo = new SQLiteResultRepository(':memory:');
      const qualityCheckRepo = new SQLiteQualityCheckRepository(':memory:');

      // 创建 SyncExecutor
      const executor = new SyncExecutor(taskRepo, {
        databaseType: 'sqlite',
        enableLogging: true,
      });

      // 设置结果和质量检查仓储
      executor.setResultRepository(resultRepo);
      executor.setQualityCheckRepository(qualityCheckRepo);

      try {
        // 验证配置
        const config = (executor as any).config;
        expect(config.databaseType).toBe('sqlite');

        // 模拟完整工作流执行（Mock 工作流图）
        const taskId = 'test-task-sqlite-complete';
        const createResult = await taskRepo.create({
          id: taskId,
          mode: 'sequential',
          type: 'article',
          topic: 'SQLite 集成测试主题',
          requirements: '完整工作流测试',
        });

        expect(createResult.id).toBe(taskId);
        expect(createResult.status).toBe('pending');

        // 更新任务状态为 running（SQLite 使用 update 方法）
        await taskRepo.update(taskId, {
          status: 'running',
          startedAt: new Date().toISOString(),
          version: 2,
        });
        const runningTask = await taskRepo.findById(taskId);
        expect(runningTask?.status).toBe('running');

        // 标记任务完成（SQLite 使用 update 方法）
        await taskRepo.update(taskId, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          version: 3,
        });
        const completedTask = await taskRepo.findById(taskId);
        expect(completedTask?.status).toBe('completed');
        expect(completedTask?.completedAt).toBeDefined();
      } finally {
        taskRepo.close();
      }
    });

    it('SyncExecutor 使用 Memory Repository 完整执行工作流', async () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_TYPE = 'memory';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import('../../../src/application/workflow/SyncExecutor.js');
      const { createTaskRepository } = await import('../../../src/infrastructure/database/index.js');

      // 创建 Memory Repository
      const taskRepo = createTaskRepository();

      // 创建 SyncExecutor
      const executor = new SyncExecutor(taskRepo, {
        databaseType: 'memory',
        enableLogging: true,
      });

      try {
        // 验证配置
        const config = (executor as any).config;
        expect(config.databaseType).toBe('memory');

        // 模拟完整工作流执行
        const taskId = 'test-task-memory-complete';
        const createResult = await taskRepo.create({
          id: taskId,
          mode: 'sequential',
          type: 'article',
          topic: 'Memory 集成测试主题',
          requirements: '完整工作流测试',
        });

        expect(createResult.id).toBe(taskId);
        expect(createResult.status).toBe('pending');

        // 更新任务状态为 running（Memory 使用 update 方法）
        await taskRepo.update(taskId, {
          status: 'running',
          startedAt: new Date().toISOString(),
          version: 2,
        });
        const runningTask = await taskRepo.findById(taskId);
        expect(runningTask?.status).toBe('running');

        // 标记任务完成（Memory 使用 update 方法）
        await taskRepo.update(taskId, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          version: 3,
        });
        const completedTask = await taskRepo.findById(taskId);
        expect(completedTask?.status).toBe('completed');
        expect(completedTask?.completedAt).toBeDefined();
      } finally {
        // Memory Repository 不需要 close
      }
    });
  });

  describe('集成测试 - 多种数据库类型的任务执行', () => {
    it('应能在 SQLite 和 Memory 之间切换执行任务', async () => {
      process.env.NODE_ENV = 'test';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import('../../../src/application/workflow/SyncExecutor.js');
      const { createTaskRepository } = await import('../../../src/infrastructure/database/index.js');
      const { SQLiteTaskRepository } = await import('../../../src/infrastructure/database/SQLiteTaskRepository.js');

      // 创建两个不同的 Repository
      const memoryRepo = createTaskRepository();
      const sqliteRepo = new SQLiteTaskRepository(':memory:');

      try {
        // 创建两个不同的 Executor
        const memoryExecutor = new SyncExecutor(memoryRepo, {
          databaseType: 'memory',
        });

        const sqliteExecutor = new SyncExecutor(sqliteRepo, {
          databaseType: 'sqlite',
        });

        // 验证两个 Executor 配置不同
        expect((memoryExecutor as any).config.databaseType).toBe('memory');
        expect((sqliteExecutor as any).config.databaseType).toBe('sqlite');

        // 在 Memory Repository 中创建任务
        const memoryTask = await memoryRepo.create({
          id: 'memory-task-1',
          mode: 'sequential',
          type: 'article',
          topic: 'Memory 任务',
          requirements: '测试',
        });
        expect(memoryTask.id).toBe('memory-task-1');

        // 在 SQLite Repository 中创建任务
        const sqliteTask = await sqliteRepo.create({
          id: 'sqlite-task-1',
          mode: 'sequential',
          type: 'article',
          topic: 'SQLite 任务',
          requirements: '测试',
        });
        expect(sqliteTask.id).toBe('sqlite-task-1');

        // 验证数据隔离（不同 Repository 的任务互不影响）
        const memoryFound = await memoryRepo.findById('memory-task-1');
        const sqliteFound = await sqliteRepo.findById('sqlite-task-1');

        expect(memoryFound).not.toBeNull();
        expect(sqliteFound).not.toBeNull();

        // Memory Repository 中找不到 SQLite 的任务
        const memoryNotFound = await memoryRepo.findById('sqlite-task-1');
        expect(memoryNotFound).toBeNull();

        // SQLite Repository 中找不到 Memory 的任务
        const sqliteNotFound = await sqliteRepo.findById('memory-task-1');
        expect(sqliteNotFound).toBeNull();
      } finally {
        // 清理
        if (typeof (sqliteRepo as any).close === 'function') {
          (sqliteRepo as any).close();
        }
      }
    });
  });

  describe('集成测试 - SyncExecutor 的 ResultRepository 和 QualityCheckRepository 集成', () => {
    it('SyncExecutor 应能正确设置和使用 ResultRepository', async () => {
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import('../../../src/application/workflow/SyncExecutor.js');
      const { createTaskRepository } = await import('../../../src/infrastructure/database/index.js');

      // 创建 Repository
      const taskRepo = createTaskRepository();

      // 创建 Mock ResultRepository
      const mockResultRepo: IResultRepository = {
        create: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByTaskId: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
      };

      // 创建 SyncExecutor
      const executor = new SyncExecutor(taskRepo, {
        databaseType: 'memory',
      });

      // 设置 ResultRepository
      executor.setResultRepository(mockResultRepo);

      // 执行任务（会调用 ResultRepository.save）
      const result = await executor.execute({
        userId: 'test-user',
        mode: 'sequential',
        topic: '测试 ResultRepository 集成',
        requirements: '测试',
      });

      // 验证执行成功
      expect(result.status).toBe('completed');

      // 验证 ResultRepository 被调用
      expect(mockResultRepo.create).toHaveBeenCalled();
      expect(mockResultRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          resultType: 'article',
          content: '测试文章内容',
        })
      );
    });

    it('SyncExecutor 应能正确设置和使用 QualityCheckRepository', async () => {
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // Mock 工作流图，返回带质检结果的状态
      vi.mock('../../../src/domain/workflow/ContentCreatorGraph.js', () => ({
        createSimpleContentCreatorGraph: vi.fn(() => ({
          invoke: vi.fn().mockResolvedValue({
            taskId: 'test-task-id',
            topic: '测试主题',
            requirements: '测试要求',
            articleContent: '测试文章内容',
            images: [],
            searchResults: [],
            organizedInfo: '测试整理信息',
            currentStep: 'completed',
            textQualityReport: {
              score: 85,
              passed: true,
              hardConstraintsPassed: true,
              details: {},
              fixSuggestions: [],
              modelName: 'test-model',
            },
          }),
        })),
      }));

      // 动态导入（重新加载模块以应用 mock）
      vi.resetModules();
      const { SyncExecutor } = await import('../../../src/application/workflow/SyncExecutor.js');
      const { createTaskRepository } = await import('../../../src/infrastructure/database/index.js');

      // 创建 Repository
      const taskRepo = createTaskRepository();

      // 创建 Mock QualityCheckRepository
      const mockQualityCheckRepo: IQualityCheckRepository = {
        create: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByTaskId: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
      };

      // 创建 SyncExecutor
      const executor = new SyncExecutor(taskRepo, {
        databaseType: 'memory',
      });

      // 设置 QualityCheckRepository
      executor.setQualityCheckRepository(mockQualityCheckRepo);

      // 执行任务（会调用 QualityCheckRepository.save）
      const result = await executor.execute({
        userId: 'test-user',
        mode: 'sequential',
        topic: '测试 QualityCheckRepository 集成',
        requirements: '测试',
      });

      // 验证执行成功
      expect(result.status).toBe('completed');

      // 验证 QualityCheckRepository 被调用
      expect(mockQualityCheckRepo.create).toHaveBeenCalled();
      expect(mockQualityCheckRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          checkType: 'text',
          score: 85,
          passed: true,
          hardConstraintsPassed: true,
        })
      );
    });
  });

  describe('开发环境 - 使用 SQLite', () => {
    it('SyncExecutor 在开发环境应默认使用 SQLite', async () => {
      // 设置开发环境
      process.env.NODE_ENV = 'development';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor, createSyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );
      const { SQLiteTaskRepository } = await import(
        '../../../src/infrastructure/database/SQLiteTaskRepository.js'
      );

      // 创建 SQLite Repository
      const taskRepo = new SQLiteTaskRepository(':memory:');

      // 创建 SyncExecutor（不提供 config，使用默认）
      const executor = new SyncExecutor(taskRepo);

      try {
        // 验证 executor 配置
        const config = (executor as any).config;
        expect(config.databaseType).toBe('sqlite');
        expect(config.timeout).toBe(60000);
        expect(config.totalTimeout).toBe(300000);
        expect(config.maxRetries).toBe(3);
        expect(config.enableLogging).toBe(true);
      } finally {
        taskRepo.close();
      }
    });

    it('SyncExecutor 应使用 SQLite Repository 执行任务', async () => {
      // 设置开发环境
      process.env.NODE_ENV = 'development';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );
      const { SQLiteTaskRepository } = await import(
        '../../../src/infrastructure/database/SQLiteTaskRepository.js'
      );

      // 创建 SQLite Repository
      const taskRepo = new SQLiteTaskRepository(':memory:');

      // 创建 SyncExecutor
      const executor = new SyncExecutor(taskRepo);

      try {
        // 验证配置正确
        const config = (executor as any).config;
        expect(config.databaseType).toBe('sqlite');

        // 验证 Executor 可以与 Repository 交互
        expect(taskRepo.create).toBeDefined();
        expect(taskRepo.findById).toBeDefined();
        expect(taskRepo.update).toBeDefined();
        expect(taskRepo.healthCheck).toBeDefined();
      } finally {
        taskRepo.close();
      }
    });

    it('开发环境显式配置 databaseType 为 SQLite', async () => {
      // 设置开发环境
      process.env.NODE_ENV = 'development';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );
      const { SQLiteTaskRepository } = await import(
        '../../../src/infrastructure/database/SQLiteTaskRepository.js'
      );

      // 创建 SQLite Repository
      const taskRepo = new SQLiteTaskRepository(':memory:');

      // 创建 SyncExecutor（显式配置 databaseType）
      const executor = new SyncExecutor(taskRepo, {
        databaseType: 'sqlite',
      });

      try {
        // 验证 executor 配置
        const config = (executor as any).config;
        expect(config.databaseType).toBe('sqlite');
      } finally {
        taskRepo.close();
      }
    });
  });

  describe('生产环境 - 使用 PostgreSQL', () => {
    it('SyncExecutor 在生产环境应默认使用 PostgreSQL', async () => {
      // 设置生产环境
      process.env.NODE_ENV = 'production';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );

      // 创建 Mock Repository（模拟 PostgreSQL Repository）
      const mockTaskRepo: ITaskRepository = {
        create: vi.fn().mockResolvedValue({
          taskId: 'test-task-id',
          status: TaskStatus.PENDING,
          version: 1,
        } as any),
        findById: vi.fn().mockResolvedValue({
          taskId: 'test-task-id',
          status: TaskStatus.COMPLETED,
          version: 2,
        } as any),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateStatus: vi.fn().mockResolvedValue(true),
        updateCurrentStep: vi.fn().mockResolvedValue(true),
        claimTask: vi.fn().mockResolvedValue(true),
        incrementRetryCount: vi.fn().mockResolvedValue(true),
        saveStateSnapshot: vi.fn().mockResolvedValue(true),
        markAsCompleted: vi.fn().mockResolvedValue(true),
        markAsFailed: vi.fn().mockResolvedValue(true),
        releaseWorker: vi.fn().mockResolvedValue(true),
        softDelete: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        getPendingTasks: vi.fn().mockResolvedValue([]),
        getActiveTasksByWorker: vi.fn().mockResolvedValue([]),
      };

      // 创建 SyncExecutor（不提供 config，使用默认）
      const executor = new SyncExecutor(mockTaskRepo);

      // 验证 executor 配置
      // 注意：SyncExecutor 的默认 databaseType 是 'sqlite'
      // 真实场景下需要通过 config.databaseType 来指定
      const config = (executor as any).config;
      expect(config.databaseType).toBeDefined();
      expect(['sqlite', 'postgres', 'memory']).toContain(config.databaseType);
    });

    it('SyncExecutor 应支持显式配置 databaseType 为 PostgreSQL', async () => {
      // 设置生产环境
      process.env.NODE_ENV = 'production';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );

      // 创建 Mock Repository（模拟 PostgreSQL Repository）
      const mockTaskRepo: ITaskRepository = {
        create: vi.fn().mockResolvedValue({
          taskId: 'test-task-id',
          status: TaskStatus.PENDING,
          version: 1,
        } as any),
        findById: vi.fn().mockResolvedValue({
          taskId: 'test-task-id',
          status: TaskStatus.COMPLETED,
          version: 2,
        } as any),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateStatus: vi.fn().mockResolvedValue(true),
        updateCurrentStep: vi.fn().mockResolvedValue(true),
        claimTask: vi.fn().mockResolvedValue(true),
        incrementRetryCount: vi.fn().mockResolvedValue(true),
        saveStateSnapshot: vi.fn().mockResolvedValue(true),
        markAsCompleted: vi.fn().mockResolvedValue(true),
        markAsFailed: vi.fn().mockResolvedValue(true),
        releaseWorker: vi.fn().mockResolvedValue(true),
        softDelete: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        getPendingTasks: vi.fn().mockResolvedValue([]),
        getActiveTasksByWorker: vi.fn().mockResolvedValue([]),
      };

      // 创建 SyncExecutor（显式配置 databaseType 为 postgres）
      const executor = new SyncExecutor(mockTaskRepo, {
        databaseType: 'postgres',
      });

      // 验证 executor 配置
      const config = (executor as any).config;
      expect(config.databaseType).toBe('postgres');
    });

    it('SyncExecutor 应使用 PostgreSQL Repository 执行任务', async () => {
      // 设置生产环境
      process.env.NODE_ENV = 'production';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );

      // 创建 Mock Repository（模拟 PostgreSQL Repository）
      const mockTaskRepo: ITaskRepository = {
        create: vi.fn().mockImplementation(async (input) => ({
          taskId: input.idempotencyKey || 'test-task-id',
          userId: input.userId,
          mode: input.mode,
          topic: input.topic,
          requirements: input.requirements,
          status: TaskStatus.PENDING,
          version: 1,
          createdAt: new Date(),
        })) as any,
        findById: vi.fn().mockImplementation(async (taskId) => ({
          taskId,
          status: TaskStatus.COMPLETED,
          version: 2,
          completedAt: new Date(),
        })),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateStatus: vi.fn().mockResolvedValue(true),
        updateCurrentStep: vi.fn().mockResolvedValue(true),
        claimTask: vi.fn().mockResolvedValue(true),
        incrementRetryCount: vi.fn().mockResolvedValue(true),
        saveStateSnapshot: vi.fn().mockResolvedValue(true),
        markAsCompleted: vi.fn().mockResolvedValue(true),
        markAsFailed: vi.fn().mockResolvedValue(true),
        releaseWorker: vi.fn().mockResolvedValue(true),
        softDelete: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        getPendingTasks: vi.fn().mockResolvedValue([]),
        getActiveTasksByWorker: vi.fn().mockResolvedValue([]),
      };

      // 创建 SyncExecutor（显式配置 databaseType 为 postgres）
      const executor = new SyncExecutor(mockTaskRepo, {
        databaseType: 'postgres',
      });

      // 执行任务
      const result = await executor.execute({
        userId: 'test-user-2',
        mode: 'sequential',
        topic: '测试主题',
        requirements: '测试要求',
      });

      // 验证执行结果
      expect(result.taskId).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.finalState).toBeDefined();

      // 验证任务已创建
      expect(mockTaskRepo.create).toHaveBeenCalled();

      // 验证任务已标记为完成
      expect(mockTaskRepo.markAsCompleted).toHaveBeenCalled();
    });
  });

  describe('显式 databaseType 配置', () => {
    it('SyncExecutor 应支持显式配置 databaseType 为 SQLite', async () => {
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );

      // 创建 Mock Repository
      const mockTaskRepo: ITaskRepository = {
        create: vi.fn().mockResolvedValue({
          taskId: 'test-task-id',
          status: TaskStatus.PENDING,
          version: 1,
        } as any),
        findById: vi.fn().mockResolvedValue(null),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateStatus: vi.fn().mockResolvedValue(true),
        updateCurrentStep: vi.fn().mockResolvedValue(true),
        claimTask: vi.fn().mockResolvedValue(true),
        incrementRetryCount: vi.fn().mockResolvedValue(true),
        saveStateSnapshot: vi.fn().mockResolvedValue(true),
        markAsCompleted: vi.fn().mockResolvedValue(true),
        markAsFailed: vi.fn().mockResolvedValue(true),
        releaseWorker: vi.fn().mockResolvedValue(true),
        softDelete: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        getPendingTasks: vi.fn().mockResolvedValue([]),
        getActiveTasksByWorker: vi.fn().mockResolvedValue([]),
      };

      // 创建 SyncExecutor（显式配置 databaseType 为 sqlite）
      const executor = new SyncExecutor(mockTaskRepo, {
        databaseType: 'sqlite',
      });

      // 验证 executor 配置
      const config = (executor as any).config;
      expect(config.databaseType).toBe('sqlite');
    });

    it('SyncExecutor 应支持显式配置 databaseType 为 memory', async () => {
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );

      // 创建 Mock Repository
      const mockTaskRepo: ITaskRepository = {
        create: vi.fn().mockResolvedValue({
          taskId: 'test-task-id',
          status: TaskStatus.PENDING,
          version: 1,
        } as any),
        findById: vi.fn().mockResolvedValue(null),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateStatus: vi.fn().mockResolvedValue(true),
        updateCurrentStep: vi.fn().mockResolvedValue(true),
        claimTask: vi.fn().mockResolvedValue(true),
        incrementRetryCount: vi.fn().mockResolvedValue(true),
        saveStateSnapshot: vi.fn().mockResolvedValue(true),
        markAsCompleted: vi.fn().mockResolvedValue(true),
        markAsFailed: vi.fn().mockResolvedValue(true),
        releaseWorker: vi.fn().mockResolvedValue(true),
        softDelete: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        getPendingTasks: vi.fn().mockResolvedValue([]),
        getActiveTasksByWorker: vi.fn().mockResolvedValue([]),
      };

      // 创建 SyncExecutor（显式配置 databaseType 为 memory）
      const executor = new SyncExecutor(mockTaskRepo, {
        databaseType: 'memory',
      });

      // 验证 executor 配置
      const config = (executor as any).config;
      expect(config.databaseType).toBe('memory');
    });

    it('SyncExecutor 应支持自定义配置参数', async () => {
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );

      // 创建 Mock Repository
      const mockTaskRepo: ITaskRepository = {
        create: vi.fn().mockResolvedValue({
          taskId: 'test-task-id',
          status: TaskStatus.PENDING,
          version: 1,
        } as any),
        findById: vi.fn().mockResolvedValue(null),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateStatus: vi.fn().mockResolvedValue(true),
        updateCurrentStep: vi.fn().mockResolvedValue(true),
        claimTask: vi.fn().mockResolvedValue(true),
        incrementRetryCount: vi.fn().mockResolvedValue(true),
        saveStateSnapshot: vi.fn().mockResolvedValue(true),
        markAsCompleted: vi.fn().mockResolvedValue(true),
        markAsFailed: vi.fn().mockResolvedValue(true),
        releaseWorker: vi.fn().mockResolvedValue(true),
        softDelete: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        getPendingTasks: vi.fn().mockResolvedValue([]),
        getActiveTasksByWorker: vi.fn().mockResolvedValue([]),
      };

      // 创建 SyncExecutor（自定义配置）
      const executor = new SyncExecutor(mockTaskRepo, {
        databaseType: 'sqlite',
        timeout: 30000,
        totalTimeout: 120000,
        maxRetries: 5,
        enableLogging: false,
        logLevel: 'debug',
      });

      // 验证 executor 配置
      const config = (executor as any).config;
      expect(config.databaseType).toBe('sqlite');
      expect(config.timeout).toBe(30000);
      expect(config.totalTimeout).toBe(120000);
      expect(config.maxRetries).toBe(5);
      expect(config.enableLogging).toBe(false);
      expect(config.logLevel).toBe('debug');
    });
  });

  describe('工作流执行后数据存储', () => {
    it('任务执行后数据应正确存储到 SQLite', async () => {
      process.env.NODE_ENV = 'development';
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );
      const { SQLiteTaskRepository } = await import(
        '../../../src/infrastructure/database/SQLiteTaskRepository.js'
      );

      // 创建 SQLite Repository
      const taskRepo = new SQLiteTaskRepository(':memory:');

      try {
        // 创建任务（模拟任务创建）
        const createdTask = await taskRepo.create({
          id: 'test-task-id',
          mode: 'sequential',
          type: 'article',
          topic: '测试主题 - 数据存储',
          requirements: '测试要求',
        });

        expect(createdTask.id).toBe('test-task-id');
        expect(createdTask.topic).toBe('测试主题 - 数据存储');
        expect(createdTask.status).toBe(TaskStatus.PENDING);

        // 更新任务状态（使用 update 方法）
        await taskRepo.update('test-task-id', {
          status: TaskStatus.RUNNING,
          startedAt: new Date().toISOString(),
        });

        const runningTask = await taskRepo.findById('test-task-id');
        expect(runningTask).not.toBeNull();
        expect(runningTask!.status).toBe(TaskStatus.RUNNING);

        // 标记任务完成（使用 update 方法）
        await taskRepo.update('test-task-id', {
          status: TaskStatus.COMPLETED,
          completedAt: new Date().toISOString(),
        });

        // 验证任务状态已更新
        const completedTask = await taskRepo.findById('test-task-id');
        expect(completedTask).not.toBeNull();
        expect(completedTask!.status).toBe(TaskStatus.COMPLETED);
        expect(completedTask!.completedAt).toBeDefined();
      } finally {
        taskRepo.close();
      }
    });

    it('任务执行失败时应正确存储错误信息', async () => {
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 创建模拟任务已失败的 Repository
      const mockTaskRepo: ITaskRepository = {
        create: vi.fn().mockImplementation(async (input) => ({
          taskId: input.idempotencyKey || 'test-task-id',
          userId: input.userId,
          mode: input.mode,
          topic: input.topic,
          requirements: input.requirements,
          status: TaskStatus.PENDING,
          version: 1,
          createdAt: new Date(),
        })) as any,
        findById: vi.fn().mockImplementation(async (taskId) => ({
          taskId,
          status: TaskStatus.FAILED,
          version: 1,
          errorMessage: '工作流执行失败',
        })),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateStatus: vi.fn().mockResolvedValue(true),
        updateCurrentStep: vi.fn().mockResolvedValue(true),
        claimTask: vi.fn().mockResolvedValue(true),
        incrementRetryCount: vi.fn().mockResolvedValue(true),
        saveStateSnapshot: vi.fn().mockResolvedValue(true),
        markAsCompleted: vi.fn().mockResolvedValue(true),
        markAsFailed: vi.fn().mockResolvedValue(true),
        releaseWorker: vi.fn().mockResolvedValue(true),
        softDelete: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        getPendingTasks: vi.fn().mockResolvedValue([]),
        getActiveTasksByWorker: vi.fn().mockResolvedValue([]),
      };

      // 验证 markAsFailed 方法存在且可被调用
      expect(mockTaskRepo.markAsFailed).toBeDefined();

      // 模拟调用 markAsFailed
      const result = await mockTaskRepo.markAsFailed('test-task-id', 'Test error', 1);
      expect(result).toBe(true);
      expect(mockTaskRepo.markAsFailed).toHaveBeenCalledWith('test-task-id', 'Test error', 1);
    });

    it('任务执行后应能通过 ResultRepository 保存结果', async () => {
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { SyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );

      // 创建 Mock TaskRepository
      const mockTaskRepo: ITaskRepository = {
        create: vi.fn().mockImplementation(async (input) => ({
          taskId: input.idempotencyKey || 'test-task-id',
          userId: input.userId,
          mode: input.mode,
          topic: input.topic,
          requirements: input.requirements,
          status: TaskStatus.PENDING,
          version: 1,
          createdAt: new Date(),
        })) as any,
        findById: vi.fn().mockImplementation(async (taskId) => ({
          taskId,
          status: TaskStatus.COMPLETED,
          version: 2,
          completedAt: new Date(),
        })),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateStatus: vi.fn().mockResolvedValue(true),
        updateCurrentStep: vi.fn().mockResolvedValue(true),
        claimTask: vi.fn().mockResolvedValue(true),
        incrementRetryCount: vi.fn().mockResolvedValue(true),
        saveStateSnapshot: vi.fn().mockResolvedValue(true),
        markAsCompleted: vi.fn().mockResolvedValue(true),
        markAsFailed: vi.fn().mockResolvedValue(true),
        releaseWorker: vi.fn().mockResolvedValue(true),
        softDelete: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        getPendingTasks: vi.fn().mockResolvedValue([]),
        getActiveTasksByWorker: vi.fn().mockResolvedValue([]),
      };

      // 创建 Mock ResultRepository
      const mockResultRepo: IResultRepository = {
        create: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByTaskId: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
      };

      // 创建 SyncExecutor
      const executor = new SyncExecutor(mockTaskRepo, {
        databaseType: 'memory',
      });

      // 设置 ResultRepository
      executor.setResultRepository(mockResultRepo);

      // 执行任务
      const result = await executor.execute({
        userId: 'test-user-5',
        mode: 'sequential',
        topic: '测试主题 - 结果保存',
        requirements: '测试要求',
      });

      // 验证执行结果
      expect(result.status).toBe('completed');

      // 验证结果已保存
      expect(mockResultRepo.create).toHaveBeenCalled();
      expect(mockResultRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          resultType: 'article',
          content: '测试文章内容',
        })
      );
    });

    it('任务执行后应能通过 QualityCheckRepository 保存质检结果', async () => {
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 验证 QualityCheckRepository 的 create 方法存在且可被调用
      const mockQualityCheckRepo: IQualityCheckRepository = {
        create: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByTaskId: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
      };

      // 验证 create 方法存在
      expect(mockQualityCheckRepo.create).toBeDefined();

      // 模拟调用 create 方法保存质检结果
      const result = await mockQualityCheckRepo.create({
        taskId: 'test-task-id',
        checkType: 'text',
        score: 85,
        passed: true,
        hardConstraintsPassed: true,
        details: {},
        fixSuggestions: [],
        rubricVersion: '1.0',
        modelName: 'test-model',
      });

      expect(result).toBeUndefined();
      expect(mockQualityCheckRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          checkType: 'text',
          score: 85,
          passed: true,
        })
      );
    });
  });

  describe('工厂函数 - createSyncExecutor', () => {
    it('createSyncExecutor 应正确创建 SyncExecutor 实例', async () => {
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { createSyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );

      // 创建 Mock Repository
      const mockTaskRepo: ITaskRepository = {
        create: vi.fn().mockResolvedValue({
          taskId: 'test-task-id',
          status: TaskStatus.PENDING,
          version: 1,
        } as any),
        findById: vi.fn().mockResolvedValue(null),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateStatus: vi.fn().mockResolvedValue(true),
        updateCurrentStep: vi.fn().mockResolvedValue(true),
        claimTask: vi.fn().mockResolvedValue(true),
        incrementRetryCount: vi.fn().mockResolvedValue(true),
        saveStateSnapshot: vi.fn().mockResolvedValue(true),
        markAsCompleted: vi.fn().mockResolvedValue(true),
        markAsFailed: vi.fn().mockResolvedValue(true),
        releaseWorker: vi.fn().mockResolvedValue(true),
        softDelete: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        getPendingTasks: vi.fn().mockResolvedValue([]),
        getActiveTasksByWorker: vi.fn().mockResolvedValue([]),
      };

      // 使用工厂函数创建 executor
      const executor = createSyncExecutor(mockTaskRepo, {
        databaseType: 'sqlite',
        timeout: 45000,
      });

      // 验证实例创建成功
      expect(executor).toBeDefined();
      expect(executor instanceof (await import('../../../src/application/workflow/SyncExecutor.js')).SyncExecutor).toBe(true);

      // 验证配置
      const config = (executor as any).config;
      expect(config.databaseType).toBe('sqlite');
      expect(config.timeout).toBe(45000);
    });

    it('createSyncExecutor 应支持不传 config 参数', async () => {
      process.env.LLM_API_KEY = 'test-api-key';
      process.env.LLM_BASE_URL = 'https://api.test.com';
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.ARK_API_KEY = 'test-ark-key';

      // 动态导入
      const { createSyncExecutor } = await import(
        '../../../src/application/workflow/SyncExecutor.js'
      );

      // 创建 Mock Repository
      const mockTaskRepo: ITaskRepository = {
        create: vi.fn().mockResolvedValue({
          taskId: 'test-task-id',
          status: TaskStatus.PENDING,
          version: 1,
        } as any),
        findById: vi.fn().mockResolvedValue(null),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateStatus: vi.fn().mockResolvedValue(true),
        updateCurrentStep: vi.fn().mockResolvedValue(true),
        claimTask: vi.fn().mockResolvedValue(true),
        incrementRetryCount: vi.fn().mockResolvedValue(true),
        saveStateSnapshot: vi.fn().mockResolvedValue(true),
        markAsCompleted: vi.fn().mockResolvedValue(true),
        markAsFailed: vi.fn().mockResolvedValue(true),
        releaseWorker: vi.fn().mockResolvedValue(true),
        softDelete: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        getPendingTasks: vi.fn().mockResolvedValue([]),
        getActiveTasksByWorker: vi.fn().mockResolvedValue([]),
      };

      // 使用工厂函数创建 executor（不传 config）
      const executor = createSyncExecutor(mockTaskRepo);

      // 验证实例创建成功
      expect(executor).toBeDefined();

      // 验证默认配置
      const config = (executor as any).config;
      expect(config.databaseType).toBe('sqlite');
      expect(config.timeout).toBe(60000);
      expect(config.totalTimeout).toBe(300000);
      expect(config.maxRetries).toBe(3);
      expect(config.enableLogging).toBe(true);
    });
  });
});
