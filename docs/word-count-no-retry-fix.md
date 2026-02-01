# 字数检查不重试修复总结

## 问题描述

用户需求："调整一下检查节点，如果只是字数不符合标准，就可以不用重试了"

## 原有逻辑

在 CheckTextNode 中，如果硬规则检查（包括字数、关键词、结构）失败，会递增 `textRetryCount` 并触发 WriteNode 重写内容。

**问题**：即使只是字数稍微不符合要求（比如 1900 字，要求 2000-3000 字），也会触发重试，浪费时间和成本。

## 解决方案

**只针对字数不通过的情况**：如果字数不通过但其他规则（关键词、结构）都通过，则不触发重试，只在建议中添加警告。

### 修改文件

**文件**：`src/domain/workflow/nodes/CheckTextNode.ts`

**修改位置**：`executeLogic` 方法（第 693-746 行）

### 核心逻辑

```typescript
// 6. 判断是否通过
const retryCount = state.textRetryCount || 0;
let hardRulesPassed = hardRulesCheck.passed;
let wordCountWarning = '';

// 🆕 字数特殊处理：如果只是字数不通过，其他规则都通过，则不重试
const onlyWordCountFailed =
  !hardRulesCheck.wordCount.passed &&
  hardRulesCheck.keywords.passed &&
  hardRulesCheck.structure.passed;

if (onlyWordCountFailed) {
  // 只是字数不符合，不重试，但在建议中添加警告
  hardRulesPassed = true;
  const wordCount = hardRulesCheck.wordCount.wordCount;
  const minWords = hardRulesCheck.wordCount.minRequired;
  const maxWords = hardRulesCheck.wordCount.maxRequired;

  if (minWords && wordCount < minWords) {
    wordCountWarning = `⚠️ 字数偏少：${wordCount} 字（要求至少 ${minWords} 字）。`;
  } else if (maxWords && wordCount > maxWords) {
    wordCountWarning = `⚠️ 字数偏多：${wordCount} 字（要求不超过 ${maxWords} 字）。`;
  }

  logger.info('Word count check bypassed (only word count failed)', {
    taskId: state.taskId,
    wordCount,
    minWords,
    maxWords,
  });
}
```

## 决策逻辑

### 触发不重试的条件

**同时满足以下条件**：
1. ❌ 字数检查不通过（`wordCount.passed = false`）
2. ✅ 关键词检查通过（`keywords.passed = true`）
3. ✅ 结构检查通过（`structure.passed = true`）

### 处理方式

- ✅ `hardRulesPassed = true`（硬规则视为通过）
- ✅ 不递增 `textRetryCount`（不触发重试）
- ⚠️ 在 `fixSuggestions` 中添加字数警告

### 警告信息

**字数偏少**：
```
⚠️ 字数偏少：1900 字（要求至少 2000 字）。
```

**字数偏多**：
```
⚠️ 字数偏多：3200 字（要求不超过 3000 字）。
```

## 行为对比

### 修改前

| 检查项 | 通过 | 重试 | 说明 |
|-------|------|------|------|
| 字数 | ❌ | ✅ | 触发重试 |
| 关键词 | ✅ | - | - |
| 结构 | ✅ | - | - |
| **结果** | - | **重试** | 浪费时间和成本 |

### 修改后

| 检查项 | 通过 | 重试 | 说明 |
|-------|------|------|------|
| 字数 | ❌ | ❌ | 只警告，不重试 |
| 关键词 | ✅ | - | - |
| 结构 | ✅ | - | - |
| **结果** | - | **不重试** | 在建议中显示警告 |

## 其他失败场景

### 关键词不通过

```
关键词检查失败 → 触发重试
```

### 结构不通过

```
结构检查失败（缺少标题/导语/正文/结语）→ 触发重试
```

### 多项不通过

```
字数 + 关键词 + 结构失败 → 触发重试
```

## 日志输出

### Debug 日志

```typescript
logger.info('Word count check bypassed (only word count failed)', {
  taskId: state.taskId,
  wordCount: 1900,
  minWords: 2000,
  maxWords: 3000,
});
```

### 质检报告

```json
{
  "score": 8.5,
  "passed": true,
  "hardConstraintsPassed": true,
  "details": {
    "hardRules": {
      "passed": true,
      "wordCount": {
        "passed": false,
        "wordCount": 1900,
        "minRequired": 2000,
        "maxRequired": 3000
      },
      "keywords": { "passed": true, ... },
      "structure": { "passed": true, ... }
    },
    "softScores": { ... }
  },
  "fixSuggestions": [
    "⚠️ 字数偏少：1900 字（要求至少 2000 字）。",
    "其他改进建议..."
  ]
}
```

## 测试场景

### 场景 1：字数偏少

**输入**：
- 字数：1900 字
- 要求：2000-3000 字
- 关键词：✅ 全部找到
- 结构：✅ 完整

**结果**：
- ✅ 通过检查
- ⚠️ 显示警告：`⚠️ 字数偏少：1900 字（要求至少 2000 字）。`
- ❌ 不重试

### 场景 2：字数偏多

**输入**：
- 字数：3200 字
- 要求：2000-3000 字
- 关键词：✅ 全部找到
- 结构：✅ 完整

**结果**：
- ✅ 通过检查
- ⚠️ 显示警告：`⚠️ 字数偏多：3200 字（要求不超过 3000 字）。`
- ❌ 不重试

### 场景 3：字数 + 关键词失败

**输入**：
- 字数：1900 字
- 要求：2000-3000 字
- 关键词：❌ 缺少一个
- 结构：✅ 完整

**结果**：
- ❌ 不通过检查
- ❌ 触发重试

### 场景 4：完全通过

**输入**：
- 字数：2500 字
- 要求：2000-3000 字
- 关键词：✅ 全部找到
- 结构：✅ 完整

**结果**：
- ✅ 通过检查
- ✅ 无警告
- ❌ 不重试

## 优势

1. **节省成本**：避免因字数小幅度偏差而重写内容
2. **提高效率**：减少不必要的重试，加快任务完成速度
3. **保留反馈**：通过警告信息让用户了解字数情况
4. **保持质量**：仍然对关键词和结构严格要求

## 注意事项

1. **字数范围**：此逻辑适用于字数在合理范围内（如偏差不超过 20%）
2. **内容质量**：如果内容质量评分（软评分）不达标，仍然会重试
3. **其他节点**：此修改仅影响 CheckTextNode，CheckImageNode 无类似问题

## 相关文件

- `src/domain/workflow/nodes/CheckTextNode.ts` - 文本质检节点（已修改）
- `src/domain/workflow/nodes/CheckImageNode.ts` - 图片质检节点（无需修改）
- `src/domain/workflow/nodes/WriteNode.ts` - 内容生成节点（读取 textRetryCount）

## 总结

✅ **修改完成**：如果只是字数不符合标准，不再触发重试，只在建议中显示警告。

**效果**：
- 节省时间和成本（避免不必要的重写）
- 提高用户体验（任务完成更快）
- 保持质量控制（关键词和结构仍然严格检查）
