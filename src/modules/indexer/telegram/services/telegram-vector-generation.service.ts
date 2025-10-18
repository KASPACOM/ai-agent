import { Injectable, Logger } from '@nestjs/common';
import { TelegramRepository } from '../../../database/mongodb/repositories/telegram.repository';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { TelegramMasterDocumentTransformer } from '../transformers/telegram-master-document.transformer';
import { AppConfigService } from '../../../core/modules/config/app-config.service';

/**
 * Vector Generation Result
 */
export interface VectorGenerationResult {
  processed: number;
  stored: number;
  errors: string[];
  unprocessedRemaining: number;
}

/**
 * Telegram Vector Generation Service
 *
 * Generates vectors for messages stored in MongoDB and saves them to Qdrant.
 * Following DEVELOPMENT_RULES.md: Separation of concerns - data collection vs vector generation.
 *
 * Process:
 * 1. Query MongoDB for unprocessed messages (vectorGeneratedAt is null)
 * 2. Transform raw messages to MasterDocument format
 * 3. Generate embeddings and store in Qdrant
 * 4. Mark messages as processed in MongoDB
 */
@Injectable()
export class TelegramVectorGenerationService {
  private readonly logger = new Logger(TelegramVectorGenerationService.name);
  private readonly DEFAULT_BATCH_SIZE = 100;

  constructor(
    private readonly telegramRepo: TelegramRepository,
    private readonly unifiedStorage: UnifiedStorageService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Generate vectors for all unprocessed messages
   * Processes in batches until all messages are processed or batch size is reached
   */
  async generateVectors(
    batchSize: number = this.DEFAULT_BATCH_SIZE,
  ): Promise<VectorGenerationResult> {
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalStored = 0;
    const errors: string[] = [];

    try {
      this.logger.log('Starting vector generation for Telegram messages');

      // Get unprocessed messages from MongoDB
      const unprocessedMessages =
        await this.telegramRepo.getUnprocessed(batchSize);

      if (unprocessedMessages.length === 0) {
        this.logger.log('No unprocessed messages found');
        return {
          processed: 0,
          stored: 0,
          errors: [],
          unprocessedRemaining: 0,
        };
      }

      this.logger.log(
        `Found ${unprocessedMessages.length} unprocessed messages. Generating vectors...`,
      );

      // Get channel configs for transformation
      const channelConfigs = this.getChannelConfigs();

      // Transform to MasterDocuments
      const masterDocuments = [];
      const processedMessageIds: Array<{
        channelUsername: string;
        messageId: number;
      }> = [];

      for (const message of unprocessedMessages) {
        try {
          // Find channel config
          const channelConfig = channelConfigs.find(
            (c) =>
              c.username?.toLowerCase() ===
                message.channelUsername.toLowerCase() ||
              c.id === message.channelId,
          );

          if (!channelConfig) {
            const errorMsg = `No channel config found for ${message.channelUsername}`;
            this.logger.warn(errorMsg);
            errors.push(errorMsg);
            continue;
          }

          // Transform to MasterDocument
          const masterDoc =
            TelegramMasterDocumentTransformer.transformTelegramApiResponseToMasterDocument(
              message.payload,
              channelConfig,
              { topicId: message.topicId ?? undefined, topicTitle: undefined },
            );

          masterDocuments.push(masterDoc);
          processedMessageIds.push({
            channelUsername: message.channelUsername,
            messageId: message.messageId,
          });
          totalProcessed++;
        } catch (error) {
          const errorMsg = `Failed to transform message ${message.channelUsername}/${message.messageId}: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Store in Qdrant with embeddings
      if (masterDocuments.length > 0) {
        const storageResult =
          await this.unifiedStorage.storeBatch(masterDocuments);
        totalStored = storageResult.stored;
        errors.push(...storageResult.errors);

        // Mark messages as processed in MongoDB
        if (processedMessageIds.length > 0) {
          await this.telegramRepo.markAsProcessed(processedMessageIds);
        }

        this.logger.log(
          `✅ Generated and stored ${totalStored} message vectors in ${Date.now() - startTime}ms`,
        );
      }

      // Get remaining unprocessed count
      const unprocessedRemaining =
        await this.telegramRepo.getUnprocessedCount();

      return {
        processed: totalProcessed,
        stored: totalStored,
        errors,
        unprocessedRemaining,
      };
    } catch (error) {
      this.logger.error(
        `Vector generation failed: ${error.message}`,
        error.stack,
      );

      return {
        processed: totalProcessed,
        stored: totalStored,
        errors: [...errors, error.message],
        unprocessedRemaining: 0,
      };
    }
  }

  /**
   * Get statistics about vector generation
   */
  async getGenerationStats(): Promise<{
    unprocessedCount: number;
    totalMessages: number;
  }> {
    const unprocessedCount = await this.telegramRepo.getUnprocessedCount();
    return {
      unprocessedCount,
      totalMessages: 0, // Would need separate query to get total
    };
  }

  /**
   * Get channel configs from app config
   */
  private getChannelConfigs(): any[] {
    return this.appConfig.getTelegramChannelsConfig;
  }
}
