/**
 * Generic LLM message interface - provider agnostic
 */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Generic LLM conversation context
 */
export interface LlmConversation {
  messages: LlmMessage[];
  metadata?: Record<string, any>;
}

export interface LlmAdapter {
  /**
   * Generate a text completion based on the provided messages
   */
  generateCompletion(
    conversation: LlmConversation,
    options?: CompletionOptions,
  ): Promise<string>;

  /**
   * Generate a structured response based on the provided messages and response schema
   */
  generateStructuredOutput<T>(
    conversation: LlmConversation,
    responseSchema: object,
    options?: CompletionOptions,
  ): Promise<T>;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}
