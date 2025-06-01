import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import {
  CompletionOptions,
  LlmAdapter,
  LlmConversation,
} from './llm-adapter.interface';
import { AppConfigService } from '../../core/modules/config/app-config.service';

@Injectable()
export class OpenAiAdapter implements LlmAdapter {
  private openai: OpenAI;

  constructor(private readonly configService: AppConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOpenAiApiKey,
    });
  }

  async generateCompletion(
    conversation: LlmConversation,
    options?: CompletionOptions,
  ): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: this.configService.getOpenAiModelName,
      messages: this.transformToOpenAIFormat(conversation),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      frequency_penalty: options?.frequencyPenalty,
      presence_penalty: options?.presencePenalty,
      stop: options?.stopSequences,
    });

    return response.choices[0].message.content || '';
  }

  async generateStructuredOutput<T>(
    conversation: LlmConversation,
    responseSchema: object,
    options?: CompletionOptions,
  ): Promise<T> {
    const response = await this.openai.chat.completions.create({
      model: this.configService.getOpenAiModelName,
      messages: this.transformToOpenAIFormat(conversation),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      frequency_penalty: options?.frequencyPenalty,
      presence_penalty: options?.presencePenalty,
      stop: options?.stopSequences,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content) as T;
  }

  /**
   * Transform generic LlmConversation to OpenAI-specific format
   */
  private transformToOpenAIFormat(
    conversation: LlmConversation,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return conversation.messages.map((msg) => ({
      role: msg.role as any,
      content: msg.content,
    }));
  }
}
