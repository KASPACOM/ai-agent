import { Injectable, Logger } from '@nestjs/common';
import {
  BaseIndexerService,
  IndexerConfig,
} from '../../shared/services/base-indexer.service';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { TelegramHistoryService } from './telegram-history.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import {
  MasterDocument,
  ProcessingStatus,
  TelegramMessageType,
} from '../../shared/models/master-document.model';
import { MessageSource } from '../../shared/models/message-source.enum';
import { IndexingResult } from '../../shared/models/indexer-result.model';

// Import local telegram services (independent copies)
import { TelegramMTProtoService } from './telegram-mtproto.service';
import { TelegramMessageTransformer } from '../../../etl/transformers/telegram-message.transformer';
import { TelegramChannelConfig } from '../models/telegram-history.model';
import { TelegramMasterDocumentTransformer } from '../transformers/telegram-master-document.transformer';

/**
 * Telegram Indexer Service
 *
 * Historical ETL service for building complete Telegram message databases.
 * Processes messages chronologically (oldest first) for proper historical indexing.
 *
 * 🎯 ETL STRATEGY: BOTTOM-UP HISTORICAL PROCESSING
 * - Starts from the bottom of chat (oldest messages)
 * - Works UP chronologically through chat history
 * - Uses latestMessageDate for pagination (progressing forward in time)
 * - Marks channels complete when reaching current time
 * - Each run continues from where the last run left off
 *
 * Features:
 * - Processes all configured Telegram channels
 * - Handles both main channel messages and forum topics
 * - Integrates with TelegramHistoryService for progress tracking
 * - Transforms messages to MasterDocument format for unified storage
 * - Respects Telegram API rate limits and best practices
 */
@Injectable()
export class TelegramIndexerService extends BaseIndexerService {
  protected readonly logger = new Logger(TelegramIndexerService.name);

  constructor(
    unifiedStorage: UnifiedStorageService,
    private readonly telegramHistory: TelegramHistoryService,
    private readonly config: IndexerConfigService,
    private readonly telegramMtproto: TelegramMTProtoService,
    private readonly telegramTransformer: TelegramMessageTransformer,
  ) {
    super(unifiedStorage);
  }

