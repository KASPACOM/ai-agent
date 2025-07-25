import { Injectable, Logger } from '@nestjs/common';
import { QdrantClientService } from '../../../database/qdrant/services/qdrant-client.service';
import { QdrantCollectionService } from '../../../database/qdrant/services/qdrant-collection.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import {
  TelegramIndexingHistory,
  TelegramHistoryUpdate,
  TelegramHistoryQueryOptions,
  TelegramHistorySummary,
} from '../models/telegram-history.model';
import { v5 as uuidv5 } from 'uuid';

/**
 * Telegram History Service
 *
 * Manages the telegram_indexing_history collection for tracking channel and topic indexing progress.
 * Similar to AccountRotationService for Twitter, but handles telegram's channel + topic structure.
 *
 * Features:
 * - Track indexing progress per channel and topic
 * - Enable proper pagination and incremental updates
 * - Handle error tracking and circuit breaking
 * - Provide statistics and monitoring capabilities
 */
@Injectable()
export class TelegramHistoryService {
  private readonly logger = new Logger(TelegramHistoryService.name);

  constructor(
    private readonly qdrantClient: QdrantClientService,
    private readonly qdrantCollection: QdrantCollectionService,
    private readonly config: IndexerConfigService, // ✅ Use configuration service
  ) {}

