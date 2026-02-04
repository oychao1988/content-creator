class GenerateGreetingNode extends BaseNode<GreetingState> {
  constructor(config: { maxRetries?: number } = {}) {
    super({
      name: 'generateGreeting',
      retryCount: config.maxRetries ?? 1,
      timeout: 90000,
    });
  }

  protected async executeLogic(state: GreetingState): Promise<Partial<GreetingState>> {
    this.logger.info('Starting greeting generation', {
      taskId: state.taskId,
      name: state.name,
      timeOfDay: state.timeOfDay,
    });

    try {
      const prompt = this.buildPrompt(state);
      const greeting = await this.callLLM(state, prompt);

      this.logger.info('Greeting generated successfully', {
        taskId: state.taskId,
        greetingLength: greeting.length,
      });

      return {
        greetingMessage: greeting,
      };
    } catch (error) {
      this.logger.error('Failed to generate greeting', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private buildPrompt(state: GreetingState): string {
    return `请为${state.name}生成一个${state.timeOfDay || 'morning'}的问候语`;
  }

  private async callLLM(state: GreetingState, prompt: string): Promise<string> {
    const result = await llmService.chat({
      messages: [
        {
          role: 'system',
          content:
            '你是一位友好的问候语生成器。根据提供的名字和时间段，生成一句自然、友好的问候语。',
        },
        { role: 'user', content: prompt },
      ],
      taskId: state.taskId,
      stepName: this.name,
      temperature: 0.7,
    });
    return result.content.trim();
  }
}
