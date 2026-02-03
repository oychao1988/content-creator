/**
 * Workflow Understanding Prompt Templates
 *
 * 定义工作流需求理解的 Prompt 模板
 * 用于将自然语言描述转换为结构化的工作流需求
 */

import { config } from '../../../../../config/index.js';

// ============================================================================
// Few-Shot Learning 示例
// ============================================================================

/**
 * 文本摘要工作流示例
 */
const TEXT_SUMMARY_EXAMPLE = {
  input: '创建一个文本摘要工作流，输入长文本，输出摘要，包含质检步骤',
  output: {
    type: 'text-summarizer',
    name: '文本摘要工作流',
    description: '使用 LLM 对长文本进行智能摘要，包含质量检查',
    category: 'content',
    tags: ['summarization', 'nlp', 'content'],
    inputParams: [
      {
        name: 'longText',
        type: 'string',
        required: true,
        description: '需要摘要的长文本内容',
        examples: ['这是一篇很长的文章内容...'],
      },
      {
        name: 'summaryLength',
        type: 'string',
        required: false,
        description: '摘要长度要求',
        defaultValue: 'medium',
        examples: ['short', 'medium', 'long'],
      },
      {
        name: 'targetLanguage',
        type: 'string',
        required: false,
        description: '目标语言',
        defaultValue: 'zh',
        examples: ['zh', 'en'],
      },
    ],
    outputFields: ['summaryText', 'originalLength', 'summaryLength', 'qualityScore'],
    nodes: [
      {
        name: 'summarize',
        displayName: '摘要生成',
        description: '使用 LLM 生成文本摘要',
        nodeType: 'llm',
        timeout: 120000,
        useLLM: true,
        llmSystemPrompt: '你是一位专业的文本摘要专家。请将给定的长文本摘要为简洁、准确的摘要。',
        enableQualityCheck: false,
        dependencies: [],
      },
      {
        name: 'checkQuality',
        displayName: '质量检查',
        description: '检查摘要的质量',
        nodeType: 'quality_check',
        timeout: 60000,
        useLLM: true,
        llmSystemPrompt: '你是一位文本质量评估专家。',
        enableQualityCheck: true,
        qualityCheckPrompt: '评估摘要的准确性、完整性和简洁性，返回 0-10 的评分。',
        dependencies: ['summarize'],
      },
    ],
    connections: [
      { from: 'START', to: 'summarize' },
      { from: 'summarize', to: 'checkQuality', condition: 'summaryText exists' },
      { from: 'checkQuality', to: 'END', condition: 'qualityScore >= 7' },
      { from: 'checkQuality', to: 'summarize', condition: 'qualityScore < 7' },
    ],
    enableQualityCheck: true,
    maxRetries: 2,
    enableCheckpoint: true,
  },
};

/**
 * 翻译工作流示例
 */
const TRANSLATION_EXAMPLE = {
  input: '创建一个翻译工作流，支持中英文互译，包含翻译质量检查',
  output: {
    type: 'translation',
    name: '翻译工作流',
    description: '基于 LLM 的文本翻译工作流，支持多语言翻译和质量检查',
    category: 'translation',
    tags: ['translation', 'multilingual', 'quality-check'],
    inputParams: [
      {
        name: 'sourceText',
        type: 'string',
        required: true,
        description: '待翻译的源文本',
      },
      {
        name: 'sourceLanguage',
        type: 'string',
        required: true,
        description: '源语言代码（如 zh, en, ja）',
        examples: ['zh', 'en', 'ja', 'ko'],
      },
      {
        name: 'targetLanguage',
        type: 'string',
        required: true,
        description: '目标语言代码（如 zh, en, ja）',
        examples: ['zh', 'en', 'ja', 'ko'],
      },
      {
        name: 'translationStyle',
        type: 'string',
        required: false,
        description: '翻译风格',
        examples: ['formal', 'casual', 'technical'],
        defaultValue: 'formal',
      },
      {
        name: 'domain',
        type: 'string',
        required: false,
        description: '专业领域',
        examples: ['technology', 'medical', 'legal'],
      },
    ],
    outputFields: ['translatedText', 'qualityScore', 'fixSuggestions'],
    nodes: [
      {
        name: 'translate',
        displayName: '翻译',
        description: '使用 LLM 进行文本翻译',
        nodeType: 'llm',
        timeout: 150000,
        useLLM: true,
        llmSystemPrompt: '你是一位专业的翻译专家。请准确翻译文本，保持原文的含义和风格。',
        enableQualityCheck: false,
        dependencies: [],
      },
      {
        name: 'checkQuality',
        displayName: '翻译质检',
        description: '检查翻译质量',
        nodeType: 'quality_check',
        timeout: 150000,
        useLLM: true,
        llmSystemPrompt: '你是一位翻译质量评估专家。',
        enableQualityCheck: true,
        qualityCheckPrompt: '评估翻译的准确性、流畅性和一致性，返回 0-10 的评分和改进建议。',
        dependencies: ['translate'],
      },
    ],
    connections: [
      { from: 'START', to: 'translate' },
      { from: 'translate', to: 'checkQuality' },
      {
        from: 'checkQuality',
        to: 'translate',
        condition: 'qualityScore < 8 && retryCount < 2',
      },
      { from: 'checkQuality', to: 'END', condition: 'qualityScore >= 8' },
    ],
    enableQualityCheck: true,
    maxRetries: 2,
    enableCheckpoint: true,
  },
};