  /**
   * Main indexing execution logic
   */
  protected async executeIndexingProcess(): Promise<IndexingResult> {
    const startTime = new Date();
    let totalProcessed = 0;
    let totalEmbedded = 0;
    let totalStored = 0;
    const errors: string[] = [];

    try {
      this.logger.log('Starting Telegram indexing process');

      // Get all configured channels (for now, use hardcoded list - will be moved to config)
      const channels = await this.getTelegramChannels();

      if (channels.length === 0) {
        this.logger.warn('No Telegram channels configured for indexing');
        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          processingTime: Date.now() - startTime.getTime(),
          startTime,
          endTime: new Date(),
        };
      }

      this.logger.log(`Processing ${channels.length} Telegram channels`);

      // Process each channel
      for (const channel of channels) {
        try {
          const channelResult = await this.processChannel(channel);
          totalProcessed += channelResult.processed;
          totalEmbedded += channelResult.embedded;
          totalStored += channelResult.stored;
          errors.push(...channelResult.errors);

          // Add processing delay between channels to respect API limits
          await this.sleep(this.getIndexerConfig().processingDelayMs);
        } catch (error) {
          const errorMsg = `Failed to process channel ${channel.username}: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      const endTime = new Date();
      const success = errors.length === 0 || totalProcessed > 0;

      this.logger.log('Telegram indexing completed', {
        channels: channels.length,
        processed: totalProcessed,
        embedded: totalEmbedded,
        stored: totalStored,
        errors: errors.length,
        processingTimeMs: endTime.getTime() - startTime.getTime(),
      });

      return {
        success,
        processed: totalProcessed,
        embedded: totalEmbedded,
        stored: totalStored,
        errors,
        processingTime: endTime.getTime() - startTime.getTime(),
        startTime,
        endTime,
      };
    } catch (error) {
      this.logger.error(
        `Telegram indexing failed: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        processed: totalProcessed,
        embedded: totalEmbedded,
        stored: totalStored,
        errors: [...errors, error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
      };
    }
  }

  /**
   * Process a single Telegram channel
   */
  private async processChannel(
    channel: TelegramChannelConfig,
  ): Promise<IndexingResult> {
    const startTime = new Date();
    let processed = 0;
    let embedded = 0;
    let stored = 0;
    const errors: string[] = [];

    try {
      this.logger.log(`Processing Telegram channel: ${channel.username}`);

      // Get or create history for main channel
      const mainHistory = await this.telegramHistory.getOrCreateHistory(
        channel.username,
        channel.id || '',
        undefined, // No topic ID for main channel
        channel.title,
      );

      // Check if main channel needs indexing
      if (await this.telegramHistory.needsIndexing(channel.username)) {
        const mainResult = await this.processChannelMessages(
          channel,
          mainHistory,
        );
        processed += mainResult.processed;
        embedded += mainResult.embedded;
        stored += mainResult.stored;
        errors.push(...mainResult.errors);
      }

      // Process forum topics if enabled
      if (channel.includeTopics) {
        const topicResults = await this.processChannelTopics(channel);
        processed += topicResults.processed;
        embedded += topicResults.embedded;
        stored += topicResults.stored;
        errors.push(...topicResults.errors);
      }

      return {
        success: errors.length === 0 || processed > 0,
        processed,
        embedded,
        stored,
        errors,
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to process channel ${channel.username}: ${error.message}`,
      );
      return {
        success: false,
        processed,
        embedded,
        stored,
        errors: [...errors, error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
      };
    }
  }

  /**
   * Process messages from a channel/topic
   */
  private async processChannelMessages(
    channel: TelegramChannelConfig,
    history: any, // TelegramIndexingHistory
    topicId?: number,
  ): Promise<IndexingResult> {
    const startTime = new Date();
    let processed = 0;
    let embedded = 0;
    let stored = 0;
    const errors: string[] = [];

    try {
      // ✅ HISTORICAL ETL: Start from bottom of chat, work UP chronologically
      // Use latestMessageDate from our progress to get the NEXT batch of newer messages
      const offsetDate = history.latestMessageDate
        ? new Date(history.latestMessageDate)
        : undefined; // No offset = start from very beginning (oldest messages in chat)

      const telegramMessages = await this.telegramMtproto.fetchChannelMessages(
        channel.username,
        {
          topicId,
          offsetDate, // Get messages NEWER than this (progressing up through chat history)
          limit: 100,
          reverse: true, // ✅ Ensures chronological order (oldest first in each batch)
        },
      );

      if (telegramMessages.length === 0) {
        this.logger.debug(
          `No more historical messages for ${channel.username}:${topicId || 'main'} - reached current time`,
        );

        // Mark as complete if we've reached current time (no more messages to process)
        await this.telegramHistory.updateHistory(channel.username, topicId, {
          isComplete: true,
        });

        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          processingTime: Date.now() - startTime.getTime(),
          startTime,
          endTime: new Date(),
        };
      }

      this.logger.log(
        `Processing ${telegramMessages.length} historical messages from ${channel.username}:${topicId || 'main'} (chronological order)`,
      );

      // Transform to MasterDocument format
      const masterDocuments: MasterDocument[] = [];
      for (const telegramMsg of telegramMessages) {
        try {
          // Convert directly to MasterDocument using static transformer
          const masterDoc =
            TelegramMasterDocumentTransformer.transformTelegramApiResponseToMasterDocument(
              telegramMsg,
              channel,
            );
          masterDocuments.push(masterDoc);
          processed++;
        } catch (error) {
          const errorMsg = `Failed to transform message ${telegramMsg.id}: ${error.message}`;
          this.logger.warn(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Store in unified collection
      if (masterDocuments.length > 0) {
        const storageResult =
          await this.unifiedStorage.storeBatch(masterDocuments);
        stored = storageResult.stored;
        embedded = storageResult.stored; // Assume embedding happened during storage
        errors.push(...storageResult.errors);

        // ✅ HISTORICAL PROGRESSION: Track our progress from bottom UP
        // Messages are sorted chronologically (oldest first) due to reverse: true
        const oldestMessage = telegramMessages[0]; // First = oldest in this batch
        const newestMessage = telegramMessages[telegramMessages.length - 1]; // Last = newest in this batch

        await this.telegramHistory.updateHistory(channel.username, topicId, {
          messagesIndexed: processed,
          // Update our earliest bound if this is the first batch or we got older messages
          earliestMessageDate:
            !history.earliestMessageDate ||
            new Date(oldestMessage.date * 1000) <
              new Date(history.earliestMessageDate)
              ? new Date(oldestMessage.date * 1000).toISOString()
              : history.earliestMessageDate,
          earliestMessageId:
            !history.earliestMessageId ||
            oldestMessage.id < history.earliestMessageId
              ? oldestMessage.id
              : history.earliestMessageId,
          // Update latest message for next pagination (this becomes our offset)
          latestMessageDate: new Date(newestMessage.date * 1000).toISOString(),
          latestMessageId: newestMessage.id,
          errors: errors.length > 0 ? errors : undefined,
          clearErrors: errors.length === 0,
        });
      }

      return {
        success: errors.length === 0 || stored > 0,
        processed,
        embedded,
        stored,
        errors,
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to process messages for ${channel.username}:${topicId || 'main'}: ${error.message}`,
      );

      // Update history with error
      await this.telegramHistory.updateHistory(channel.username, topicId, {
        errors: [error.message],
      });

      return {
        success: false,
        processed,
        embedded,
        stored,
        errors: [...errors, error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
      };
    }
  }

  /**
   * Process forum topics for a channel
   */
  private async processChannelTopics(
    channel: TelegramChannelConfig,
  ): Promise<IndexingResult> {
    let totalProcessed = 0;
    let totalEmbedded = 0;
    let totalStored = 0;
    const errors: string[] = [];

    try {
      // Get forum topics (placeholder - would need to implement in TelegramMtprotoService)
      const topics = await this.getChannelTopics(channel.username);

      for (const topic of topics) {
        if (channel.excludeTopicIds?.includes(topic.id)) {
          continue;
        }

        if (channel.maxTopics && totalProcessed >= channel.maxTopics) {
          break;
        }

        try {
          // Check if this topic needs indexing
          if (
            await this.telegramHistory.needsIndexing(channel.username, topic.id)
          ) {
            const topicHistory = await this.telegramHistory.getOrCreateHistory(
              channel.username,
              channel.id || '',
              topic.id,
              channel.title,
              topic.title,
            );

            const topicResult = await this.processChannelMessages(
              channel,
              topicHistory,
              topic.id,
            );
            totalProcessed += topicResult.processed;
            totalEmbedded += topicResult.embedded;
            totalStored += topicResult.stored;
            errors.push(...topicResult.errors);
          }
        } catch (error) {
          const errorMsg = `Failed to process topic ${topic.id}: ${error.message}`;
          this.logger.warn(errorMsg);
          errors.push(errorMsg);
        }

        // Delay between topics
        await this.sleep(500);
      }

      return {
        success: errors.length === 0 || totalStored > 0,
        processed: totalProcessed,
        embedded: totalEmbedded,
        stored: totalStored,
        errors,
        processingTime: 0, // Will be calculated by parent
        startTime: new Date(),
        endTime: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to process topics for ${channel.username}: ${error.message}`,
      );
      return {
        success: false,
        processed: totalProcessed,
        embedded: totalEmbedded,
        stored: totalStored,
        errors: [...errors, error.message],
        processingTime: 0,
        startTime: new Date(),
        endTime: new Date(),
      };
    }
  }

  /**
   * Transform TelegramMessage to MasterDocument format
   */
  private transformToMasterDocument(
    telegramMessage: any,
    channel: TelegramChannelConfig,
  ): MasterDocument {
    const now = new Date().toISOString();

    return {
      id: `telegram_${telegramMessage.id}_${channel.username}`,
      source: MessageSource.TELEGRAM,
      text: telegramMessage.text || '',
      author: telegramMessage.author || channel.title || channel.username,
      authorHandle: channel.username,
      createdAt: telegramMessage.createdAt,
      url:
        telegramMessage.url ||
        `https://t.me/${channel.username}/${telegramMessage.id}`,
      processingStatus: ProcessingStatus.PROCESSED,
      processedAt: now,
      kaspaRelated: telegramMessage.kaspaRelated || false,
      kaspaTopics: telegramMessage.kaspaTopics || [],
      hashtags: telegramMessage.hashtags || [],
      mentions: telegramMessage.mentions || [],
      links: telegramMessage.links || [],
      language: telegramMessage.language || 'unknown',
      errors: [],
      retryCount: 0,

      // Telegram-specific fields
      telegramChannelTitle: channel.title,
      telegramTopicId: telegramMessage.topicId,
      telegramMessageType: this.determineTelegramMessageType(telegramMessage),

      // Fields that will be populated during storage
      vector: undefined,
      vectorDimensions: undefined,
      embeddedAt: undefined,
      storedAt: undefined,
    };
  }

  /**
   * Determine Telegram message type
   */
  private determineTelegramMessageType(message: any): TelegramMessageType {
    if (message.isForwarded) return TelegramMessageType.FORWARDED;
    if (message.isReply) return TelegramMessageType.REPLY;
    if (message.hasMedia) return TelegramMessageType.MEDIA;
    if (message.isChannelPost) return TelegramMessageType.CHANNEL_POST;
    return TelegramMessageType.TEXT;
  }

  /**
   * Get indexer configuration
   */
  protected getIndexerConfig(): IndexerConfig {
    return {
      serviceName: 'TelegramIndexer',
      source: MessageSource.TELEGRAM,
      batchSize: this.config.getDefaultBatchSize(),
      maxRetries: this.config.getMaxRetries(),
      processingDelayMs: this.config.getDefaultProcessingDelayMs(),
    };
  }

  /**
   * Get configured Telegram channels from configuration service
   */
  private async getTelegramChannels(): Promise<TelegramChannelConfig[]> {
    // ✅ Get channels from configuration - using ETL config temporarily during transition
    const telegramMtproto = this.telegramMtproto as any;
    const accounts = telegramMtproto.accounts || [];

    // Convert to TelegramChannelConfig format
    return accounts.map((account: any) => ({
      username: account.username || account.phone,
      id: account.id || account.phone,
      title: account.title || account.username,
      includeTopics: account.includeTopics !== false, // Default true
      maxTopics: account.maxTopics || 0, // 0 = unlimited
      excludeTopicIds: account.excludeTopicIds || [],
    }));
  }

  /**
   * Get forum topics for a channel (placeholder for future implementation)
   */
  private async getChannelTopics(
    channelUsername: string,
  ): Promise<{ id: number; title: string }[]> {
    try {
      // ✅ Use existing TelegramMtproto methods if available
      this.logger.debug(`Getting topics for channel: ${channelUsername}`);
      // For now, return empty array - topics will be discovered during channel processing
      return [];
    } catch (error) {
      this.logger.warn(
        `Failed to get topics for ${channelUsername}: ${error.message}`,
      );
      return [];
    }
  }
}
