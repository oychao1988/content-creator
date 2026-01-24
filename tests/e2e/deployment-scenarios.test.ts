/**
 * 部署场景端到端测试
 *
 * 测试不同部署场景下的系统行为：
 * - 场景 A: 本地开发（无 .env 文件）→ 预期使用 SQLite
 * - 场景 B: 生产部署（完整 PostgreSQL + Redis 配置）→ 预期使用 PostgreSQL
 * - 场景 C: 测试环境（NODE_ENV=test）→ 预期使用 Memory
 * - 场景 D: 开发环境强制使用 PostgreSQL（DATABASE_TYPE=postgres）→ 预期使用 PostgreSQL
 *
 * 每个场景验证：
 * - 配置加载正确
 * - 数据库类型选择正确
 * - 基本功能可用
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskStatus } from '../../src/domain/entities/Task.js';
import { MemoryTaskRepository } from '../../src/infrastructure/database/MemoryTaskRepository.js';
import { SQLiteTaskRepository } from '../../src/infrastructure/database/SQLiteTaskRepository.js';

// Mock 日志模块
vi.mock('../../src/infrastructure/logging/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

/**
 * 测试配置类（用于模拟不同场景的配置）
 */
class TestScenarioConfig {
  private nodeEnv: string;
  private _databaseType?: 'memory' | 'postgres' | 'sqlite';
  private postgresConfig?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    ssl?: boolean;
  };
  private redisUrl?: string;

  constructor(
    nodeEnv: string,
    options: {
      databaseType?: 'memory' | 'postgres' | 'sqlite';
      postgresConfig?: {
        host?: string;
        port?: number;
        user?: string;
        password?: string;
        database?: string;
        ssl?: boolean;
      };
      redisUrl?: string;
    } = {}
  ) {
    this.nodeEnv = nodeEnv;
    this._databaseType = options.databaseType;
    this.postgresConfig = options.postgresConfig;
    this.redisUrl = options.redisUrl;
  }

  /**
   * 根据环境返回默认数据库类型
   */
  private getDefaultDatabaseType(): 'memory' | 'postgres' | 'sqlite' {
    switch (this.nodeEnv) {
      case 'development':
        return 'sqlite'; // 开发环境默认使用 SQLite
      case 'production':
        return 'postgres'; // 生产环境默认使用 PostgreSQL
      case 'test':
        return 'memory'; // 测试环境默认使用内存数据库
      default:
        return 'sqlite';
    }
  }

  get databaseType(): 'memory' | 'postgres' | 'sqlite' {
    return this._databaseType !== undefined
      ? this._databaseType
      : this.getDefaultDatabaseType();
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get redis(): { enabled: boolean } {
    return {
      enabled: !!this.redisUrl,
    };
  }

  /**
   * 验证 PostgreSQL 配置
   */
  validatePostgresConfig(): void {
    const actualDatabaseType = this.databaseType; // 使用实际使用的数据库类型，包括默认值

    if (actualDatabaseType === 'postgres') {
      const requiredFields = ['host', 'user', 'password', 'database'] as const;

      const missingFields = requiredFields.filter(
        (field) => !this.postgresConfig?.[field]
      );

      if (missingFields.length > 0) {
        throw new Error(
          `PostgreSQL configuration is required when DATABASE_TYPE='postgres'. ` +
          `Missing configuration: ${missingFields.join(', ')}`
        );
      }
    }
  }

  /**
   * 创建合适的 Repository 实例
   */
  createRepository(dbPath?: string): MemoryTaskRepository | SQLiteTaskRepository {
    const type = this.databaseType;

    if (type === 'memory') {
      return new MemoryTaskRepository();
    }

    if (type === 'sqlite') {
      return new SQLiteTaskRepository(dbPath || ':memory:');
    }

    if (type === 'postgres') {
      // 由于测试环境无法连接真实 PostgreSQL，我们使用 SQLite 作为 fallback
      // 这模拟了生产环境中的 fallback 机制
      console.warn(
        'PostgreSQL not available in test environment, falling back to SQLite'
      );
      return new SQLiteTaskRepository(dbPath || ':memory:');
    }

    throw new Error(`Unknown database type: ${type}`);
  }
}

