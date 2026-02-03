/**
 * Code Validation Prompt - 代码验证 Prompt
 *
 * 用于 AI 验证生成的代码是否符合项目最佳实践
 */

// ============================================================================
// 验证维度定义
// ============================================================================

/**
 * 验证维度枚举
 */
export enum ValidationDimension {
  /** 类型安全 */
  TypeSafety = 'typeSafety',
  /** 代码风格 */
  CodeStyle = 'codeStyle',
  /** 最佳实践 */
  BestPractices = 'bestPractices',
  /** 性能 */
  Performance = 'performance',
  /** 可维护性 */
  Maintainability = 'maintainability',
  /** 错误处理 */
  ErrorHandling = 'errorHandling',
}

/**
 * 验证维度描述
 */
export const ValidationDimensionDescriptions: Record<ValidationDimension, string> = {
  [ValidationDimension.TypeSafety]: '类型安全：TypeScript 类型定义是否完整、准确',
  [ValidationDimension.CodeStyle]: '代码风格：命名规范、代码格式、注释质量',
  [ValidationDimension.BestPractices]: '最佳实践：是否遵循项目设计模式和编码规范',
  [ValidationDimension.Performance]: '性能：是否有明显的性能问题或优化空间',
  [ValidationDimension.Maintainability]: '可维护性：代码结构是否清晰、是否易于理解和修改',
  [ValidationDimension.ErrorHandling]: '错误处理：异常捕获、错误日志、用户提示',
};

// ============================================================================
// Prompt 模板
// ============================================================================

/**
 * 代码验证 Prompt 模板
 */
export const CODE_VALIDATION_PROMPT = (
  code: string,
  projectPatterns: string,
  bestPractices: string
): string => `你是一个代码审查专家，负责审查生成的工作流代码。

## 项目背景

这是一个基于 LangGraph 的 AI 驱动工作流系统。

### 项目代码模式
\`\`\`
${projectPatterns}
\`\`\`

### 项目最佳实践
\`\`\`
${bestPractices}
\`\`\`

## 待验证代码

\`\`\`typescript
${code}
\`\`\`

## 验证维度

请从以下维度对代码进行评分（0-100）：

1. **类型安全 (TypeSafety)**
   - TypeScript 类型定义是否完整
   - 是否避免使用 \`any\` 类型
   - 泛型使用是否正确
   - 类型推断是否有效

2. **代码风格 (CodeStyle)**
   - 命名是否符合规范（camelCase、PascalCase、kebab-case）
   - 缩进和格式是否一致
   - 注释是否清晰、有用
   - 代码组织是否合理

3. **最佳实践 (BestPractices)**
   - 是否继承正确的基类（BaseNode、BaseWorkflowState）
   - 是否实现必需的方法（executeLogic、createGraph 等）
   - 是否遵循项目架构模式
   - 是否使用正确的导入路径

4. **性能 (Performance)**
   - 是否有不必要的循环或递归
   - 是否正确使用 async/await
   - 是否避免阻塞操作
   - 内存使用是否合理

5. **可维护性 (Maintainability)**
   - 代码结构是否清晰
   - 单一职责原则
   - 是否易于理解和修改
   - 是否有适当的注释和文档

6. **错误处理 (ErrorHandling)**
   - 是否正确处理异常
   - 是否使用 try-catch
   - 是否记录错误日志
   - 是否提供用户友好的错误消息

## 输出格式

请以 JSON 格式返回验证结果：

\`\`\`json
{
  "summary": {
    "overallScore": 85,
    "pass": true,
    "passThreshold": 70
  },
  "dimensions": {
    "typeSafety": {
      "score": 90,
      "issues": [],
      "suggestions": ["建议为 state 参数添加更具体的类型定义"]
    },
    "codeStyle": {
      "score": 85,
      "issues": ["line 45: 缺少空行"],
      "suggestions": []
    },
    "bestPractices": {
      "score": 80,
      "issues": ["未调用 logger.debug() 记录节点执行开始"],
      "suggestions": ["建议在 executeLogic 方法开始时添加日志"]
    },
    "performance": {
      "score": 95,
      "issues": [],
      "suggestions": []
    },
    "maintainability": {
      "score": 88,
      "issues": [],
      "suggestions": ["建议将复杂的条件判断提取为独立方法"]
    },
    "errorHandling": {
      "score": 75,
      "issues": ["缺少对 LLM 调用失败的异常处理"],
      "suggestions": ["建议添加 try-catch 捕获 LLM 服务异常"]
    }
  },
  "criticalIssues": [
    {
      "severity": "high",
      "category": "errorHandling",
      "message": "缺少对 LLM 调用失败的异常处理",
      "location": "executeNode method, line 78",
      "fixSuggestion": "添加 try-catch 块：\\n\\ntry {\\n  const result = await this.llmService.chat(...);\\n} catch (error) {\\n  logger.error('LLM call failed', error);\\n  throw error;\\n}"
    }
  ],
  "improvements": [
    {
      "priority": "medium",
      "category": "maintainability",
      "description": "建议将复杂的条件判断提取为独立方法",
      "example": "private shouldRetry(state: State): boolean {\\n  return state.retryCount < this.maxRetries;\\n}"
    }
  ],
  "autoFixable": [
    {
      "issue": "line 45: 缺少空行",
      "fix": "在 line 45 之后添加空行以分隔逻辑块"
    }
  ]
}
\`\`\`

## 评分标准

- **90-100**: 优秀 - 代码质量很高，只有微小的改进空间
- **80-89**: 良好 - 代码质量良好，有一些小的改进建议
- **70-79**: 及格 - 代码基本可用，有一些需要改进的地方
- **60-69**: 待改进 - 代码存在较多问题，建议修改
- **< 60**: 不及格 - 代码存在严重问题，必须修改

## 注意事项

1. **只关注代码质量问题**，不评估业务逻辑正确性
2. **提供建设性的建议**，而不是批评
3. **优先报告严重问题**（criticalIssues）
4. **区分可自动修复的问题**（autoFixable）和需要手动修改的问题
5. **提供具体的代码示例**说明如何改进

现在开始验证代码，返回 JSON 格式的结果。`;

