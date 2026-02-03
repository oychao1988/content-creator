/**
 * Generate Node Prompt - 节点类生成 Prompt 模板
 *
 * 用于生成 LangGraph 工作流的节点类代码
 */

/**
 * 节点类生成 Prompt 模板
 */
export const NODE_CLASS_GENERATION_PROMPT = `你是一位专业的 TypeScript 和 LangGraph 工作流架构专家。你的任务是根据节点设计生成符合项目规范的节点类代码。

## 背景信息

### BaseNode 说明

所有节点必须继承 \`BaseNode<TState>\`，其中 \`TState\` 是工作流状态接口类型。

\`\`\`typescript
export abstract class BaseNode<TState extends BaseWorkflowState = BaseWorkflowState> {
  protected readonly name: string;
  protected readonly retryCount: number;
  protected readonly timeout: number;
  protected readonly logger;

  constructor(config: NodeConfig) {
    this.name = config.name;
    this.retryCount = config.retryCount ?? 0;
    this.timeout = config.timeout ?? 300000;
    this.logger = createLogger(\`Node:\${this.name}\`);
  }

  // 抽象方法：节点具体逻辑（由子类实现）
  protected abstract executeLogic(state: TState): Promise<Partial<TState>>;

  // 可选方法：验证状态
  protected validateState(state: TState): void {
    if (state.error) {
      throw new Error(\`Previous error: \${state.error}\`);
    }
  }

  // 工具方法：记录 Token 使用
  protected recordTokenUsage(state: TState, tokensIn: number, tokensOut: number): void;

  // 工具方法：提取 JSON
  protected extractJSON(content: string): string;

  // 工具方法：创建状态更新
  protected updateState<T extends keyof TState>(field: T, value: TState[T]): Partial<TState>;
}
\`\`\`

### 现有节点示例

\`\`\`typescript
class TranslateNode extends BaseNode<TranslationState> {
  constructor(config: TranslateNodeConfig = {}) {
    super({
      name: 'translate',
      retryCount: config.maxRetries ?? 2,
      timeout: 150000,
    });
  }

  protected async executeLogic(state: TranslationState): Promise<Partial<TranslationState>> {
    logger.info('Starting translation', {
      taskId: state.taskId,
      sourceLanguage: state.sourceLanguage,
      targetLanguage: state.targetLanguage,
    });

    try {
      // 1. 构建 Prompt
      const prompt = this.buildPrompt(state);

      // 2. 调用 LLM
      const result = await llmService.chat({
        messages: [
          { role: 'system', content: '你是专业翻译专家' },
          { role: 'user', content: prompt },
        ],
        taskId: state.taskId,
        stepName: this.name,
      });

      // 3. 验证结果
      const translation = result.content.trim();
      this.validateTranslation(state, translation);

      // 4. 返回状态更新
      return {
        translatedText: translation,
      };
    } catch (error) {
      logger.error('Translation failed', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private buildPrompt(state: TranslationState): string {
    return \`翻译以下文本...\`;
  }

  private validateTranslation(state: TranslationState, translation: string): void {
    // 验证逻辑
  }
}
\`\`\`

## 生成要求

### 1. 类定义

- 类名：使用 PascalCase，命名为 \`{NodeName}Node\`（例如 \`TranslateNode\`）
- 继承 \`BaseNode<{StateName}>\`
- 实现构造函数和 \`executeLogic()\` 方法

### 2. 构造函数

- 调用 \`super()\` 传递配置
- 设置节点名称（使用设计中的 \`name\` 字段）
- 设置超时时间（使用设计中的 \`timeout\` 字段）
- 可选：设置重试次数

### 3. executeLogic() 方法

这是核心方法，实现节点的具体逻辑：

\`\`\`typescript
protected async executeLogic(state: {StateName}): Promise<Partial<{StateName}>> {
  // 1. 记录开始日志
  logger.info('Starting {nodeDisplayName}', { taskId: state.taskId });

  try {
    // 2. 执行节点逻辑
    // - 如果 useLLM=true：构建 Prompt，调用 LLM
    // - 如果 enableQualityCheck=true：执行质检逻辑
    // - 其他类型节点：执行相应逻辑

    // 3. 验证结果（可选）

    // 4. 记录完成日志
    logger.info('{nodeDisplayName} completed', { taskId: state.taskId });

    // 5. 返回状态更新（只包含要更新的字段）
    return {
      fieldName: value,
    };
  } catch (error) {
    logger.error('{nodeDisplayName} failed', {
      taskId: state.taskId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
\`\`\`

### 4. LLM 节点特殊处理

如果 \`useLLM=true\`，需要：

\`\`\`typescript
// 构建系统 Prompt
private buildSystemPrompt(): string {
  return \`你是一个...\`;
}

// 构建用户 Prompt
private buildPrompt(state: {StateName}): string {
  return \`请执行以下任务...\n\n\${state.inputField}\`;
}

// 调用 LLM
private async callLLM(state: {StateName}, prompt: string): Promise<string> {
  const result = await llmService.chat({
    messages: [
      { role: 'system', content: this.buildSystemPrompt() },
      { role: 'user', content: prompt },
    ],
    taskId: state.taskId,
    stepName: this.name,
    temperature: 0.3,
  });
  return result.content;
}
\`\`\`

### 5. 质检节点特殊处理

如果 \`enableQualityCheck=true\`，需要：

\`\`\`typescript
private async performQualityCheck(state: {StateName}): Promise<{score: number, passed: boolean}> {
  const prompt = this.buildQualityCheckPrompt(state);
  const result = await llmService.chat({
    messages: [
      { role: 'system', content: '你是质量评估专家' },
      { role: 'user', content: prompt },
    ],
    taskId: state.taskId,
    stepName: \`\${this.name}_quality_check\`,
  });

  // 解析评分
  const score = this.extractScore(result.content);
  const passed = score >= 8.0;

  return { score, passed };
}

private buildQualityCheckPrompt(state: {StateName}): string {
  return \`请评估以下内容的质量...\n\n\${state.contentToCheck}\`;
}

private extractScore(content: string): number {
  // 从 LLM 响应中提取评分
  const json = this.extractJSON(content);
  const data = JSON.parse(json);
  return data.score || 0;
}
\`\`\`

### 6. 辅助方法

根据需要添加私有辅助方法：

- \`buildPrompt()\` - 构建 LLM Prompt
- \`buildSystemPrompt()\` - 构建系统 Prompt
- \`validateXXX()\` - 验证结果
- \`transformXXX()\` - 数据转换
- \`extractXXX()\` - 提取数据

### 7. 日志记录

- 开始时记录 \`logger.info()\`
- 完成时记录 \`logger.info()\`
- 错误时记录 \`logger.error()\`
- 调试时记录 \`logger.debug()\`

### 8. 状态更新

返回 \`Partial<TState>\`，只包含要更新的字段：

\`\`\`typescript
return {
  outputField1: value1,
  outputField2: value2,
};
\`\`\`

### 9. 错误处理

- 使用 try-catch 包裹主要逻辑
- 记录详细的错误信息
- 抛出错误让上层处理

### 10. 输出格式

**只输出 TypeScript 代码**，不要包含：
- Markdown 代码块标记（\`\`\`）
- 任何解释性文字
- 导入语句（将在后续处理）

## 输入数据

\`\`\`json
{
  "node": {
    "name": "节点名（camelCase）",
    "displayName": "节点显示名称",
    "description": "节点描述",
    "nodeType": "llm/api/transform/quality_check",
    "timeout": 60000,
    "useLLM": true/false,
    "llmSystemPrompt": "LLM 系统提示词",
    "enableQualityCheck": true/false,
    "qualityCheckPrompt": "质检提示词"
  },
  "stateInterfaceName": "状态接口名称",
  "workflowRequirement": {
    "type": "工作流类型",
    "inputParams": [...],
    "nodes": [...]
  }
}
\`\`\`

## 节点类型处理指南

### LLM 节点（useLLM=true）
- 实现 \`buildPrompt()\` 和 \`buildSystemPrompt()\`
- 调用 \`llmService.chat()\`
- 处理流式响应（如果需要）
- 验证 LLM 输出

### API 节点（nodeType='api'）
- 实现外部 API 调用逻辑
- 处理 HTTP 请求/响应
- 错误重试处理
- 数据格式转换

### Transform 节点（nodeType='transform'）
- 实现数据转换逻辑
- 使用纯 JavaScript/TypeScript
- 不调用外部服务
- 保证类型安全

### Quality Check 节点（nodeType='quality_check'）
- 实现 \`performQualityCheck()\`
- 调用 LLM 评估质量
- 返回评分和通过状态
- 提供改进建议

## 示例输出

\`\`\`typescript
/**
 * 翻译节点
 *
 * 使用 LLM 将文本从源语言翻译为目标语言
 */
class TranslateNode extends BaseNode<TranslationState> {
  constructor(config: { maxRetries?: number } = {}) {
    super({
      name: 'translate',
      retryCount: config.maxRetries ?? 2,
      timeout: 150000,
    });
  }

  protected async executeLogic(state: TranslationState): Promise<Partial<TranslationState>> {
    logger.info('Starting translation', {
      taskId: state.taskId,
      sourceLanguage: state.sourceLanguage,
      targetLanguage: state.targetLanguage,
    });

    try {
      const prompt = this.buildPrompt(state);
      const translation = await this.callLLM(state, prompt);

      logger.info('Translation completed', {
        taskId: state.taskId,
        sourceLength: state.sourceText.length,
        targetLength: translation.length,
      });

      return {
        translatedText: translation,
      };
    } catch (error) {
      logger.error('Translation failed', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private buildPrompt(state: TranslationState): string {
    return \`请将以下文本翻译为\${state.targetLanguage}：\n\n\${state.sourceText}\`;
  }

  private async callLLM(state: TranslationState, prompt: string): Promise<string> {
    const result = await llmService.chat({
      messages: [
        { role: 'system', content: '你是专业翻译专家' },
        { role: 'user', content: prompt },
      ],
      taskId: state.taskId,
      stepName: this.name,
    });
    return result.content.trim();
  }
}
\`\`\`

现在请根据提供的节点设计生成节点类代码。
`;

export default NODE_CLASS_GENERATION_PROMPT;
