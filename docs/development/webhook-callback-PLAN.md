# Webhook 回调功能实施计划

## 任务概述

在 content-creator 中添加 HTTP Webhook 回调功能，使任务完成时能够主动通知外部系统（如 ContentHub），实现实时通知、降低负载和更好的架构设计。

## 设计文档参考

- 实施计划: `docs/design/webhook-implementation-plan.md`
- 设计方案: `docs/design/webhook-callback-feature.md`

## 阶段划分

### 阶段 1: 创建 Webhook 服务 ✓ 已完成
- **目标**: 实现核心的 WebhookService 类，支持回调发送、重试机制和队列管理
- **详细描述**:
  - 创建 `src/infrastructure/callback/WebhookService.ts`
  - 实现 `CallbackPayload` 和 `WebhookOptions` 接口
  - 实现内存队列机制（不阻塞任务执行）
  - 实现带重试的发送逻辑（默认重试3次，每次间隔5秒）
  - 实现超时控制（默认10秒）
  - 添加详细的日志记录（成功、失败、重试）
  - 创建单元测试 `src/infrastructure/callback/__tests__/WebhookService.test.ts`
  - 测试覆盖：成功发送、禁用回调、重试机制、超时处理
- **完成标准**:
  - 单元测试覆盖率 > 90%
  - 所有测试用例通过
  - 日志输出清晰完整
- **执行结果**:
  - 成功创建 `WebhookService.ts` (263行)
  - 成功创建 25 个单元测试，覆盖率 95.74%
  - 所有测试通过 (25/25)
  - 实现了异步队列、重试机制、超时控制
  - 使用 axios 和 Winston logger
  - 修复了 Vitest 配置，添加了覆盖率工具
- **状态**: ✓ 已完成

### 阶段 2: 集成到执行器 ✓ 已完成
- **目标**: 将 Webhook 服务集成到 SyncExecutor，在任务完成/失败时自动发送回调
- **详细描述**:
  - 修改 `src/domain/workflow/WorkflowParams.ts` 接口
    - 添加 `callbackUrl?: string`
    - 添加 `callbackEnabled?: boolean`
    - 添加 `callbackEvents?: string[]`
  - 修改 `src/application/workflow/SyncExecutor.ts`
    - 注入 `WebhookService` 实例
    - 在 `execute` 方法中添加成功回调逻辑
    - 在 `execute` 方法中添加失败回调逻辑
    - 实现 `sendWebhookNotification` 私有方法
    - 添加事件过滤机制（只发送配置的事件）
    - 添加错误处理（webhook 失败不影响任务执行）
    - 添加详细日志
- **完成标准**:
  - 任务成功时发送 completed 事件
  - 任务失败时发送 failed 事件
  - Webhook 失败不影响任务执行
  - 日志记录完整
- **执行结果**:
  - 验证 CreateTaskParams 接口已包含所有必需的 webhook 参数
  - 验证 SyncExecutor 已完整实现集成（构造函数、成功/失败回调、事件过滤）
  - 创建了 13 个集成测试用例，全部通过
  - 实现了完整的容错机制（webhook 失败不影响任务执行）
  - 添加了详细的日志记录（debug, info, error）
- **状态**: ✓ 已完成

### 阶段 3: 扩展 CLI 参数 ✓ 已完成
- **目标**: 在 CLI 中添加 webhook 相关参数，支持用户配置回调 URL 和事件
- **详细描述**:
  - 修改 `src/presentation/cli/commands/create.ts`
    - 添加 `--callback-url <url>` 选项
    - 添加 `--callback-events <events>` 选项（逗号分隔）
    - 解析事件列表参数
    - 将回调参数传递到执行器
  - 更新命令帮助文档
  - 添加使用示例
- **完成标准**:
  - CLI 正确解析回调参数
  - 参数正确传递到执行器
  - 帮助文档清晰完整
  - 使用示例可运行
- **执行结果**:
  - 验证 CLI 参数已实现（Lines 33-34）
  - 验证参数解析逻辑完整（Lines 94-110）
  - 验证显示逻辑友好（Lines 154-163）
  - 测试命令成功运行，输出符合预期
  - 帮助文档清晰完整
- **状态**: ✓ 已完成