// ============================================================================
// 辅助类型
// ============================================================================

/**
 * 验证结果
 */
export interface CodeValidationResult {
  /** 总体评分（0-100） */
  overallScore: number;
  /** 是否通过验证（>= 70 分） */
  pass: boolean;
  /** 通过阈值 */
  passThreshold: number;
  /** 各维度评分 */
  dimensions: Record<ValidationDimension, DimensionScore>;
  /** 严重问题列表 */
  criticalIssues: CodeIssue[];
  /** 改进建议列表 */
  improvements: CodeImprovement[];
  /** 可自动修复的问题列表 */
  autoFixable: AutoFixableIssue[];
}

/**
 * 维度评分
 */
export interface DimensionScore {
  /** 评分（0-100） */
  score: number;
  /** 问题列表 */
  issues: string[];
  /** 建议列表 */
  suggestions: string[];
}

/**
 * 代码问题
 */
export interface CodeIssue {
  /** 严重程度 */
  severity: 'high' | 'medium' | 'low';
  /** 问题类别 */
  category: string;
  /** 问题描述 */
  message: string;
  /** 代码位置 */
  location?: string;
  /** 修复建议 */
  fixSuggestion?: string;
}

/**
 * 代码改进建议
 */
export interface CodeImprovement {
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 类别 */
  category: string;
  /** 描述 */
  description: string;
  /** 示例代码 */
  example?: string;
}

/**
 * 可自动修复的问题
 */
export interface AutoFixableIssue {
  /** 问题描述 */
  issue: string;
  /** 修复方案 */
  fix: string;
}

// ============================================================================
// 导出
// ============================================================================

export default {
  CODE_VALIDATION_PROMPT,
  ValidationDimension,
  ValidationDimensionDescriptions,
};