/**
 * 内容创作工作流示例
 */
const CONTENT_CREATION_EXAMPLE = {
  input: '创建一个内容创作工作流，支持搜索、写作、配图、质检',
  output: {
    type: 'content-creator',
    name: '内容创作工作流',
    description: 'AI 驱动的多步骤内容创作系统，支持搜索、写作、配图和质量检查',
    category: 'content',
    tags: ['content-creation', 'writing', 'image-generation', 'quality-check'],
    inputParams: [
      {
        name: 'topic',
        type: 'string',
        required: true,
        description: '文章选题',
      },
      {
        name: 'requirements',
        type: 'string',
        required: true,
        description: '写作要求',
      },
      {
        name: 'targetAudience',
        type: 'string',
        required: false,
        description: '目标受众',
        examples: ['技术从业者', '普通读者', '学生'],
      },
      {
        name: 'tone',
        type: 'string',
        required: false,
        description: '写作风格',
        examples: ['专业', '轻松', '幽默'],
        defaultValue: '专业',
      },
      {
        name: 'imageSize',
        type: 'string',
        required: false,
        description: '图片尺寸',
        examples: ['1920x1080', '1280x720'],
        defaultValue: '1920x1080',
      },
      {
        name: 'minWords',
        type: 'number',
        required: false,
        description: '最小字数',
        defaultValue: 500,
      },
      {
        name: 'maxWords',
        type: 'number',
        required: false,
        description: '最大字数',
        defaultValue: 2000,
      },
    ],
    outputFields: ['articleContent', 'images', 'qualityReport'],
    nodes: [
      {
        name: 'search',
        displayName: '信息搜索',
        description: '搜索相关信息',
        nodeType: 'api',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: [],
      },
      {
        name: 'organize',
        displayName: '信息整理',
        description: '整理搜索结果',
        nodeType: 'llm',
        timeout: 60000,
        useLLM: true,
        llmSystemPrompt: '你是一位信息整理专家。请整理搜索结果，提取关键信息。',
        enableQualityCheck: false,
        dependencies: ['search'],
      },
      {
        name: 'write',
        displayName: '内容写作',
        description: '基于整理的信息撰写文章',
        nodeType: 'llm',
        timeout: 180000,
        useLLM: true,
        llmSystemPrompt: '你是一位专业的内容创作者。请根据提供的信息撰写高质量的文章。',
        enableQualityCheck: false,
        dependencies: ['organize'],
      },
      {
        name: 'checkText',
        displayName: '文本质检',
        description: '检查文章质量',
        nodeType: 'quality_check',
        timeout: 60000,
        useLLM: true,
        llmSystemPrompt: '你是一位内容质量评估专家。',
        enableQualityCheck: true,
        qualityCheckPrompt: '评估文章的质量，包括内容准确性、结构合理性、语言表达等。',
        dependencies: ['write'],
      },
      {
        name: 'generateImage',
        displayName: '配图生成',
        description: '生成文章配图',
        nodeType: 'api',
        timeout: 120000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: ['checkText'],
      },
      {
        name: 'checkImage',
        displayName: '配图质检',
        description: '检查配图质量',
        nodeType: 'quality_check',
        timeout: 60000,
        useLLM: true,
        llmSystemPrompt: '你是一位图片质量评估专家。',
        enableQualityCheck: true,
        qualityCheckPrompt: '评估图片的相关性、质量和美观度。',
        dependencies: ['generateImage'],
      },
      {
        name: 'postProcess',
        displayName: '后处理',
        description: '整合最终内容',
        nodeType: 'transform',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: ['checkImage'],
      },
    ],
    connections: [
      { from: 'START', to: 'search' },
      { from: 'search', to: 'organize' },
      { from: 'organize', to: 'write' },
      { from: 'write', to: 'checkText' },
      { from: 'checkText', to: 'generateImage', condition: 'passed' },
      { from: 'checkText', to: 'write', condition: '!passed && retryCount < 3' },
      { from: 'generateImage', to: 'checkImage' },
      { from: 'checkImage', to: 'postProcess', condition: 'passed' },
      { from: 'checkImage', to: 'generateImage', condition: '!passed && retryCount < 2' },
      { from: 'postProcess', to: 'END' },
    ],
    enableQualityCheck: true,
    maxRetries: 3,
    enableCheckpoint: true,
  },
};

