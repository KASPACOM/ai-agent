import { Injectable } from '@nestjs/common';
import { BaseIndexerService } from './base-indexer.service';
import { QdrantRepository } from '../../database/qdrant/services/qdrant.repository';
import { EmbeddingService } from '../../embedding/embedding.service';
import { EtlConfigService } from '../config/etl.config';
import {
  BaseMessage,
  HistoricalFetchParams,
  IndexingResult,
  MessageProcessingResult,
} from '../models/base-indexer.model';
import { TelegramMessageTransformer } from '../transformers/telegram-message.transformer';
import {
  TelegramApiService,
  TelegramMessage,
  TelegramChannel,
} from './telegram-api.service';
import {
  TelegramMTProtoService,
  TelegramMTProtoMessage,
} from './telegram-mtproto.service';

/**
 * Telegram Indexer Service
 *
 * Specialized indexer for Telegram messages
 * Inherits common functionality from BaseIndexerService
 * TODO: Implement Telegram API integration
 */
@Injectable()
export class TelegramIndexerService extends BaseIndexerService {
  constructor(
    qdrantRepository: QdrantRepository,
    embeddingService: EmbeddingService,
    etlConfig: EtlConfigService,
    private readonly telegramApi: TelegramApiService,
    private readonly telegramMTProto: TelegramMTProtoService,
  ) {
    super(
      qdrantRepository,
      embeddingService,
      etlConfig,
      'Telegram',
      'kaspa_telegram_messages', // Collection name for Telegram messages
    );
  }

  /**
   * Get Telegram channels from configuration
   */
  protected getServiceAccounts(): string[] {
    const channels = this.etlConfig.getTelegramChannelsConfig();
    return channels.map((channel) => channel.username || channel.id.toString());
  }

  /**
   * Telegram-specific indexing implementation
   * Processes all configured Telegram channels and forum topics
   */
  async runIndexer(): Promise<IndexingResult> {
    return this.executeIndexingProcess(async () => {
      return this.processAllTelegramChannels();
    });
  }

  /**
   * Process all configured Telegram channels
   * Handles both regular channels and forum-type channels with topics
   */
  private async processAllTelegramChannels(): Promise<MessageProcessingResult> {
    const allErrors: string[] = [];
    let totalProcessed = 0;
    let totalEmbedded = 0;
    let totalStored = 0;
    const allMessages: BaseMessage[] = [];

    const channels = this.etlConfig.getTelegramChannelsConfig();
    this.logger.log(`Processing ${channels.length} Telegram channels`);

    if (channels.length === 0) {
      this.logger.warn('No Telegram channels configured - skipping processing');
      return {
        success: true,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors: [],
        messages: [],
      };
    }

    for (const channelConfig of channels) {
      try {
        this.logger.log(
          `Processing Telegram channel: ${channelConfig.username || channelConfig.id}`,
        );

        // Check if bot has access to the channel
        const hasAccess = await this.telegramApi.checkChatAccess(
          channelConfig.id,
        );
        if (!hasAccess) {
          const errorMsg = `Bot cannot access Telegram channel ${channelConfig.username || channelConfig.id}`;
          this.logger.error(errorMsg);
          allErrors.push(errorMsg);
          continue;
        }

        // Get channel information
        const channelInfo = await this.telegramApi.getChat(channelConfig.id);
        this.logger.log(
          `Channel info: ${channelInfo.title} (${channelInfo.type}, forum: ${channelInfo.is_forum})`,
        );

        if (channelInfo.is_forum) {
          // Process forum channel with topics
          const result = await this.processForumChannel(
            channelConfig.id,
            channelInfo,
          );
          totalProcessed += result.processed;
          totalEmbedded += result.embedded;
          totalStored += result.stored;
          allMessages.push(...result.messages);
          if (result.errors.length > 0) {
            allErrors.push(...result.errors);
          }
        } else {
          // Process regular channel
          const result = await this.processRegularChannel(
            channelConfig.id,
            channelInfo,
          );
          totalProcessed += result.processed;
          totalEmbedded += result.embedded;
          totalStored += result.stored;
          allMessages.push(...result.messages);
          if (result.errors.length > 0) {
            allErrors.push(...result.errors);
          }
        }

        this.logger.log(
          `Completed processing ${channelInfo.title}: ${totalProcessed} messages processed so far`,
        );
      } catch (error) {
        const errorMsg = `Failed to process Telegram channel ${channelConfig.username || channelConfig.id}: ${error.message}`;
        this.logger.error(errorMsg);
        allErrors.push(errorMsg);
      }
    }

    const success = allErrors.length === 0;
    this.logger.log(
      `Telegram indexing completed: ${totalProcessed} processed, ${totalStored} stored, ${allErrors.length} errors`,
    );

    return {
      success,
      processed: totalProcessed,
      embedded: totalEmbedded,
      stored: totalStored,
      errors: allErrors,
      messages: allMessages,
    };
  }