  /**
   * Get or create indexing history for a channel/topic
   */
  async getOrCreateHistory(
    channelName: string,
    channelId: string,
    topicId?: number,
    channelTitle?: string,
    topicTitle?: string,
  ): Promise<TelegramIndexingHistory> {
    const normalizedChannelName = channelName.toLowerCase().replace('@', '');
    const historyId = this.generateHistoryId(normalizedChannelName, topicId);

    try {
      // Try to get existing history
      const existingHistory = await this.getHistory(historyId);
      if (existingHistory) {
        this.logger.debug(
          `Found existing history for ${normalizedChannelName}:${topicId || 'main'}`,
        );
        return existingHistory;
      }

      // Create new history record
      const now = new Date().toISOString();
      const newHistory: TelegramIndexingHistory = {
        id: historyId,
        channelName: normalizedChannelName,
        channelId: channelId,
        channelTitle: channelTitle,
        topicId: topicId,
        topicTitle: topicTitle,
        messagesIndexed: 0,
        latestMessageDate: new Date(0).toISOString(), // Start from epoch
        latestMessageId: 0,
        isComplete: false,
        lastIndexedAt: now,
        indexingErrors: [],
        consecutiveErrors: 0,
        createdAt: now,
        updatedAt: now,
      };

      await this.upsertHistory(newHistory);
      this.logger.log(
        `Created new history record for ${normalizedChannelName}:${topicId || 'main'}`,
      );
      return newHistory;
    } catch (error) {
      this.logger.error(
        `Failed to get/create history for ${normalizedChannelName}:${topicId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Update indexing history after processing messages
   */
  async updateHistory(
    channelName: string,
    topicId: number | undefined,
    updates: TelegramHistoryUpdate,
  ): Promise<void> {
    const normalizedChannelName = channelName.toLowerCase().replace('@', '');
    const historyId = this.generateHistoryId(normalizedChannelName, topicId);

    try {
      const existingHistory = await this.getHistory(historyId);
      if (!existingHistory) {
        this.logger.warn(
          `No history found for ${normalizedChannelName}:${topicId} - cannot update`,
        );
        return;
      }

      const now = new Date().toISOString();
      const updatedHistory: TelegramIndexingHistory = {
        ...existingHistory,
        // Increment message count if provided
        messagesIndexed:
          existingHistory.messagesIndexed + (updates.messagesIndexed || 0),
        // Update latest message info if provided
        latestMessageDate:
          updates.latestMessageDate || existingHistory.latestMessageDate,
        latestMessageId:
          updates.latestMessageId || existingHistory.latestMessageId,
        // Update earliest message info if provided (for historical processing)
        earliestMessageDate:
          updates.earliestMessageDate || existingHistory.earliestMessageDate,
        earliestMessageId:
          updates.earliestMessageId || existingHistory.earliestMessageId,
        // Update completion status
        isComplete: updates.isComplete ?? existingHistory.isComplete,
        // Handle errors
        indexingErrors: this.updateErrors(
          existingHistory.indexingErrors,
          updates.errors,
          updates.clearErrors,
        ),
        consecutiveErrors: this.updateConsecutiveErrors(
          existingHistory.consecutiveErrors,
          updates.errors,
          updates.clearErrors,
        ),
        // Update timestamps
        lastIndexedAt: now,
        updatedAt: now,
      };

      await this.upsertHistory(updatedHistory);
      this.logger.debug(
        `Updated history for ${normalizedChannelName}:${topicId || 'main'}: +${updates.messagesIndexed || 0} messages`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update history for ${normalizedChannelName}:${topicId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get indexing history for a specific channel/topic
   */
  async getHistory(
    historyId: string,
  ): Promise<TelegramIndexingHistory | undefined> {
    try {
      await this.ensureCollectionExists();

      const pointId = this.hashHistoryId(historyId);
      const result = await this.qdrantClient.getPoint(
        this.config.getTelegramHistoryCollectionName(),
        pointId,
      );

      if (result && result.payload) {
        return result.payload as TelegramIndexingHistory;
      }

      return undefined;
    } catch (error) {
      this.logger.error(`Failed to get history ${historyId}: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Query indexing history with filters
   */
  async queryHistory(
    options: TelegramHistoryQueryOptions = {},
  ): Promise<TelegramIndexingHistory[]> {
    try {
      await this.ensureCollectionExists();

      // Build filter conditions
      const filterConditions: any[] = [];

      if (options.channelName) {
        filterConditions.push({
          key: 'channelName',
          match: { value: options.channelName.toLowerCase().replace('@', '') },
        });
      }

      if (options.topicId !== undefined) {
        if (options.topicId === null) {
          // Query for main channel messages (no topic)
          filterConditions.push({
            key: 'topicId',
            match: { value: null },
          });
        } else {
          filterConditions.push({
            key: 'topicId',
            match: { value: options.topicId },
          });
        }
      }

      if (options.isComplete !== undefined) {
        filterConditions.push({
          key: 'isComplete',
          match: { value: options.isComplete },
        });
      }

      if (options.hasErrors !== undefined) {
        filterConditions.push({
          key: 'consecutiveErrors',
          range: options.hasErrors ? { gt: 0 } : { eq: 0 },
        });
      }

      // Execute query
      const searchResult = await this.qdrantClient.searchPoints(
        this.config.getTelegramHistoryCollectionName(),
        {
          vector: new Array(1).fill(0), // Dummy vector for filter-only search
          limit: options.limit || 100,
          offset: options.offset || 0,
          filter:
            filterConditions.length > 0
              ? { must: filterConditions }
              : undefined,
        },
      );

      const histories = searchResult.points.map(
        (point) => point.payload as TelegramIndexingHistory,
      );

      // Apply sorting if requested
      if (options.orderBy) {
        histories.sort((a, b) => {
          const aValue = a[options.orderBy!];
          const bValue = b[options.orderBy!];
          const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          return options.orderDirection === 'desc' ? -comparison : comparison;
        });
      }

      return histories;
    } catch (error) {
      this.logger.error(`Failed to query history: ${error.message}`);
      return [];
    }
  }

  /**
   * Get summary statistics for telegram indexing
   */
  async getHistorySummary(): Promise<TelegramHistorySummary> {
    try {
      const allHistories = await this.queryHistory();

      const channels = new Set(allHistories.map((h) => h.channelName));
      const topics = allHistories.filter((h) => h.topicId !== undefined);
      const completedChannels = new Set(
        allHistories
          .filter((h) => h.isComplete && h.topicId === undefined)
          .map((h) => h.channelName),
      );
      const completedTopics = topics.filter((h) => h.isComplete);
      const channelsWithErrors = new Set(
        allHistories
          .filter((h) => h.consecutiveErrors > 0)
          .map((h) => h.channelName),
      );
      const topicsWithErrors = topics.filter((h) => h.consecutiveErrors > 0);

      const summary: TelegramHistorySummary = {
        totalChannels: channels.size,
        totalTopics: topics.length,
        totalMessages: allHistories.reduce(
          (sum, h) => sum + h.messagesIndexed,
          0,
        ),
        completedChannels: completedChannels.size,
        completedTopics: completedTopics.length,
        channelsWithErrors: channelsWithErrors.size,
        topicsWithErrors: topicsWithErrors.length,
        lastUpdate:
          allHistories.length > 0
            ? Math.max(
                ...allHistories.map((h) => new Date(h.updatedAt).getTime()),
              ).toString()
            : new Date().toISOString(),
      };

      return summary;
    } catch (error) {
      this.logger.error(`Failed to get history summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a channel/topic needs indexing (not complete or has new messages)
   */
  async needsIndexing(channelName: string, topicId?: number): Promise<boolean> {
    const historyId = this.generateHistoryId(
      channelName.toLowerCase().replace('@', ''),
      topicId,
    );
    const history = await this.getHistory(historyId);

    if (!history) {
      return true; // No history = needs initial indexing
    }

    if (!history.isComplete) {
      return true; // Not complete = needs more indexing
    }

    if (history.consecutiveErrors > 0) {
      return false; // Has errors = skip for now (circuit breaker)
    }

    // Could add more sophisticated logic here:
    // - Check if it's been too long since last update
    // - Check if external API indicates new messages
    // For now, complete topics don't need re-indexing

    return false;
  }

  /**
   * Generate consistent history ID for channel/topic combination
   */
  private generateHistoryId(channelName: string, topicId?: number): string {
    const normalized = channelName.toLowerCase().replace('@', '');
    return `${normalized}_${topicId || 'main'}`;
  }

  /**
   * Hash history ID for Qdrant point ID
   */
  private hashHistoryId(historyId: string): string {
    return uuidv5(historyId, this.config.getTelegramHistoryUuidNamespace());
  }

  /**
   * Update error array with new errors
   */
  private updateErrors(
    existingErrors: string[],
    newErrors?: string[],
    clearErrors?: boolean,
  ): string[] {
    if (clearErrors) {
      return newErrors || [];
    }

    if (newErrors && newErrors.length > 0) {
      const combined = [...existingErrors, ...newErrors];
      // Keep only last 10 errors to prevent unbounded growth
      return combined.slice(-10);
    }

    return existingErrors;
  }

  /**
   * Update consecutive error count
   */
  private updateConsecutiveErrors(
    existingCount: number,
    newErrors?: string[],
    clearErrors?: boolean,
  ): number {
    if (clearErrors) {
      return 0;
    }

    if (newErrors && newErrors.length > 0) {
      return existingCount + newErrors.length;
    }

    // If no new errors were added, reset consecutive count
    return 0;
  }

  /**
   * Upsert history record in Qdrant
   */
  private async upsertHistory(history: TelegramIndexingHistory): Promise<void> {
    await this.ensureCollectionExists();

    const pointId = this.hashHistoryId(history.id);
    const point = {
      id: pointId,
      vector: [1], // Simple 1D vector for this collection
      payload: history,
    };

    await this.qdrantClient.upsertPoints(
      this.config.getTelegramHistoryCollectionName(),
      [point],
    );
  }

  /**
   * Ensure the telegram indexing history collection exists
   */
  private async ensureCollectionExists(): Promise<void> {
    try {
      const collectionName = this.config.getTelegramHistoryCollectionName();
      const exists = await this.qdrantClient.collectionExists(collectionName);

      if (!exists) {
        this.logger.log(
          `Creating telegram history collection: ${collectionName}`,
        );
        // ✅ Create collection with minimal vector for metadata storage
        await this.qdrantClient.createCollection(collectionName, {
          vectors: {
            size: 1, // Simple 1D vector for metadata-only collection
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });
        this.logger.log(
          `✅ Created telegram history collection: ${collectionName}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to ensure collection existence: ${error.message}`,
      );
      throw error;
    }
  }
}