/**
 * 批量处理工作流示例
 */
const BATCH_PROCESSING_EXAMPLE = {
  input: '创建一个批量文本处理工作流，支持批量翻译、质检、导出',
  output: {
    type: 'batch-text-processor',
    name: '批量文本处理工作流',
    description: '批量处理多个文本文件，支持翻译、质量检查和结果导出',
    category: 'automation',
    tags: ['batch-processing', 'automation', 'translation'],
    inputParams: [
      {
        name: 'inputFiles',
        type: 'array',
        required: true,
        description: '输入文件路径列表',
        examples: [['./input/file1.txt', './input/file2.txt']],
      },
      {
        name: 'operation',
        type: 'string',
        required: true,
        description: '处理操作类型',
        examples: ['translate', 'summarize', 'proofread'],
      },
      {
        name: 'targetLanguage',
        type: 'string',
        required: false,
        description: '目标语言（翻译时需要）',
        examples: ['zh', 'en', 'ja'],
      },
      {
        name: 'outputDir',
        type: 'string',
        required: false,
        description: '输出目录',
        defaultValue: './output',
      },
      {
        name: 'parallelism',
        type: 'number',
        required: false,
        description: '并发处理数量',
        defaultValue: 3,
      },
    ],
    outputFields: ['processedFiles', 'failedFiles', 'statistics'],
    nodes: [
      {
        name: 'loadFiles',
        displayName: '加载文件',
        description: '加载输入文件内容',
        nodeType: 'transform',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: [],
      },
      {
        name: 'processBatch',
        displayName: '批量处理',
        description: '批量处理文本内容',
        nodeType: 'llm',
        timeout: 300000,
        useLLM: true,
        llmSystemPrompt: '你是一位文本处理专家。请按照要求处理文本内容。',
        enableQualityCheck: false,
        dependencies: ['loadFiles'],
      },
      {
        name: 'qualityCheck',
        displayName: '质量检查',
        description: '检查处理结果质量',
        nodeType: 'quality_check',
        timeout: 120000,
        useLLM: true,
        llmSystemPrompt: '你是一位质量检查专家。',
        enableQualityCheck: true,
        qualityCheckPrompt: '检查批量处理结果的质量和一致性。',
        dependencies: ['processBatch'],
      },
      {
        name: 'exportResults',
        displayName: '导出结果',
        description: '导出处理结果',
        nodeType: 'transform',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: ['qualityCheck'],
      },
    ],
    connections: [
      { from: 'START', to: 'loadFiles' },
      { from: 'loadFiles', to: 'processBatch' },
      { from: 'processBatch', to: 'qualityCheck' },
      { from: 'qualityCheck', to: 'exportResults', condition: 'passed' },
      { from: 'qualityCheck', to: 'processBatch', condition: '!passed && retryCount < 2' },
      { from: 'exportResults', to: 'END' },
    ],
    enableQualityCheck: true,
    maxRetries: 2,
    enableCheckpoint: true,
  },
};

// ============================================================================
// 主 Prompt 模板
// ============================================================================

/**
 * 构建工作流理解 Prompt
 *
 * @param context - 项目上下文信息
 * @param existingWorkflows - 现有工作流列表
 * @returns 完整的 Prompt
 */