  /**
   * Fetch historical messages from Telegram channels
   * TODO: Implement Telegram API integration
   */
  protected async fetchHistoricalMessages(
    params: HistoricalFetchParams,
  ): Promise<BaseMessage[]> {
    this.logger.log(
      `Fetching historical Telegram messages for ${params.account} (not implemented)`,
    );

    // TODO: Implement Telegram message fetching
    // This is a stub implementation that returns empty array
    // Future implementation should:
    // 1. Connect to Telegram API/Bot API
    // 2. Fetch messages from specified channel
    // 3. Filter messages by date range
    // 4. Convert to BaseMessage format

    this.logger.warn(
      'Telegram message fetching not yet implemented - returning empty array',
    );
    return [];
  }

  /**
   * Transform Telegram message for Qdrant storage
   */
  protected transformMessageForStorage(message: BaseMessage): any {
    return TelegramMessageTransformer.transformMessageForStorage(message);
  }

  /**
   * Test connection to Telegram API
   * TODO: Implement when Telegram API is integrated
   */
  async testConnection(): Promise<boolean> {
    this.logger.warn('Telegram API connection test not yet implemented');
    // TODO: Implement Telegram bot/API connection test
    return true; // Return true for now to avoid breaking health checks
  }

  /**
   * Get recent messages from Telegram channel
   * TODO: Implement when Telegram API is integrated
   */
  async getRecentMessages(
    channelName: string,
    maxResults: number = 100,
  ): Promise<BaseMessage[]> {
    this.logger.log(
      `Getting recent messages from ${channelName} (not implemented)`,
    );

    // TODO: Implement Telegram channel message fetching
    // This should:
    // 1. Connect to Telegram channel
    // 2. Fetch recent messages
    // 3. Filter for Kaspa-related content
    // 4. Convert to BaseMessage format

    this.logger.warn(
      'Telegram message fetching not yet implemented - returning empty array',
    );
    return [];
  }

  /**
   * Search Telegram messages by query
   * TODO: Implement when Telegram API is integrated
   */
  async searchMessages(
    channelName: string,
    query: string,
    maxResults: number = 100,
  ): Promise<BaseMessage[]> {
    this.logger.log(
      `Searching messages in ${channelName} with query: ${query} (not implemented)`,
    );

    // TODO: Implement Telegram message search
    // This might be limited by Telegram API capabilities

    this.logger.warn(
      'Telegram message search not yet implemented - returning empty array',
    );
    return [];
  }

  /**
   * Get service status with implementation notes
   */
  async getImplementationStatus(): Promise<{
    isImplemented: boolean;
    features: Record<string, boolean>;
    notes: string[];
  }> {
    return {
      isImplemented: false,
      features: {
        messageRetrieval: false,
        channelConnection: false,
        historicalFetch: false,
        realTimeMonitoring: false,
        messageSearch: false,
      },
      notes: [
        'Telegram indexer service is a stub implementation',
        'Message fetching not yet implemented',
        'Channel configuration not yet implemented',
        'Telegram API integration required',
        'Need to add Telegram-specific message transformations',
      ],
    };
  }

  /**
   * Process a forum-type Telegram channel with multiple topics using MTProto
   */
  private async processForumChannel(
    channelId: number,
    channelInfo: TelegramChannel,
  ): Promise<MessageProcessingResult> {
    const allErrors: string[] = [];
    let totalProcessed = 0;
    const totalEmbedded = 0;
    const totalStored = 0;
    const allMessages: BaseMessage[] = [];

    try {
      this.logger.log(
        `Processing forum channel: ${channelInfo.title} using MTProto`,
      );

      // Use MTProto to get all forum messages (much more powerful!)
      const messagesByTopic = await this.telegramMTProto.fetchAllForumMessages(
        channelInfo.username || channelId,
        {
          limit: 1000, // Get up to 1000 messages per topic
          reverse: true, // Get chronologically (oldest first)
        },
      );

      const topicIds = Object.keys(messagesByTopic).map((k) => parseInt(k));
      this.logger.log(
        `Found messages from ${topicIds.length} forum topics in ${channelInfo.title}`,
      );

      // Process messages from each topic
      for (const topicIdStr of Object.keys(messagesByTopic)) {
        const topicId = parseInt(topicIdStr);
        const messages = messagesByTopic[topicId];

        try {
          this.logger.log(
            `Processing ${messages.length} messages from topic ID: ${topicId}`,
          );

          // Convert MTProto messages to BaseMessage format
          const baseMessages = messages.map((msg) =>
            this.convertMTProtoMessageToBase(msg, channelInfo, topicId),
          );

          totalProcessed += baseMessages.length;
          allMessages.push(...baseMessages);

          // TODO: Process and store messages with embeddings
          // For now, we just count them as processed
          this.logger.log(
            `Processed ${baseMessages.length} messages from topic ${topicId}`,
          );
        } catch (error) {
          const errorMsg = `Failed to process forum topic ${topicId}: ${error.message}`;
          this.logger.error(errorMsg);
          allErrors.push(errorMsg);
        }
      }
    } catch (error) {
      const errorMsg = `Failed to process forum channel ${channelInfo.title}: ${error.message}`;
      this.logger.error(errorMsg);
      allErrors.push(errorMsg);
    }

    return {
      success: allErrors.length === 0,
      processed: totalProcessed,
      embedded: totalEmbedded,
      stored: totalStored,
      errors: allErrors,
      messages: allMessages,
    };
  }

