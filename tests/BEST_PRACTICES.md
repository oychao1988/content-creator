# 测试最佳实践指南

本文档总结了项目的测试最佳实践，帮助开发者编写高质量、可维护的测试。

## 📋 目录

- [命名规范](#命名规范)
- [测试结构](#测试结构)
- [使用 Fixtures](#使用-fixtures)
- [Mock 策略](#mock-策略)
- [测试标签](#测试标签)
- [错误处理测试](#错误处理测试)
- [边界条件测试](#边界条件测试)
- [性能测试](#性能测试)
- [常见反模式](#常见反模式)

---

## 命名规范

### ✅ 推荐的测试命名

```typescript
describe('@unit CacheService', () => {
  describe('基础缓存操作', () => {
    it('should return cached value when key exists', async () => {
      // 清晰描述了测试的行为和条件
    });

    it('should return null when key does not exist', async () => {
      // 明确说明了预期结果
    });

    it('should throw error when Redis connection fails', async () => {
      // 包含错误场景
    });
  });
});
```

### ❌ 避免的测试命名

```typescript
describe('CacheService', () => {
  it('should work', async () => {
    // 太模糊，不知道测试什么
  });

  it('test1', async () => {
    // 没有描述性
  });

  it('should handle things correctly', async () => {
    // 不够具体
  });
});
```

**命名公式**: `should [预期行为] when [测试条件]`

---

## 测试结构

### AAA 模式 (Arrange-Act-Assert)

```typescript
it('should calculate total price correctly', async () => {
  // Arrange (准备) - 设置测试数据
  const cart = new Cart();
  const item = { price: 100, quantity: 2 };
  cart.addItem(item);

  // Act (执行) - 调用被测试的功能
  const total = cart.calculateTotal();

  // Assert (断言) - 验证结果
  expect(total).toBe(200);
});
```

### Given-When-Then 模式

```typescript
it('should apply discount when customer is premium', async () => {
  // Given (给定) - 初始状态
  const customer = createPremiumCustomer();
  const order = new Order(customer);

  // When (当) - 执行操作
  order.applyDiscount();

  // Then (那么) - 验证结果
  expect(order.total).toBeLessThan(originalTotal);
});
```

---

## 使用 Fixtures

### ✅ 好的做法 - 使用 Fixtures

```typescript
import { taskFixtures, qualityCheckFixtures } from '@test/fixtures/common-fixtures';

describe('TaskService', () => {
  it('should create valid task', async () => {
    const task = taskFixtures.validAsyncTask;
    const result = await service.create(task);
    expect(result.success).toBe(true);
  });

  it('should handle quality check', async () => {
    const report = qualityCheckFixtures.excellent;
    const result = service.validateQuality(report);
    expect(result.passed).toBe(true);
  });
});
```

### ❌ 不好的做法 - 内联重复数据

```typescript
describe('TaskService', () => {
  it('should create valid task', async () => {
    const task = {
      mode: 'async' as const,
      topic: 'AI 技术',
      requirements: '写一篇关于 AI 的文章',
      hardConstraints: {
        minWords: 500,
        maxWords: 1000,
        keywords: ['AI', '人工智能'],
      },
    };
    // 重复的数据，难以维护
  });
});
```

---

## Mock 策略

### Mock 外部依赖

```typescript
// ✅ Good - 使用 vi.hoisted() 创建共享 Mock
const { mockRepo } = vi.hoisted(() => ({
  mockRepo: {
    create: vi.fn().mockResolvedValue({ id: '1' }),
    findById: vi.fn().mockResolvedValue({ id: '1', status: 'pending' }),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/infrastructure/database/index.js', () => ({
  createTaskRepository: vi.fn(() => mockRepo),
}));

// ✅ Good - Mock 返回可预测的结果
describe('TaskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create task', async () => {
    mockRepo.create.mockResolvedValue({
      id: 'task-123',
      status: 'pending',
      createdAt: Date.now(),
    });

    const result = await service.create(taskData);
    expect(result.id).toBe('task-123');
  });
});
```

### 避免过度 Mock

```typescript
// ❌ Bad - 不必要的 Mock
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// ✅ Good - 只 Mock 外部依赖
// 日志通常不需要 Mock，除非测试日志功能本身
```

---

## 测试标签

使用标签分类测试，便于选择性运行：

```typescript
describe('@unit CacheService', () => {
  // 快速单元测试
});

describe('@integration QueueSystem', () => {
  // 集成测试，需要 Redis
});

describe('@performance LargeDataProcessing', () => {
  // 性能测试，运行较慢
});

describe('@slow RealLLMAPI', () => {
  // 使用真实 API 的慢速测试
});
```

**运行特定标签的测试**:
```bash
pnpm test -- --grep "@unit"           # 只运行单元测试
pnpm test -- --grep "@integration"    # 只运行集成测试
pnpm test -- --grep "@performance"    # 只运行性能测试
```

---

## 错误处理测试

### 测试所有错误路径

```typescript
describe('Error Handling', () => {
  it('should handle database connection error', async () => {
    // Arrange
    mockRepo.create.mockRejectedValue(new Error('Connection failed'));

    // Act & Assert
    await expect(service.create(taskData)).rejects.toThrow('Connection failed');
  });

  it('should return graceful result when API times out', async () => {
    // Arrange
    mockLLM.chat.mockRejectedValue(new TimeoutError('Request timeout'));

    // Act
    const result = await service.generate(content);

    // Assert - 优雅降级而不是崩溃
    expect(result.success).toBe(false);
    expect(result.error).toBe('timeout');
  });

  it('should retry on transient errors', async () => {
    // Arrange
    mockLLM.chat
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ content: 'Success' });

    // Act
    const result = await service.generateWithRetry(content);

    // Assert
    expect(result.content).toBe('Success');
    expect(mockLLM.chat).toHaveBeenCalledTimes(2);
  });
});
```

---

## 边界条件测试

### 测试边界值

```typescript
describe('Boundary Conditions', () => {
  describe('word count validation', () => {
    it('should accept content at minWords boundary', async () => {
      const content = 'x'.repeat(500); // 恰好最小值
      const result = await service.validate(content, { minWords: 500 });
      expect(result.passed).toBe(true);
    });

    it('should reject content just below minWords', async () => {
      const content = 'x'.repeat(499); // 低于最小值
      const result = await service.validate(content, { minWords: 500 });
      expect(result.passed).toBe(false);
    });

    it('should accept content at maxWords boundary', async () => {
      const content = 'x'.repeat(1000); // 恰好最大值
      const result = await service.validate(content, { maxWords: 1000 });
      expect(result.passed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', async () => {
      const result = await service.process('');
      expect(result).toBeNull();
    });

    it('should handle null input', async () => {
      const result = await service.process(null);
      expect(result).toBeNull();
    });

    it('should handle very large input', async () => {
      const largeInput = 'x'.repeat(1000000);
      const result = await service.process(largeInput);
      expect(result).toBeDefined();
    });

    it('should handle special characters', async () => {
      const specialInput = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      const result = await service.process(specialInput);
      expect(result).toBeDefined();
    });
  });
});
```

---

## 性能测试

### 编写性能测试

```typescript
describe('@performance Cache Operations', () => {
  it('should complete 1000 SET operations in < 2 seconds', async () => {
    const start = Date.now();

    for (let i = 0; i < 1000; i++) {
      await cache.set(`key${i}`, `value${i}`);
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000);

    console.log(`✅ 1000 SET operations: ${duration}ms`);
  });

  it('should handle 100 concurrent requests', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      cache.set(`key${i}`, `value${i}`)
    );

    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
  });

  it('should maintain stable memory usage', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      await cache.set(`key${i}`, `value${i}`);
    }

    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const increase = (finalMemory - initialMemory) / 1024 / 1024; // MB

    expect(increase).toBeLessThan(50); // 内存增长 < 50MB
  });
});
```

---

## 常见反模式

### ❌ 反模式 1: 测试实现细节

```typescript
// ❌ Bad - 测试私有方法
it('should call _internalProcess method', () => {
  const service = new Service();
  vi.spyOn(service, '_internalProcess' as any);
  service.publicMethod();
  expect(service['_internalProcess']).toHaveBeenCalled();
});

// ✅ Good - 测试公开行为
it('should return processed result', async () => {
  const result = await service.publicMethod();
  expect(result.processed).toBe(true);
});
```

### ❌ 反模式 2: 脆弱的断言

```typescript
// ❌ Bad - 依赖精确值
expect(result.timestamp).toBe(1234567890);
expect(result.id).toBe('uuid-exact-value');

// ✅ Good - 使用范围或类型检查
expect(result.timestamp).toBeCloseTo(Date.now(), -3);
expect(result.id).toBeDefined();
expect(typeof result.id).toBe('string');
```

### ❌ 反模式 3: 测试之间有依赖

```typescript
// ❌ Bad - 测试依赖顺序
describe('UserService', () => {
  let userId: string;

  it('should create user', async () => {
    const result = await service.create({ name: 'Alice' });
    userId = result.id; // 依赖状态
  });

  it('should update user', async () => {
    await service.update(userId, { name: 'Bob' }); // 依赖上一个测试
  });
});

// ✅ Good - 每个测试独立
describe('UserService', () => {
  it('should create and update user', async () => {
    const created = await service.create({ name: 'Alice' });
    const updated = await service.update(created.id, { name: 'Bob' });
    expect(updated.name).toBe('Bob');
  });
});
```

### ❌ 反模式 4: 过度使用真实服务

```typescript
// ❌ Bad - 使用真实 LLM API
it('should generate article', async () => {
  const result = await realLLMAPI.generate('Write about AI');
  expect(result).toBeDefined();
});

// ✅ Good - 使用 Mock
it('should handle LLM response', async () => {
  mockLLM.generate.mockResolvedValue({ content: 'Mock article' });
  const result = await service.generate('Write about AI');
  expect(result.content).toBe('Mock article');
});
```

### ❌ 反模式 5: 忽略错误处理

```typescript
// ❌ Bad - 只测试成功路径
it('should create task', async () => {
  const result = await service.create(taskData);
  expect(result.success).toBe(true);
});

// ✅ Good - 测试成功和失败
describe('task creation', () => {
  it('should succeed with valid data', async () => {
    const result = await service.create(taskFixtures.validAsyncTask);
    expect(result.success).toBe(true);
  });

  it('should fail with invalid data', async () => {
    const result = await service.create(taskFixtures.invalidTaskEmptyTopic);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Topic is required');
  });
});
```

---

## 总结

### 测试编写检查清单

- [ ] 测试名称清晰描述行为和条件
- [ ] 使用 AAA 或 Given-When-Then 结构
- [ ] 使用 fixtures 而不是内联数据
- [ ] 只 Mock 外部依赖
- [ ] 包含成功和失败场景
- [ ] 测试边界条件
- [ ] 测试独立，不依赖其他测试
- [ ] 断言具体而非模糊
- [ ] 使用适当的测试标签
- [ ] 测试运行快速（单元测试 < 5秒）

### 测试质量指标

- **可读性**: 新开发者能理解测试意图
- **可维护性**: 代码变更时测试易于更新
- **速度**: 快速反馈（单元测试秒级运行）
- **可靠性**: 测试结果稳定，不flaky
- **覆盖性**: 覆盖正常、异常、边界情况

---

**记住**: 好的测试是代码质量的保障，值得投入时间编写和维护！
