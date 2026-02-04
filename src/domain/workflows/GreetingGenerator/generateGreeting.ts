t;
class GenerateGreetingNode extends BaseNode<GreetingGeneratorState> {
  constructor(config: { maxRetries?: number } = {}) {
    super({
      name: 'generateGreeting',
      retryCount: config.maxRetries ?? 1,
      timeout: 90000,
    });
  }

  protected async executeLogic(
    state: GreetingGeneratorState
  ): Promise<Partial<GreetingGeneratorState>> {
    logger.info('Starting greeting generation', {
      taskId: state.taskId,
      name: state.name,
      timeOfDay: state.timeOfDay,
      language: state.language,
    });

    try {
      const prompt = this.buildPrompt(state);
      const greeting = await this.callLLM(state, prompt);

      logger.info('Greeting generation completed', {
        taskId: state.taskId,
        greetingLength: greeting.length,
      });

      return {
        greetingText: greeting,
      };
    } catch (error) {
      logger.error('Greeting generation failed', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private buildPrompt(state: GreetingGeneratorState): string {
    return `请为${state.name}生成一个${this.getTimeOfDayDisplay(state.timeOfDay)}的问候语，使用${this.getLanguageDisplay(state.language)}。`;
  }

  private getTimeOfDayDisplay(timeOfDay: string): string {
    const mapping: Record<string, string> = {
      morning: '早上',
      afternoon: '下午',
      evening: '晚上',
    };
    return mapping[timeOfDay] || '早上';
  }

  private getLanguageDisplay(language: string): string {
    return language === 'en' ? '英文' : '中文';
  }

  private async callLLM(state: GreetingGeneratorState, prompt: string): Promise<string> {
    const result = await llmService.chat({
      messages: [
        {
          role: 'system',
          content:
            '你是一位专业的问候语生成专家。请根据提供的姓名、时段和语言生成亲切自然的问候语。',
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