export function buildWorkflowUnderstandingPrompt(
  context: {
    codePatterns?: string;
    bestPractices?: string;
    commonNodes?: string;
  },
  existingWorkflows: Array<{ type: string; name: string; description: string }> = []
): string {
  const { codePatterns = '', bestPractices = '', commonNodes = '' } = context;

  return `# Workflow Requirement Understanding Task

你是一位专业的 LangGraph 工作流架构专家。你的任务是将用户的自然语言描述转换为结构化的工作流需求定义。

## Project Context

这是一个基于 LangGraph 的 AI 驱动工作流脚手架系统。项目使用 TypeScript 实现，支持多种工作流类型（内容创作、翻译、分析等）。

### 技术栈
- **Framework**: LangGraph (@langchain/langgraph)
- **Language**: TypeScript (ES Modules)
- **LLM Service**: 支持多种 LLM 实现（DeepSeek API, Claude CLI）
- **Database**: PostgreSQL/SQLite/Memory (可切换)
- **Architecture**: DDD 分层架构（Domain, Application, Infrastructure, Presentation）

### 项目结构
\`\`\`
src/
├── domain/
│   ├── entities/              # 实体（Task, Result, QualityCheck）
│   ├── repositories/          # 仓储接口
│   └── workflow/
│       ├── nodes/            # 节点基类（BaseNode）
│       ├── State.ts          # 状态定义
│       └── WorkflowRegistry.ts  # 工作流注册表
├── application/               # 应用层
│   └── workflow/
│       └── SyncExecutor.ts   # 同步执行器
├── infrastructure/            # 基础设施层
│   ├── database/             # 数据库实现
│   ├── queue/                # 任务队列
│   └── logging/              # 日志系统
├── services/                  # 服务层
│   └── llm/                  # LLM 服务
└── presentation/              # 表现层
    └── cli/                  # CLI 命令
\`\`\`

${codePatterns ? `### 现有代码模式\n\n${codePatterns}\n\n` : ''}

${bestPractices ? `### 最佳实践\n\n${bestPractices}\n\n` : ''}

${commonNodes ? `### 常用节点类型\n\n${commonNodes}\n\n` : ''}

### 现有工作流列表

${existingWorkflows.length > 0 ? existingWorkflows.map(w => `- **${w.type}**: ${w.name} - ${w.description}`).join('\n') : '暂无现有工作流'}

---

## LangGraph 工作流架构说明

### 工作流组成
1. **State（状态）**: 工作流的数据流，定义输入参数和中间结果
2. **Nodes（节点）**: 处理逻辑单元，每个节点接收 State 并返回更新
3. **Edges（边）**: 连接节点，定义执行流程
4. **ConditionalEdges（条件边）**: 基于状态路由到不同节点

### 节点类型
- **llm**: 使用 LLM 进行推理或生成
- **api**: 调用外部 API（搜索、图片生成等）
- **transform**: 数据转换和处理
- **quality_check**: 质量检查和评分
- **custom**: 自定义逻辑

### 质量检查机制
- 支持双层质检：硬规则检查 + LLM 评估
- 质检失败可重试
- 支持最大重试次数配置

### 检查点机制
- 在关键节点保存状态快照
- 支持断点续传和失败恢复

---

## Few-Shot Learning Examples

### Example 1: 文本摘要工作流

**输入描述**: ${TEXT_SUMMARY_EXAMPLE.input}

**输出结构**:
\`\`\`json
${JSON.stringify(TEXT_SUMMARY_EXAMPLE.output, null, 2)}
\`\`\`

---

### Example 2: 翻译工作流

**输入描述**: ${TRANSLATION_EXAMPLE.input}

**输出结构**:
\`\`\`json
${JSON.stringify(TRANSLATION_EXAMPLE.output, null, 2)}
\`\`\`

---

### Example 3: 内容创作工作流

**输入描述**: ${CONTENT_CREATION_EXAMPLE.input}

**输出结构**:
\`\`\`json
${JSON.stringify(CONTENT_CREATION_EXAMPLE.output, null, 2)}
\`\`\`

---

### Example 4: 批量处理工作流

**输入描述**: ${BATCH_PROCESSING_EXAMPLE.input}

**输出结构**:
\`\`\`json
${JSON.stringify(BATCH_PROCESSING_EXAMPLE.output, null, 2)}
\`\`\`

---

## Output Schema Definition

请严格按照以下 JSON Schema 输出结果：

\`\`\`json
{
  "type": "kebab-case-workflow-type",
  "name": "工作流显示名称",
  "description": "工作流详细描述（10-500字）",
  "category": "content|translation|analysis|automation|other",
  "tags": ["tag1", "tag2"],
  "inputParams": [
    {
      "name": "paramName",
      "type": "string|number|boolean|array|object",
      "required": true|false,
      "description": "参数描述",
      "defaultValue": "any (optional)",
      "examples": ["example1", "example2"]
    }
  ],
  "outputFields": ["field1", "field2"],
  "nodes": [
    {
      "name": "nodeName (camelCase)",
      "displayName": "节点显示名称",
      "description": "节点功能描述",
      "nodeType": "llm|api|transform|quality_check|custom",
      "timeout": 60000,
      "useLLM": true|false,
      "llmSystemPrompt": "LLM 系统提示词（useLLM=true 时必需）",
      "enableQualityCheck": true|false,
      "qualityCheckPrompt": "质检提示词（enableQualityCheck=true 时必需）",
      "dependencies": ["depNode1", "depNode2"]
    }
  ],
  "connections": [
    {
      "from": "START|nodeName",
      "to": "nodeName|END",
      "condition": "条件表达式（可选）"
    }
  ],
  "enableQualityCheck": true,
  "maxRetries": 3,
  "enableCheckpoint": true
}
\`\`\`

---

## Important Notes

1. **命名规范**:
   - \`type\`: kebab-case (e.g., "content-creator", "text-summarizer")
   - \`name\` (nodes): camelCase (e.g., "searchNode", "translate")
   - 所有名称必须清晰、描述性强

2. **节点设计**:
   - 每个节点应该有单一、明确的职责
   - LLM 节点必须提供系统提示词
   - 质检节点必须提供质检提示词
   - 合理设置超时时间（考虑 LLM 调用耗时）

3. **连接关系**:
   - 必须有起始连接（from: "START"）
   - 必须有结束连接（to: "END"）
   - 避免孤立节点
   - 使用条件表达式处理失败重试

4. **输入参数**:
   - 至少定义一个必需参数
   - 提供清晰的描述和示例
   - 合理设置默认值

5. **输出字段**:
   - 列出所有关键输出
   - 字段名应清晰易懂

6. **质量检查**:
   - 对关键节点启用质检
   - 设置合理的重试次数（通常 2-3 次）
   - 提供清晰的质检提示词

7. **类别标签**:
   - 准确分类工作流
   - 添加相关标签便于检索

---

## Your Task

请根据用户的自然语言描述，按照上述 Schema 输出结构化的工作流需求定义。

**重要**: 只返回纯 JSON，不要有任何其他文字或说明。确保 JSON 格式正确，可以被直接解析。

现在，请用户提供自然语言描述。`;
}

