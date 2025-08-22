export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmConversation {
  messages: LlmMessage[];
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

export interface LlmAdapter {
  generateCompletion(
    conversation: LlmConversation,
    options?: CompletionOptions,
  ): Promise<string>;
  generateStructuredOutput<T>(
    conversation: LlmConversation,
    responseSchema: object,
    options?: CompletionOptions,
  ): Promise<T>;
}
