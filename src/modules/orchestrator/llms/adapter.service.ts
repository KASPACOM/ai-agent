import { Message } from '../models/message.model';

export interface LlmAdapter {
  /** 
   * Generate a text completion based on the provided messages
   */
  generateCompletion(messages: Message[], options?: CompletionOptions): Promise<string>;
  
  /**
   * Generate a structured response based on the provided messages and response schema
   */
  generateStructuredOutput<T>(
    messages: Message[], 
    responseSchema: object, 
    options?: CompletionOptions
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