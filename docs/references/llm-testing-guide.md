# LLM 服务测试指南

## 概述

本项目提供了完整的 LLM 服务测试套件，包括单元测试、集成测试和手动测试脚本。

## 测试类型

### 1. 单元测试（Mock）

**位置**: `tests/llm/`

- `LLMConfig.test.ts` - 配置系统测试
- `LLMServiceFactory.test.ts` - 服务工厂测试

**运行方式**:
```bash
npm test -- tests/llm/
```

**特点**:
- ✅ 快速执行（< 1s）
- ✅ 无外部依赖
- ✅ 不消耗 API 配额
- ⚠️ 使用 Mock 数据

---

### 2. 集成测试（真实调用）

**位置**: `tests/integration/llm-service-integration.test.ts`

**运行方式**:

```bash
# 启用集成测试并运行 API 模式
RUN_INTEGRATION_TESTS=true npm test -- tests/integration/llm-service-integration.test.ts

# 启用集成测试并运行 CLI 模式
LLM_SERVICE_TYPE=cli RUN_INTEGRATION_TESTS=true npm test -- tests/integration/llm-service-integration.test.ts
```

**测试内容**:

#### API 模式测试
- ✅ 非流式模式调用
- ✅ 流式模式调用
- ✅ 多轮对话
- ✅ 流式 vs 非流式对比
- ✅ 健康检查
- ✅ Token 估算
- ✅ 成本估算

#### CLI 模式测试
- ✅ 非流式模式调用
- ✅ 流式模式调用
- ✅ System 消息传递
- ✅ 流式 JSON 解析
- ✅ 健康检查
- ✅ Token 估算
- ✅ 成本估算

**特点**:
- ⏱️ 较长执行时间（30-60s）
- 💰 消耗 API 配额
- ✅ 测试真实场景
- ✅ 验证端到端功能

---

### 3. 手动测试脚本

**位置**: `scripts/test-llm-integration.ts`

**运行方式**:

```bash
# 测试当前配置的模式（API 或 CLI）
npm run test:llm:integration

# 显示详细输出
npm run test:llm:integration:verbose

# 测试 API 模式（自动）
npm run test:llm:integration

# 测试 CLI 模式（需要先切换配置）
LLM_SERVICE_TYPE=cli npm run test:llm:integration
```

**输出内容**:
- 📊 响应长度统计
- 🔢 Token 使用情况
- 💰 成本估算
- ⏱️ 响应时间
- 📄 响应内容预览（verbose 模式）

---

## 快速测试命令

| 命令 | 说明 | 模式 | 时间 |
|------|------|------|------|
| `npm test -- tests/llm/` | 单元测试 | Mock | < 1s |
| `npm run test:llm:quick` | 快速测试 | API | ~10s |
| `npm run test:llm:integration` | 集成测试 | 当前 | ~30s |
| `npm run test:llm:api` | API 测试 | API | ~15s |
| `LLM_SERVICE_TYPE=cli npm run test:llm:cli` | CLI 测试 | CLI | ~30s |

---

## 配置切换

### 方式 1: 环境变量

```bash
# 使用 API（默认）
LLM_SERVICE_TYPE=api npm run test:llm:integration

# 使用 CLI
LLM_SERVICE_TYPE=cli npm run test:llm:integration
```

### 方式 2: .env 文件

```bash
# .env
LLM_SERVICE_TYPE=api  # 或 cli
```

---

## 测试场景覆盖

### ✅ 已覆盖的场景

| 场景 | API | CLI | 测试类型 |
|------|-----|-----|---------|
| 基本对话 | ✅ | ✅ | 集成测试 |
| 流式输出 | ✅ | ✅ | 集成测试 |
| 非流式输出 | ✅ | ✅ | 集成测试 |
| System 消息 | ✅ | ✅ | 集成测试 |
| 多轮对话 | ✅ | ❌ | 集成测试 |
| 健康检查 | ✅ | ✅ | 集成测试 |
| Token 估算 | ✅ | ✅ | 集成测试 |
| 成本估算 | ✅ | ✅ | 集成测试 |
| 配置验证 | ✅ | ✅ | 单元测试 |
| 服务工厂 | ✅ | ✅ | 单元测试 |

### ⚠️ 待补充的场景

- [ ] 错误处理（超时、网络错误）
- [ ] 并发请求
- [ ] 大量 Token 处理
- [ ] 特殊字符处理
- [ ] 性能基准测试

---

## 故障排查

### API 模式测试失败

**问题**: `Error: connect ETIMEDOUT`
- 检查网络连接
- 检查 API 密钥是否有效
- 检查 `LLM_BASE_URL` 是否正确

**问题**: `Error: 401 Unauthorized`
- 检查 `LLM_API_KEY` 是否有效

### CLI 模式测试失败

**问题**: `Failed to start Claude CLI`
- 确认已安装 Claude CLI: `which claude`
- 确认 CLI 已配置认证
- 手动测试: `echo "test" | claude -p`

**问题**: `Claude CLI request timeout`
- 增加 `CLAUDE_CLI_DEFAULT_TIMEOUT`
- 检查 CLI 是否正常运行

---

## 最佳实践

### 开发阶段
1. 使用单元测试进行快速验证
2. 使用 Mock 数据避免消耗配额
3. 运行 `npm test -- tests/llm/` 进行快速反馈

### 发布前
1. 运行集成测试验证真实场景
2. 测试 API 和 CLI 两种模式
3. 验证流式和非流式输出
4. 检查成本和 Token 使用情况

### CI/CD
1. 默认只运行单元测试（快速）
2. 使用环境变量控制集成测试
3. 在发布分支运行完整测试套件

---

## 示例输出

### API 模式集成测试

```
🧪 测试 API 模式 (EnhancedLLMService)

📝 测试 1: 非流式模式
✅ 响应长度: 156 字符
✅ Token 使用: 57
✅ 成本: $0.000097
✅ 耗时: 2.34s

📝 测试 2: 流式模式
✅ 响应长度: 203 字符
✅ Token 使用: 73
✅ 成本: $0.000124
✅ 耗时: 3.12s

📊 对比分析
Token 差异: 16 (流式 vs 非流式)
```

### CLI 模式集成测试

```
🧪 测试 CLI 模式 (ClaudeCLIService)

📝 测试 1: 非流式模式
✅ 响应长度: 142 字符
✅ Token 使用: 48
✅ 成本: $0.000540
✅ 耗时: 8.45s

📝 测试 2: 流式模式
✅ 响应长度: 198 字符
✅ Token 使用: 65
✅ 成本: $0.000705
✅ 耗时: 10.23s
```

---

## 总结

✅ **完整的测试覆盖**
- 单元测试（快速、Mock）
- 集成测试（真实、全面）
- 手动测试（灵活、直观）

✅ **API 和 CLI 双模式支持**
- 两种模式都有对应测试
- 配置切换简单

✅ **流式和非流式都测试**
- 验证输出一致性
- 对比性能差异

✅ **便于调试**
- 详细日志输出
- 清晰的错误信息
- 统计数据展示