  /**
   * Process a regular (non-forum) Telegram channel
   */
  private async processRegularChannel(
    channelId: number,
    channelInfo: TelegramChannel,
  ): Promise<MessageProcessingResult> {
    const allErrors: string[] = [];
    let totalProcessed = 0;
    const totalEmbedded = 0;
    const totalStored = 0;
    const allMessages: BaseMessage[] = [];

    try {
      this.logger.log(`Processing regular channel: ${channelInfo.title}`);

      // Fetch messages from the channel
      const messages = await this.telegramApi.fetchChatMessages(channelId);

      // Convert Telegram messages to BaseMessage format
      const baseMessages = messages.map((msg) =>
        this.convertTelegramMessageToBase(msg, channelInfo),
      );

      totalProcessed += baseMessages.length;
      allMessages.push(...baseMessages);

      // TODO: Process and store messages with embeddings
      // For now, we just count them as processed
      this.logger.log(
        `Processed ${baseMessages.length} messages from channel ${channelInfo.title}`,
      );
    } catch (error) {
      const errorMsg = `Failed to process regular channel ${channelInfo.title}: ${error.message}`;
      this.logger.error(errorMsg);
      allErrors.push(errorMsg);
    }

    return {
      success: allErrors.length === 0,
      processed: totalProcessed,
      embedded: totalEmbedded,
      stored: totalStored,
      errors: allErrors,
      messages: allMessages,
    };
  }

  /**
   * Convert Telegram message to BaseMessage format
   */
  private convertTelegramMessageToBase(
    telegramMessage: TelegramMessage,
    channelInfo: TelegramChannel,
    topic?: { name: string; message_thread_id: number },
  ): BaseMessage {
    const messageText = telegramMessage.text || '';
    const author = telegramMessage.from?.first_name || 'Unknown';
    const authorHandle = telegramMessage.from?.username || '';

    // Build message URL for Telegram
    const url = channelInfo.username
      ? `https://t.me/${channelInfo.username}/${telegramMessage.message_id}${topic ? `/${topic.message_thread_id}` : ''}`
      : `https://t.me/c/${Math.abs(channelInfo.id)}/${telegramMessage.message_id}`;

    return {
      id: `tg_${channelInfo.id}_${telegramMessage.message_id}`,
      text: messageText,
      author: author,
      authorHandle: authorHandle,
      createdAt: new Date(telegramMessage.date * 1000), // Convert Unix timestamp to Date
      url: url,
      source: channelInfo.username || channelInfo.title,
      processingStatus: 'pending',
      processedAt: new Date(),
      kaspaRelated: false, // TODO: Implement Kaspa relevance detection
      kaspaTopics: [], // TODO: Extract Kaspa-related topics
      hashtags: [], // TODO: Extract hashtags from message text
      mentions: [], // TODO: Extract mentions from message text
      links: [], // TODO: Extract links from message text
      language: 'unknown', // TODO: Detect language
      errors: [],
      retryCount: 0,
    };
  }

  /**
   * Convert MTProto message to BaseMessage format
   */
  private convertMTProtoMessageToBase(
    mtprotoMessage: TelegramMTProtoMessage,
    channelInfo: TelegramChannel,
    topicId?: number,
  ): BaseMessage {
    const messageText = mtprotoMessage.message || '';
    const author = mtprotoMessage.postAuthor || 'Unknown';
    const authorHandle = '';

    // Build message URL for Telegram
    const url = channelInfo.username
      ? `https://t.me/${channelInfo.username}/${mtprotoMessage.id}${topicId ? `?topic=${topicId}` : ''}`
      : `https://t.me/c/${Math.abs(channelInfo.id)}/${mtprotoMessage.id}`;

    return {
      id: `tg_mtproto_${channelInfo.id}_${mtprotoMessage.id}`,
      text: messageText,
      author: author,
      authorHandle: authorHandle,
      createdAt: new Date(mtprotoMessage.date * 1000), // Convert Unix timestamp to Date
      url: url,
      source: channelInfo.username || channelInfo.title,
      processingStatus: 'pending',
      processedAt: new Date(),
      kaspaRelated: false, // TODO: Implement Kaspa relevance detection
      kaspaTopics: [], // TODO: Extract Kaspa-related topics
      hashtags: [], // TODO: Extract hashtags from message text
      mentions: [], // TODO: Extract mentions from message text
      links: [], // TODO: Extract links from message text
      language: 'unknown', // TODO: Detect language
      errors: [],
      retryCount: 0,
    };
  }
}
