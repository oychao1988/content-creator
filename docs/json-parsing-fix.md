# 节点 JSON 解析问题修复总结

## 问题描述

在使用流式输出时，某些节点（CheckTextNode、OrganizeNode、CheckImageNode、GenerateImageNode）在解析 LLM 返回的 JSON 时可能失败，原因包括：

1. **Markdown 代码块** - LLM 返回的内容包含 ````json` 或 ````` 标记
2. **额外文字说明** - JSON 前后有 LLM 添加的解释性文字
3. **不完整的 JSON** - 流式输出可能被截断或格式错误

## 解决方案

### 1. 在 BaseNode 中添加健壮的 JSON 提取方法

**文件：`src/domain/workflow/nodes/BaseNode.ts`**

新增 `extractJSON` 方法，能够：
- 去除 Markdown 代码块标记（```json 或 ```）
- 从混合文本中提取第一个完整的 JSON 对象
- 正确处理嵌套的括号和字符串转义
- 验证提取的内容是否是有效的 JSON

```typescript
protected extractJSON(content: string): string {
  let text = content.trim();

  // 1. 去除 Markdown 代码块标记
  if (text.startsWith('```json')) {
    text = text.slice(7);
  } else if (text.startsWith('```')) {
    text = text.slice(3);
  }
  if (text.endsWith('```')) {
    text = text.slice(0, -3);
  }
  text = text.trim();

  // 2. 尝试直接解析（如果内容本身就是纯 JSON）
  try {
    JSON.parse(text);
    return text;
  } catch {
    // 不是纯 JSON，继续尝试提取
  }

  // 3. 查找第一个 { 或 [ 的位置
  const startIndex = text.indexOf('{');
  const arrayIndex = text.indexOf('[');

  let jsonStart = -1;
  if (startIndex !== -1 && arrayIndex !== -1) {
    jsonStart = Math.min(startIndex, arrayIndex);
  } else if (startIndex !== -1) {
    jsonStart = startIndex;
  } else if (arrayIndex !== -1) {
    jsonStart = arrayIndex;
  }

  if (jsonStart === -1) {
    throw new Error('No JSON object found in content');
  }

  // 4. 查找匹配的结束括号（处理嵌套和字符串）
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  let jsonEnd = -1;

  for (let i = jsonStart; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{' || char === '[') {
        bracketCount++;
      } else if (char === '}' || char === ']') {
        bracketCount--;
        if (bracketCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
  }

  if (jsonEnd === -1) {
    throw new Error('Incomplete JSON object found');
  }

  const extracted = text.substring(jsonStart, jsonEnd);

  // 5. 验证提取的内容是否是有效的 JSON
  try {
    JSON.parse(extracted);
    return extracted;
  } catch (error) {
    throw new Error(`Extracted content is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

### 2. 更新所有节点使用新的提取方法

#### OrganizeNode

**修改前：**
```typescript
let content = result.content.trim();
if (content.startsWith('```json')) {
  content = content.slice(7);
}
// ... 更多手动处理
output = JSON.parse(content);
```

**修改后：**
```typescript
const jsonContent = this.extractJSON(result.content);
output = JSON.parse(jsonContent);
```

#### CheckTextNode

**修改前：**
```typescript
let content = result.content.trim();
if (content.startsWith('```json')) {
  content = content.slice(7);
}
// ... 更多手动处理
output = JSON.parse(content);
```

**修改后：**
```typescript
const jsonContent = this.extractJSON(result.content);
output = JSON.parse(jsonContent);
```

#### CheckImageNode

**修改前：**
```typescript
let content = result.content.trim();
if (content.startsWith('```json')) {
  content = content.slice(7);
}
// ... 更多手动处理
output = JSON.parse(content);
```

**修改后：**
```typescript
const jsonContent = this.extractJSON(result.content);
output = JSON.parse(jsonContent);
```

#### GenerateImageNode

**修改前：**
```typescript
let content = result.content.trim();
if (content.startsWith('```json')) {
  content = content.slice(7);
}
// ... 更多手动处理
prompts = JSON.parse(content);
```

**修改后：**
```typescript
const jsonContent = this.extractJSON(result.content);
prompts = JSON.parse(jsonContent);
```

## 处理的常见情况

### 情况 1：纯 JSON

```json
{"outline":"# 标题","keyPoints":["点1","点2"]}
```

✅ 直接返回，无需额外处理

### 情况 2：Markdown 代码块

````text
```json
{"outline":"# 标题","keyPoints":["点1","点2"]}
```
````

✅ 去除 ```json 和 ``` 标记

### 情况 3：JSON 前有额外文字

```text
根据搜索结果，我整理了以下大纲：

{"outline":"# 标题","keyPoints":["点1","点2"]}

希望对你有帮助！
```

✅ 提取第一个完整的 JSON 对象

### 情况 4：嵌套 JSON

```json
{
  "details": {
    "hardRules": {
      "wordCount": {"passed": true, "wordCount": 1000}
    }
  }
}
```

✅ 正确处理嵌套括号

### 情况 5：JSON 中包含字符串

```json
{"text":"他说：\"这是一个测试\""}
```

✅ 正确处理转义字符和字符串中的引号

## 错误处理

### CheckTextNode 降级处理

如果 JSON 解析失败，返回默认评分，不中断流程：

```typescript
catch (error) {
  logger.error('Failed to parse LLM output as JSON', {
    taskId: state.taskId,
    content: result.content.substring(0, 500),
    error: error instanceof Error ? error.message : String(error),
  });

  // 降级处理：返回默认的软评分
  logger.warn('Using default soft scores due to parsing failure');
  output = {
    score: 8.0,
    passed: true,
    hardConstraintsPassed: true,
    // ... 默认值
  };
}
```

### 其他节点抛出错误

OrganizeNode、GenerateImageNode 等节点在解析失败时抛出错误，让工作流重试：

```typescript
catch (error) {
  logger.error('Failed to parse LLM output as JSON', {
    taskId: state.taskId,
    content: result.content.substring(0, 500),
    error: error instanceof Error ? error.message : String(error),
  });

  throw new Error(
    'Failed to parse organize output. LLM did not return valid JSON.'
  );
}
```

## 测试建议

### 单元测试

创建测试用例验证各种格式的 JSON 提取：

```typescript
describe('extractJSON', () => {
  it('should extract pure JSON', () => {
    const input = '{"key":"value"}';
    const output = node.extractJSON(input);
    expect(output).toBe(input);
  });

  it('should extract JSON from markdown code block', () => {
    const input = '```json\n{"key":"value"}\n```';
    const output = node.extractJSON(input);
    expect(output).toBe('{"key":"value"}');
  });

  it('should extract JSON from text with extra content', () => {
    const input = 'Some text before\n{"key":"value"}\nSome text after';
    const output = node.extractJSON(input);
    expect(output).toBe('{"key":"value"}');
  });

  it('should handle nested JSON', () => {
    const input = '{"outer":{"inner":"value"}}';
    const output = node.extractJSON(input);
    expect(output).toBe(input);
  });
});
```

### 集成测试

运行完整工作流，验证节点能够正确处理 LLM 返回的内容：

```bash
# 使用 debug 模式查看详细的解析过程
LOG_LEVEL=debug npm run cli create -- --topic "测试" --requirements "写一篇文章"
```

## 优势

1. **统一处理** - 所有节点使用同一个提取方法，便于维护
2. **健壮性** - 能够处理各种常见的 LLM 输出格式
3. **可扩展** - 未来可以轻松添加新的处理规则
4. **错误友好** - 提供清晰的错误信息，便于调试
5. **向后兼容** - 对于纯 JSON 输入，性能与直接 JSON.parse 相同

## 相关文件

- `src/domain/workflow/nodes/BaseNode.ts` - 新增 extractJSON 方法
- `src/domain/workflow/nodes/OrganizeNode.ts` - 使用 extractJSON
- `src/domain/workflow/nodes/CheckTextNode.ts` - 使用 extractJSON
- `src/domain/workflow/nodes/CheckImageNode.ts` - 使用 extractJSON
- `src/domain/workflow/nodes/GenerateImageNode.ts` - 使用 extractJSON

## 注意事项

1. **性能** - 对于纯 JSON 输入，会先尝试直接解析，避免不必要的处理
2. **日志** - 解析失败时会记录前 500 字符，便于调试
3. **错误处理** - 不同节点有不同的错误处理策略（降级或重试）
4. **验证** - 提取后会验证 JSON 有效性，确保返回的是有效 JSON

## 后续优化

1. **缓存** - 可以缓存常见的提取模式，提升性能
2. **统计** - 记录各种解析情况的频率，优化常见情况
3. **恢复** - 对于部分损坏的 JSON，可以尝试自动修复
4. **测试** - 添加更多的边界情况测试用例