/**
 * 构建优化需求的 Prompt
 *
 * @param originalRequirement - 原始需求
 * @returns 优化 Prompt
 */
export function buildOptimizationPrompt(originalRequirement: string): string {
  return `# Workflow Requirement Optimization

你是一位工作流架构优化专家。请基于最佳实践优化以下工作流需求。

## Original Requirement

\`\`\`json
${originalRequirement}
\`\`\`

## Optimization Guidelines

1. **节点顺序优化**:
   - 确保节点按正确的逻辑顺序排列
   - 避免循环依赖
   - 优化并行执行机会

2. **超时时间优化**:
   - LLM 节点：90-180 秒
   - API 节点：30-60 秒
   - Transform 节点：10-30 秒
   - Quality Check 节点：60-120 秒

3. **重试策略优化**:
   - 关键节点：2-3 次重试
   - 非关键节点：1-2 次重试
   - 避免无限循环

4. **质量检查优化**:
   - 对关键输出启用质检
   - 设置合理的质检阈值
   - 提供可操作的改进建议

5. **连接关系优化**:
   - 简化不必要的条件分支
   - 确保所有路径都能到达 END
   - 优化失败重试逻辑

6. **参数设计优化**:
   - 合理设置必需/可选参数
   - 提供有意义的默认值
   - 添加示例值帮助理解

## Output

请返回优化后的工作流需求（JSON 格式），并简要说明所做的优化。

\`\`\`json
{
  "optimizedRequirement": {...},
  "optimizations": [
    "优化点1",
    "优化点2"
  ]
}
\`\`\``;
}

// ============================================================================
// 导出
// ============================================================================

export {
  TEXT_SUMMARY_EXAMPLE,
  TRANSLATION_EXAMPLE,
  CONTENT_CREATION_EXAMPLE,
  BATCH_PROCESSING_EXAMPLE,
};