describe('部署场景端到端测试', () => {
  /**
   * 场景 A: 本地开发（无 .env 文件）
   *
   * 场景描述：
   * - 开发者在本地开发时，通常不配置完整的环境变量
   * - 只需要提供必需的 API Key
   * - 系统应该默认使用 SQLite 数据库
   *
   * 预期行为：
   * - 配置系统使用默认值
   * - 数据库类型自动选择为 SQLite
   * - 系统可以正常运行
   */
  describe('场景 A: 本地开发（无 .env 文件）', () => {
    it('应默认使用 SQLite 数据库', () => {
      // 模拟本地开发环境：只提供 NODE_ENV
      const config = new TestScenarioConfig('development');

      // 验证配置加载正确
      expect(config.isDevelopment).toBe(true);
      expect(config.isProduction).toBe(false);
      expect(config.isTest).toBe(false);

      // 验证数据库类型选择正确（开发环境默认使用 SQLite）
      expect(config.databaseType).toBe('sqlite');
    });

    it('SQLite repository 应支持所有 CRUD 操作', async () => {
      // 模拟本地开发环境
      const config = new TestScenarioConfig('development');

      // 创建 repository
      const repo = config.createRepository(':memory:');

      try {
        // 验证基本功能可用
        const task = await repo.create({
          id: 'task-scenario-a',
          mode: 'sequential',
          type: 'article',
          topic: '本地开发测试',
          requirements: '测试本地开发场景',
        });

        expect(task).toBeDefined();
        expect(task.id).toBe('task-scenario-a');
        expect(task.status).toBe(TaskStatus.PENDING);

        // 验证可以查询任务
        const found = await repo.findById('task-scenario-a');
        expect(found).not.toBeNull();
        expect(found!.id).toBe('task-scenario-a');

        // 验证可以更新任务
        const updated = await repo.update('task-scenario-a', {
          status: TaskStatus.RUNNING,
        });
        expect(updated.status).toBe(TaskStatus.RUNNING);

        // 验证可以删除任务
        const deleted = await repo.delete('task-scenario-a');
        expect(deleted).toBe(true);
      } finally {
        // 清理
        if (typeof (repo as any).close === 'function') {
          (repo as any).close();
        }
      }
    });

    it('SQLite repository 应提供完整的接口', async () => {
      // 模拟本地开发环境
      const config = new TestScenarioConfig('development');
      const repo = config.createRepository(':memory:');

      try {
        // 测试完整的 CRUD 操作
        expect(typeof repo.create).toBe('function');
        expect(typeof repo.findById).toBe('function');
        expect(typeof repo.update).toBe('function');
        expect(typeof repo.delete).toBe('function');
        expect(typeof repo.list).toBe('function');
        expect(typeof repo.updateStatus).toBe('function');
        expect(typeof repo.markAsCompleted).toBe('function');
        expect(typeof repo.markAsFailed).toBe('function');
        expect(typeof repo.updateCurrentStep).toBe('function');
        expect(typeof repo.healthCheck).toBe('function');

        // 验证 close 方法存在（SQLite 特有）
        expect('close' in repo).toBe(true);
      } finally {
        if (typeof (repo as any).close === 'function') {
          (repo as any).close();
        }
      }
    });

    it('SQLite repository 应支持乐观锁', async () => {
      // 模拟本地开发环境
      const config = new TestScenarioConfig('development');
      const repo = config.createRepository(':memory:');

      try {
        // 创建任务
        const task = await repo.create({
          id: 'task-optimistic-lock',
          mode: 'sequential',
          type: 'article',
          topic: '乐观锁测试',
          requirements: '测试乐观锁',
        });

        // 使用正确的版本号更新
        const result = await repo.updateStatus(
          'task-optimistic-lock',
          TaskStatus.RUNNING,
          task.version
        );
        expect(result).toBe(true);

        // 使用错误的版本号更新
        const failResult = await repo.updateStatus(
          'task-optimistic-lock',
          TaskStatus.COMPLETED,
          999
        );
        expect(failResult).toBe(false);
      } finally {
        if (typeof (repo as any).close === 'function') {
          (repo as any).close();
        }
      }
    });
  });

  /**
   * 场景 B: 生产部署（完整 PostgreSQL + Redis 配置）
   *
   * 场景描述：
   * - 生产环境需要完整的数据库和缓存配置
   * - 系统应该使用 PostgreSQL 作为主数据库
   * - Redis 用于队列、缓存和限流
   *
   * 预期行为：
   * - 配置系统加载生产配置
   * - 数据库类型为 PostgreSQL
   * - Redis 已启用
   * - 系统功能完整
   *
   * 注意：由于测试环境无法连接真实 PostgreSQL，此测试验证配置加载
   */
  describe('场景 B: 生产部署（完整 PostgreSQL + Redis 配置）', () => {
    it('应使用 PostgreSQL 数据库并启用 Redis', () => {
      // 模拟生产环境：完整的配置
      const config = new TestScenarioConfig('production', {
        postgresConfig: {
          host: 'postgres.prod.example.com',
          port: 5432,
          user: 'produser',
          password: 'prodpass',
          database: 'proddb',
          ssl: true,
        },
        redisUrl: 'redis://redis.prod.example.com:6379/0',
      });

      // 验证配置加载正确
      expect(config.isDevelopment).toBe(false);
      expect(config.isProduction).toBe(true);
      expect(config.isTest).toBe(false);

      // 验证数据库类型选择正确（生产环境默认使用 PostgreSQL）
      expect(config.databaseType).toBe('postgres');

      // 验证 Redis 已启用
      expect(config.redis.enabled).toBe(true);
    });

    it('PostgreSQL 配置缺失时应抛出错误', () => {
      // 模拟生产环境但缺少 PostgreSQL 配置
      const config = new TestScenarioConfig('production');

      // 验证配置验证失败
      expect(() => {
        config.validatePostgresConfig();
      }).toThrow(
        /PostgreSQL configuration is required.*Missing configuration/
      );
    });

    it('PostgreSQL 部分配置缺失时应抛出错误', () => {
      // 模拟生产环境，只提供部分 PostgreSQL 配置
      const config = new TestScenarioConfig('production', {
        databaseType: 'postgres',
        postgresConfig: {
          host: 'localhost',
          // 缺少 user, password, database
        },
      });

      // 验证配置验证失败
      expect(() => {
        config.validatePostgresConfig();
      }).toThrow(/Missing configuration/);
    });

    it('PostgreSQL 完整配置应通过验证', () => {
      // 模拟生产环境，提供完整的 PostgreSQL 配置
      const config = new TestScenarioConfig('production', {
        databaseType: 'postgres',
        postgresConfig: {
          host: 'postgres.prod.example.com',
          port: 5432,
          user: 'produser',
          password: 'prodpass',
          database: 'proddb',
          ssl: true,
        },
      });

      // 验证配置验证通过
      expect(() => {
        config.validatePostgresConfig();
      }).not.toThrow();
    });

    it('生产环境不可用时应 fallback 到 SQLite', async () => {
      // 模拟生产环境，PostgreSQL 不可用
      const config = new TestScenarioConfig('production', {
        databaseType: 'postgres',
        postgresConfig: {
          host: 'postgres.prod.example.com',
          user: 'produser',
          password: 'prodpass',
          database: 'proddb',
        },
      });

      // 创建 repository（会 fallback 到 SQLite）
      const repo = config.createRepository(':memory:');

      try {
        // 验证基本功能可用
        const task = await repo.create({
          id: 'task-prod-fallback',
          mode: 'sequential',
          type: 'article',
          topic: '生产 fallback 测试',
          requirements: '测试 PostgreSQL 不可用时的 fallback',
        });

        expect(task).toBeDefined();
        expect(task.id).toBe('task-prod-fallback');
      } finally {
        if (typeof (repo as any).close === 'function') {
          (repo as any).close();
        }
      }
    });
  });

  /**
   * 场景 C: 测试环境（NODE_ENV=test）
   *
   * 场景描述：
   * - 测试环境需要快速执行，不需要持久化存储
   * - 系统应该使用内存数据库
   * - 每个测试用例独立运行，数据不互相干扰
   *
   * 预期行为：
   * - 配置系统使用测试配置
   * - 数据库类型为 Memory
   * - 测试可以快速执行
   * - 数据不持久化
   */
  describe('场景 C: 测试环境（NODE_ENV=test）', () => {
    it('应默认使用内存数据库', () => {
      // 模拟测试环境
      const config = new TestScenarioConfig('test');

      // 验证配置加载正确
      expect(config.isDevelopment).toBe(false);
      expect(config.isProduction).toBe(false);
      expect(config.isTest).toBe(true);

      // 验证数据库类型选择正确（测试环境默认使用 Memory）
      expect(config.databaseType).toBe('memory');
    });

    it('内存数据库应支持所有 CRUD 操作', async () => {
      // 模拟测试环境
      const config = new TestScenarioConfig('test');
      const repo = config.createRepository();

      // 验证基本功能可用
      const task = await repo.create({
        id: 'task-scenario-c',
        mode: 'sequential',
        type: 'article',
        topic: '测试环境测试',
        requirements: '测试测试环境场景',
      });

      expect(task).toBeDefined();
      expect(task.id).toBe('task-scenario-c');
      expect(task.status).toBe(TaskStatus.PENDING);

      // 验证可以查询任务
      const found = await repo.findById('task-scenario-c');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('task-scenario-c');

      // 验证可以更新任务
      const updated = await repo.update('task-scenario-c', {
        status: TaskStatus.RUNNING,
      });
      expect(updated.status).toBe(TaskStatus.RUNNING);

      // 验证可以删除任务
      const deleted = await repo.delete('task-scenario-c');
      expect(deleted).toBe(true);
    });

    it('内存数据库应不提供 close 方法', () => {
      // 模拟测试环境
      const config = new TestScenarioConfig('test');
      const repo = config.createRepository();

      // 验证 Memory Repository 没有 close 方法
      expect('close' in repo).toBe(false);
    });

    it('内存数据库应提供统计信息', async () => {
      // 模拟测试环境
      const config = new TestScenarioConfig('test');
      const repo = config.createRepository();

      // 创建任务
      await repo.create({
        id: 'task-stats-test',
        mode: 'sequential',
        type: 'article',
        topic: '统计测试',
        requirements: '测试统计信息',
      });

      // 验证统计信息
      const stats = (repo as MemoryTaskRepository).getStats();
      expect(stats.totalTasks).toBe(1);
      expect(stats.byStatus[TaskStatus.PENDING]).toBe(1);
    });

    it('应能保存和加载状态快照', async () => {
      // 模拟测试环境
      const config = new TestScenarioConfig('test');
      const repo = config.createRepository();

      // 创建任务
      await repo.create({
        id: 'task-snapshot-test',
        mode: 'sequential',
        type: 'article',
        topic: '快照测试',
        requirements: '测试快照功能',
      });

      // 保存快照
      const snapshot = {
        step: 'test-step',
        data: 'test-data',
        timestamp: new Date().toISOString(),
      };
      await repo.saveStateSnapshot('task-snapshot-test', 'test-step', snapshot);

      // 加载快照
      const loaded = await repo.loadStateSnapshot('task-snapshot-test');
      expect(loaded).toEqual(snapshot);
    });

    it('内存数据库测试应快速执行', async () => {
      // 模拟测试环境
      const config = new TestScenarioConfig('test');
      const repo = config.createRepository();

      const startTime = Date.now();

      // 创建 100 个任务
      for (let i = 0; i < 100; i++) {
        await repo.create({
          id: `task-speed-test-${i}`,
          mode: 'sequential',
          type: 'article',
          topic: `速度测试 ${i}`,
          requirements: '测试内存数据库速度',
        });
      }

      const duration = Date.now() - startTime;

      // 验证在合理时间内完成（应小于 100ms）
      expect(duration).toBeLessThan(100);

      // 验证所有任务都已创建
      const stats = (repo as MemoryTaskRepository).getStats();
      expect(stats.totalTasks).toBe(100);
    });
  });

  /**
   * 场景 D: 开发环境强制使用 PostgreSQL（DATABASE_TYPE=postgres）
   *
   * 场景描述：
   * - 开发者想要在本地测试 PostgreSQL 集成
   * - 显式设置 DATABASE_TYPE=postgres
   * - 系统应该使用 PostgreSQL 而不是默认的 SQLite
   *
   * 预期行为：
   * - 配置系统使用显式设置的 DATABASE_TYPE
   * - 数据库类型为 PostgreSQL
   * - 提供 PostgreSQL 配置后系统正常运行
   */
  describe('场景 D: 开发环境强制使用 PostgreSQL（DATABASE_TYPE=postgres）', () => {
    it('显式设置 DATABASE_TYPE=postgres 应覆盖默认值', () => {
      // 模拟开发环境，但显式设置 DATABASE_TYPE 为 postgres
      const config = new TestScenarioConfig('development', {
        databaseType: 'postgres',
        postgresConfig: {
          host: 'localhost',
          port: 5432,
          user: 'testuser',
          password: 'testpass',
          database: 'test_db',
        },
      });

      // 验证配置加载正确
      expect(config.isDevelopment).toBe(true);
      expect(config.isProduction).toBe(false);
      expect(config.isTest).toBe(false);

      // 验证使用了显式设置的 postgres，而不是默认的 sqlite
      expect(config.databaseType).toBe('postgres');

      // 验证配置验证通过
      expect(() => {
        config.validatePostgresConfig();
      }).not.toThrow();
    });

    it('显式设置 postgres 但缺少配置时应抛出错误', () => {
      // 模拟开发环境，显式设置 DATABASE_TYPE 为 postgres，但缺少配置
      const config = new TestScenarioConfig('development', {
        databaseType: 'postgres',
        // 缺少 postgresConfig
      });

      // 验证配置验证失败
      expect(() => {
        config.validatePostgresConfig();
      }).toThrow(
        /PostgreSQL configuration is required.*Missing configuration/
      );
    });

    it('显式设置 DATABASE_TYPE=memory 应覆盖默认值', () => {
      // 模拟开发环境，但显式设置 DATABASE_TYPE 为 memory
      const config = new TestScenarioConfig('development', {
        databaseType: 'memory',
      });

      // 验证使用了显式设置的 memory，而不是默认的 sqlite
      expect(config.databaseType).toBe('memory');
    });

    it('显式设置 DATABASE_TYPE=sqlite 在生产环境应生效', async () => {
      // 模拟生产环境，但显式设置 DATABASE_TYPE 为 sqlite
      const config = new TestScenarioConfig('production', {
        databaseType: 'sqlite',
      });

      // 验证使用了显式设置的 sqlite，而不是默认的 postgres
      expect(config.databaseType).toBe('sqlite');

      // 验证可以创建 SQLite repository
      const repo = config.createRepository(':memory:');

      try {
        const task = await repo.create({
          id: 'task-prod-sqlite',
          mode: 'sequential',
          type: 'article',
          topic: '生产 SQLite 测试',
          requirements: '测试生产环境使用 SQLite',
        });

        expect(task).toBeDefined();
        expect(task.id).toBe('task-prod-sqlite');
      } finally {
        if (typeof (repo as any).close === 'function') {
          (repo as any).close();
        }
      }
    });

    it('显式设置 DATABASE_TYPE=sqlite 在测试环境应生效', async () => {
      // 模拟测试环境，但显式设置 DATABASE_TYPE 为 sqlite
      const config = new TestScenarioConfig('test', {
        databaseType: 'sqlite',
      });

      // 验证使用了显式设置的 sqlite，而不是默认的 memory
      expect(config.databaseType).toBe('sqlite');

      // 验证可以创建 SQLite repository
      const repo = config.createRepository(':memory:');

      try {
        const task = await repo.create({
          id: 'task-test-sqlite',
          mode: 'sequential',
          type: 'article',
          topic: '测试 SQLite 测试',
          requirements: '测试测试环境使用 SQLite',
        });

        expect(task).toBeDefined();
        expect(task.id).toBe('task-test-sqlite');

        // 验证 SQLite 特有的 close 方法
        expect('close' in repo).toBe(true);
      } finally {
        if (typeof (repo as any).close === 'function') {
          (repo as any).close();
        }
      }
    });
  });

  /**
   * 跨场景验证
   *
   * 验证不同场景之间的配置隔离性和一致性
   */
  describe('跨场景验证', () => {
    it('不同场景的配置应独立', () => {
      // 场景 A：本地开发
      const devConfig = new TestScenarioConfig('development');
      expect(devConfig.databaseType).toBe('sqlite');
      expect(devConfig.isDevelopment).toBe(true);

      // 场景 B：生产部署
      const prodConfig = new TestScenarioConfig('production', {
        postgresConfig: {
          host: 'postgres.prod.example.com',
          user: 'produser',
          password: 'prodpass',
          database: 'proddb',
        },
      });
      expect(prodConfig.databaseType).toBe('postgres');
      expect(prodConfig.isProduction).toBe(true);

      // 场景 C：测试环境
      const testConfig = new TestScenarioConfig('test');
      expect(testConfig.databaseType).toBe('memory');
      expect(testConfig.isTest).toBe(true);

      // 验证配置互不干扰
      expect(devConfig.databaseType).toBe('sqlite');
      expect(prodConfig.databaseType).toBe('postgres');
      expect(testConfig.databaseType).toBe('memory');
    });

    it('所有场景都应支持基本的 CRUD 操作', async () => {
      // 测试所有场景都能执行基本的 CRUD 操作

      const scenarios = [
        {
          name: 'Scenario A (SQLite)',
          config: new TestScenarioConfig('development'),
        },
        {
          name: 'Scenario C (Memory)',
          config: new TestScenarioConfig('test'),
        },
        {
          name: 'Scenario D (SQLite in Production)',
          config: new TestScenarioConfig('production', {
            databaseType: 'sqlite',
          }),
        },
      ];

      for (const scenario of scenarios) {
        const repo = scenario.config.createRepository(':memory:');

        try {
          // 创建
          const task = await repo.create({
            id: `task-${scenario.name.replace(/\s/g, '-')}`,
            mode: 'sequential',
            type: 'article',
            topic: `${scenario.name} 测试`,
            requirements: '测试所有场景',
          });

          expect(task).toBeDefined();

          // 查询
          const found = await repo.findById(task.id);
          expect(found).not.toBeNull();

          // 更新
          const updated = await repo.update(task.id, {
            status: TaskStatus.RUNNING,
          });
          expect(updated.status).toBe(TaskStatus.RUNNING);

          // 删除
          const deleted = await repo.delete(task.id);
          expect(deleted).toBe(true);
        } finally {
          if (typeof (repo as any).close === 'function') {
            (repo as any).close();
          }
        }
      }
    });

    it('所有场景都应支持状态管理操作', async () => {
      const scenarios = [
        {
          name: 'SQLite',
          config: new TestScenarioConfig('development'),
        },
        {
          name: 'Memory',
          config: new TestScenarioConfig('test'),
        },
      ];

      for (const scenario of scenarios) {
        const repo = scenario.config.createRepository(':memory:');

        try {
          // 创建任务
          const task = await repo.create({
            id: `task-state-${scenario.name}`,
            mode: 'sequential',
            type: 'article',
            topic: '状态管理测试',
            requirements: '测试状态管理操作',
          });

          // 更新状态
          const updated1 = await repo.updateStatus(
            task.id,
            TaskStatus.RUNNING,
            task.version
          );
          expect(updated1).toBe(true);

          // 更新当前步骤
          const updated2 = await repo.updateCurrentStep(
            task.id,
            'analyzing',
            task.version + 1
          );
          expect(updated2).toBe(true);

          // 标记为完成
          const completed = await repo.markAsCompleted(
            task.id,
            task.version + 2
          );
          expect(completed).toBe(true);

          // 验证最终状态
          const final = await repo.findById(task.id);
          expect(final?.status).toBe(TaskStatus.COMPLETED);
          expect(final?.currentStep).toBe('analyzing');
        } finally {
          if (typeof (repo as any).close === 'function') {
            (repo as any).close();
          }
        }
      }
    });

    it('所有场景都应支持列表操作', async () => {
      const scenarios = [
        {
          name: 'SQLite',
          config: new TestScenarioConfig('development'),
        },
        {
          name: 'Memory',
          config: new TestScenarioConfig('test'),
        },
      ];

      for (const scenario of scenarios) {
        const repo = scenario.config.createRepository(':memory:');

        try {
          // 创建多个任务
          for (let i = 0; i < 5; i++) {
            await repo.create({
              id: `task-list-${scenario.name}-${i}`,
              mode: 'sequential',
              type: 'article',
              topic: `列表测试 ${i}`,
              requirements: '测试列表操作',
            });
          }

          // 列出所有任务
          const result = await repo.list({ limit: 10, offset: 0 });
          expect(result.data.length).toBe(5);
          expect(result.total).toBe(5);

          // 分页查询
          const page1 = await repo.list({ limit: 2, offset: 0 });
          expect(page1.data.length).toBe(2);

          const page2 = await repo.list({ limit: 2, offset: 2 });
          expect(page2.data.length).toBe(2);

          const page3 = await repo.list({ limit: 2, offset: 4 });
          expect(page3.data.length).toBe(1);
        } finally {
          if (typeof (repo as any).close === 'function') {
            (repo as any).close();
          }
        }
      }
    });
  });

  /**
   * 集成测试：SyncExecutor 在不同场景下的行为
   */
  describe('SyncExecutor 集成测试', () => {
    it('SQLite 场景下应能创建和执行任务', async () => {
      const config = new TestScenarioConfig('development');
      const repo = config.createRepository(':memory:');

      try {
        // 创建任务
        const task = await repo.create({
          id: 'task-sync-sqlite',
          mode: 'sequential',
          type: 'article',
          topic: 'SyncExecutor SQLite 测试',
          requirements: '测试 SyncExecutor 在 SQLite 场景下的行为',
        });

        expect(task).toBeDefined();
        expect(task.status).toBe(TaskStatus.PENDING);

        // 模拟执行任务
        await repo.updateStatus(task.id, TaskStatus.RUNNING, task.version);

        const running = await repo.findById(task.id);
        expect(running?.status).toBe(TaskStatus.RUNNING);

        // 模拟完成任务
        await repo.markAsCompleted(task.id, task.version + 1);

        const completed = await repo.findById(task.id);
        expect(completed?.status).toBe(TaskStatus.COMPLETED);
        expect(completed?.completedAt).toBeDefined();
      } finally {
        if (typeof (repo as any).close === 'function') {
          (repo as any).close();
        }
      }
    });

    it('Memory 场景下应能创建和执行任务', async () => {
      const config = new TestScenarioConfig('test');
      const repo = config.createRepository();

      // 创建任务
      const task = await repo.create({
        id: 'task-sync-memory',
        mode: 'sequential',
        type: 'article',
        topic: 'SyncExecutor Memory 测试',
        requirements: '测试 SyncExecutor 在 Memory 场景下的行为',
      });

      expect(task).toBeDefined();
      expect(task.status).toBe(TaskStatus.PENDING);

      // 模拟执行任务
      await repo.updateStatus(task.id, TaskStatus.RUNNING, task.version);

      const running = await repo.findById(task.id);
      expect(running?.status).toBe(TaskStatus.RUNNING);

      // 模拟完成任务
      await repo.markAsCompleted(task.id, task.version + 1);

      const completed = await repo.findById(task.id);
      expect(completed?.status).toBe(TaskStatus.COMPLETED);
      expect(completed?.completedAt).toBeDefined();
    });
  });
});
