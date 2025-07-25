import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Indexer Configuration Service
 *
 * Centralized configuration for the indexer module.
 * Following DEVELOPMENT_RULES.md: All configuration through environment variables.
 */
@Injectable()
export class IndexerConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Unified Messages Collection Configuration
   */
  getUnifiedMessagesCollectionName(): string {
    return this.configService.get<string>(
      'INDEXER_UNIFIED_COLLECTION_NAME',
      'kasparebro',
    );
  }

  getUnifiedMessagesUuidNamespace(): string {
    return this.configService.get<string>(
      'INDEXER_UNIFIED_UUID_NAMESPACE',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    );
  }

  /**
   * Telegram History Collection Configuration
   */
  getTelegramHistoryCollectionName(): string {
    return this.configService.get<string>(
      'INDEXER_TELEGRAM_HISTORY_COLLECTION_NAME',
      'telegram_indexing_history',
    );
  }

  getTelegramHistoryUuidNamespace(): string {
    return this.configService.get<string>(
      'INDEXER_TELEGRAM_HISTORY_UUID_NAMESPACE',
      '550e8400-e29b-41d4-a716-446655440000',
    );
  }

  /**
   * Vector Configuration
   */
  getVectorDimensions(): number {
    return this.configService.get<number>('INDEXER_VECTOR_DIMENSIONS', 384);
  }

  getVectorDistance(): string {
    return this.configService.get<string>('INDEXER_VECTOR_DISTANCE', 'Cosine');
  }

  /**
   * Processing Configuration
   */
  getDefaultBatchSize(): number {
    return this.configService.get<number>('INDEXER_DEFAULT_BATCH_SIZE', 100);
  }

  getDefaultProcessingDelayMs(): number {
    return this.configService.get<number>(
      'INDEXER_DEFAULT_PROCESSING_DELAY_MS',
      1000,
    );
  }

  getMaxRetries(): number {
    return this.configService.get<number>('INDEXER_MAX_RETRIES', 3);
  }

  /**
   * Telegram-specific Configuration
   */
  getTelegramMaxConsecutiveFailures(): number {
    return this.configService.get<number>(
      'INDEXER_TELEGRAM_MAX_CONSECUTIVE_FAILURES',
      5,
    );
  }

  getTelegramScheduleCron(): string {
    return this.configService.get<string>(
      'INDEXER_TELEGRAM_SCHEDULE_CRON',
      '0 0 20 * * *',
    );
  }

  /**
   * Twitter-specific Configuration
   */
  getTwitterMaxConsecutiveFailures(): number {
    return this.configService.get<number>(
      'INDEXER_TWITTER_MAX_CONSECUTIVE_FAILURES',
      5,
    );
  }

  getTwitterScheduleCron(): string {
    return this.configService.get<string>(
      'INDEXER_TWITTER_SCHEDULE_CRON',
      '0 */15 * * * *',
    );
  }

  getTwitterRequestLimit(): number {
    return this.configService.get<number>('INDEXER_TWITTER_REQUEST_LIMIT', 10);
  }

  /**
   * Qdrant Storage Configuration
   */
  getQdrantUpsertBatchSize(): number {
    return this.configService.get<number>(
      'INDEXER_QDRANT_UPSERT_BATCH_SIZE',
      50,
    );
  }

  /**
   * Twitter History Collection Configuration
   */
  getTwitterHistoryCollectionName(): string {
    return this.configService.get<string>(
      'INDEXER_TWITTER_HISTORY_COLLECTION_NAME',
      'twitter_history',
    );
  }

  getTwitterHistoryUuidNamespace(): string {
    return this.configService.get<string>(
      'INDEXER_TWITTER_HISTORY_UUID_NAMESPACE',
      '550e8400-e29b-41d4-a716-446655440001',
    );
  }
}
