import { Injectable, Logger } from '@nestjs/common';
import { EtlConfigService } from '../config/etl.config';
import axios, { AxiosInstance } from 'axios';

export interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    title?: string;
    username?: string;
    type: string;
  };
  date: number; // Unix timestamp
  text?: string;
  message_thread_id?: number; // Forum topic ID
  reply_to_message?: any;
}

export interface TelegramForumTopic {
  message_thread_id: number;
  name: string;
  icon_color: number;
  icon_custom_emoji_id?: string;
}

export interface TelegramChannel {
  id: number;
  username: string;
  title: string;
  is_forum: boolean;
  type: string;
}

/**
 * Telegram API Service
 *
 * Handles communication with Telegram Bot API to fetch messages
 * from channels and forum topics for indexing
 */
@Injectable()
export class TelegramApiService {
  private readonly logger = new Logger(TelegramApiService.name);
  private readonly httpClient: AxiosInstance;
  private readonly botToken: string;
  private readonly baseUrl: string;

  constructor(private readonly etlConfig: EtlConfigService) {
    this.botToken = this.etlConfig.getTelegramBotToken();
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.logger.log('TelegramApiService initialized');
  }

  /**
   * Get information about a chat (channel/group)
   */
  async getChat(chatId: string | number): Promise<TelegramChannel> {
    try {
      this.logger.debug(`Getting chat info for: ${chatId}`);

      const response = await this.httpClient.get(`/getChat`, {
        params: { chat_id: chatId },
      });

      if (!response.data.ok) {
        throw new Error(`Telegram API error: ${response.data.description}`);
      }

      return response.data.result;
    } catch (error) {
      this.logger.error(
        `Failed to get chat info for ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get forum topics for a forum-type supergroup
   */
  async getForumTopicList(
    chatId: string | number,
  ): Promise<TelegramForumTopic[]> {
    try {
      this.logger.debug(`Getting forum topics for chat: ${chatId}`);

      const response = await this.httpClient.get(`/getForumTopicList`, {
        params: { chat_id: chatId },
      });

      if (!response.data.ok) {
        throw new Error(`Telegram API error: ${response.data.description}`);
      }

      return response.data.result.topics || [];
    } catch (error) {
      this.logger.error(
        `Failed to get forum topics for ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Fetch messages from a chat or forum topic
   */
  async fetchChatMessages(
    chatId: string | number,
    messageThreadId?: number,
  ): Promise<TelegramMessage[]> {
    const allMessages: TelegramMessage[] = [];

    try {
      this.logger.debug(
        `Fetching messages from chat ${chatId}${messageThreadId ? `, topic ${messageThreadId}` : ''}`,
      );

      // Note: Telegram Bot API doesn't have a direct way to get chat history
      // We need to use getUpdates with offset or implement webhook approach
      // For now, we'll implement a basic approach using getChatHistory if available
      // or use a different strategy

      // Telegram Bot API limitation: bots can only see messages sent after they join
      // For full message history, you'd need to use MTProto API (not Bot API)

      this.logger.warn(
        `Telegram Bot API limitation: Can only fetch messages sent after bot joined the chat. 
         For full history, consider using MTProto API or Telegram Client API.`,
      );

      // For demonstration, we'll return empty array
      // In a real implementation, you'd need to:
      // 1. Use MTProto API with user account
      // 2. Or implement webhook to collect messages as they arrive
      // 3. Or use Telegram Client API instead of Bot API

      return allMessages;
    } catch (error) {
      this.logger.error(
        `Failed to fetch messages from chat ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Fetch messages from all topics in a forum channel
   */
  async fetchForumMessages(
    chatId: string | number,
    latestMessageId?: number,
  ): Promise<{ [topicId: number]: TelegramMessage[] }> {
    const messagesByTopic: { [topicId: number]: TelegramMessage[] } = {};

    // Note: latestMessageId is not used in Bot API implementation (placeholder)
    // This would be used in MTProto implementation for pagination
    console.log('latestMessageId (unused in Bot API):', latestMessageId);

    try {
      // First get all forum topics
      const topics = await this.getForumTopicList(chatId);
      this.logger.log(`Found ${topics.length} forum topics in chat ${chatId}`);

      // Fetch messages from each topic
      for (const topic of topics) {
        try {
          const messages = await this.fetchChatMessages(
            chatId,
            topic.message_thread_id,
          );

          messagesByTopic[topic.message_thread_id] = messages;
          this.logger.debug(
            `Fetched ${messages.length} messages from topic "${topic.name}"`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to fetch messages from topic "${topic.name}": ${error.message}`,
          );
        }
      }

      return messagesByTopic;
    } catch (error) {
      this.logger.error(
        `Failed to fetch forum messages from ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Check if the bot has access to the chat and can read messages
   */
  async checkChatAccess(chatId: string | number): Promise<boolean> {
    try {
      const chatInfo = await this.getChat(chatId);
      this.logger.log(
        `Bot has access to chat: ${chatInfo.title} (${chatInfo.type})`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Bot cannot access chat ${chatId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get service statistics
   */
  getApiStats(): any {
    return {
      service: 'Telegram',
      baseUrl: this.baseUrl.replace(this.botToken, '[HIDDEN]'),
      initialized: true,
      note: 'Bot API has limitations for message history. Consider MTProto API for full access.',
    };
  }
}
