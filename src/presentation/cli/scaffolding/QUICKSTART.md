# AI-Native 工作流脚手架 - 快速开始

## 5 分钟创建你的第一个工作流

### 前提条件

- ✅ 已安装 Node.js 18+
- ✅ 已配置 LLM API（DeepSeek 或 Claude CLI）
- ✅ 已克隆项目并安装依赖

### 第一步：验证环境

```bash
cd content-creator
pnpm run verify-env
```

预期输出：
```
✅ 所有检查通过
🎉 环境准备完成
```

### 第二步：创建工作流

```bash
pnpm run cli workflow "创建一个文本摘要工作流，输入长文本，输出200字摘要"
```

### 第三步：查看生成的代码

```bash
cd text-summarizer
ls -la
```

你会看到：
```
TextSummarizerState.ts      # 状态接口
nodes/                       # 节点类
  ├── SummarizeNode.ts
  └── CalculateLengthNode.ts
TextSummarizerGraph.ts      # 工作流图
TextSummarizerFactory.ts    # 工厂类
index.ts                     # 导出
```

### 第四步：注册工作流

在 `src/domain/workflow/WorkflowRegistry.ts` 中添加：

```typescript
import { TextSummarizerFactory } from './text-summarizer/index.js';

WorkflowRegistry.register(new TextSummarizerFactory());
```

### 第五步：使用工作流

```bash
pnpm run cli create --type text-summarizer \
  --sourceText "这是一段很长的文本内容..." \
  --maxLength 200
```

## 下一步

- 📖 查看完整指南：[docs/guides/workflow-scaffolding-guide.md](../../../../../docs/guides/workflow-scaffolding-guide.md)
- 🎯 尝试示例：[examples/workflows/](../../../../../examples/workflows/)
- 🔧 了解架构：[docs/design/workflow-scaffolding-design.md](../../../../../docs/design/workflow-scaffolding-design.md)

## 常见问题

**Q: LLM 调用失败？**
A: 检查 `.env` 文件中的 API 配置

**Q: 生成的代码有错误？**
A: 运行 `pnpm run lint` 查看详细错误

**Q: 如何自定义工作流？**
A: 查看使用指南中的"进阶使用"章节

---

**需要帮助？** 查看 [完整文档](../../../../../docs/guides/workflow-scaffolding-guide.md)