### 阶段 4: 编写集成测试 ✓ 已完成
- **目标**: 创建完整的集成测试，验证 webhook 回调功能端到端工作正常
- **详细描述**:
  - 创建测试 webhook 服务器 `tests/fixtures/callback-server.ts`
    - Express 服务器监听 3000 端口
    - POST /callback 端点接收回调
    - 将回调记录到文件 `test-webhook-callbacks.json`
    - 实现自动端口冲突检测和清理
  - 创建集成测试 `tests/integration/webhook-callback-integration.test.ts`
    - 测试成功回调
    - 测试失败回调
    - 测试事件过滤
    - 测试回调禁用（callbackEnabled=false，未配置 URL）
    - 测试重试机制
    - 测试元数据验证
    - 测试并发回调（3个同时任务）
  - 所有测试通过
- **完成标准**:
  - 集成测试覆盖率 > 80%
  - 所有测试用例通过
  - 测试文档清晰
- **执行结果**:
  - 成功创建测试服务器（188行，支持自动端口管理）
  - 成功创建集成测试（369行，9个测试场景）
  - 所有 9 个测试场景通过（100%通过率）
  - WebhookService 代码覆盖率：80.85%（超过 >80% 要求）
  - SyncExecutor 代码覆盖率：60%
  - 测试总耗时：约 5 分钟（305秒）
  - 生成回调记录文件（17KB，包含完整 payload）
  - 测试场景覆盖：
    - ✅ 场景 1: 成功回调（46秒）
    - ✅ 场景 2: 失败回调（10秒）
    - ✅ 场景 3: 事件过滤（10秒，35秒）
    - ✅ 场景 4: 回调禁用（36秒，36秒）
    - ✅ 场景 5: 回调重试（44秒）
    - ✅ 场景 6: 元数据验证（38秒）
    - ✅ 场景 7: 并发回调（48秒）
- **状态**: ✓ 已完成

### 阶段 5: 更新文档 ✓ 已完成
- **目标**: 编写完整的用户文档和开发文档
- **详细描述**:
  - 创建 `docs/guides/webhook-guide.md` 使用指南
    - 快速开始示例
    - 事件类型说明
    - 配置选项说明
    - 回调 Payload 格式
    - 接收回调的代码示例（Node.js、Python、Go）
    - 最佳实践（签名验证、异步处理、幂等性、错误处理、监控日志）
    - 故障排查指南（4 个常见问题）
    - 常见问题（7 个 FAQ）
  - 更新 `README.md`
    - 在功能特性中添加 Webhook 回调
    - 添加使用示例
  - 更新 `CHANGELOG.md`
    - 记录新增功能
    - 记录接口变更
- **完成标准**:
  - 文档清晰完整
  - 包含多个语言示例
  - 包含故障排查指南
  - CHANGELOG 记录完整
- **执行结果**:
  - 成功创建 `docs/guides/webhook-guide.md`（约 650 行）
    - 包含完整的快速开始指南
    - 详细的事件类型说明
    - 完整的配置选项文档
    - Node.js、Python、Go 三种语言的接收回调示例
    - 5 个最佳实践（签名验证、异步处理、幂等性、错误处理、监控日志）
    - 4 个故障排查方案
    - 7 个常见问题解答
  - 成功更新 `README.md`
    - 添加 Webhook 回调核心特性
    - 添加 CLI 使用示例
    - 添加文档链接
  - 成功更新 `CHANGELOG.md`
    - 添加 Unreleased 版本条目
    - 记录所有新增功能
    - 记录接口变更
    - 记录文档更新
- **状态**: ✓ 已完成

## 整体进展
- 已完成: 5 / 5 ✅
- 状态: **全部完成**
- 完成日期: 2026-02-08

## 重要备注

### 技术要点
1. 使用 axios 发送 HTTP 请求（需确保已安装）
2. 异步队列处理，不阻塞任务执行
3. 重试机制：默认重试3次，每次间隔5秒
4. 超时控制：默认10秒
5. 回调失败不应影响任务执行结果

### 验收标准总结
- CLI 支持 `--callback-url` 参数
- 支持 `--callback-events` 参数（事件过滤）
- 回调失败自动重试（3次）
- 回调超时控制（10秒）
- 支持禁用回调（默认启用）
- 支持异步队列（不阻塞任务）
- 单元测试覆盖率 > 90%
- 集成测试通过率 100%

### 预计工作量
- 阶段 1: 4-5 小时
- 阶段 2: 2-3 小时
- 阶段 3: 2 小时
- 阶段 4: 3-4 小时
- 阶段 5: 2 小时
- **总计**: 13-16 小时（约 2 天）
