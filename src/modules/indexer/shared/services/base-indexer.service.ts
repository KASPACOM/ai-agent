import { Injectable, Logger } from '@nestjs/common';
import { UnifiedStorageService } from './unified-storage.service';
import {
  MasterDocument,
  ProcessingStatus,
} from '../models/master-document.model';
import { MessageSource } from '../models/message-source.enum';
import {
  IndexingResult,
  MessageProcessingResult,
  BatchProcessingResult,
  IndexerHealth,
  IndexerStatistics,
} from '../models/indexer-result.model';

/**
 * Indexer Configuration Interface
 */
export interface IndexerConfig {
  serviceName: string;
  source: MessageSource;
  batchSize: number;
  maxRetries: number;
  processingDelayMs: number;
}

/**
 * Base Indexer Service
 *
 * Provides common functionality for all indexer services following DEVELOPMENT_RULES.md.
 * Contains shared logic for processing, batching, error handling, and storage operations.
 *
 * Specific indexer services (Telegram, Twitter) extend this class and implement:
 * - fetchRawData(): Fetch data from external APIs
 * - transformToMasterDocument(): Transform raw data to MasterDocument
 * - getIndexerConfig(): Provide indexer-specific configuration
 */
@Injectable()
export abstract class BaseIndexerService {
  protected readonly logger: Logger;
  protected statistics: IndexerStatistics;

  constructor(protected readonly unifiedStorage: UnifiedStorageService) {
    this.logger = new Logger(this.constructor.name);
    // Note: initializeStatistics() moved to lazy initialization to avoid constructor order issues
  }

  /**
   * Main indexer execution method
   * Template method pattern - defines the overall flow, subclasses implement specific steps
   */
  async runIndexer(): Promise<IndexingResult> {
    const startTime = new Date();
    const config = this.getIndexerConfig();

    this.logger.log(`Starting ${config.serviceName} indexer`);
    this.ensureStatisticsInitialized();
    this.updateStatistics({ lastRun: startTime });

    let result: IndexingResult;

    try {
      result = await this.executeIndexingProcess();
      this.updateStatistics({
        successfulRuns: this.statistics.successfulRuns + 1,
        totalProcessed: this.statistics.totalProcessed + result.processed,
        totalEmbedded: this.statistics.totalEmbedded + result.embedded,
        totalStored: this.statistics.totalStored + result.stored,
      });
    } catch (error) {
      this.logger.error(
        `${config.serviceName} indexer failed: ${error.message}`,
      );

      result = {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors: [error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
      };

      this.updateStatistics({
        failedRuns: this.statistics.failedRuns + 1,
        errorCount: this.statistics.errorCount + 1,
      });
    }

    const endTime = new Date();
    result.endTime = endTime;
    result.processingTime = endTime.getTime() - startTime.getTime();

    this.logger.log(
      `${config.serviceName} indexer completed: ${result.processed} processed, ` +
        `${result.embedded} embedded, ${result.stored} stored, ` +
        `${result.errors.length} errors in ${result.processingTime}ms`,
    );

    return result;
  }

  /**
   * Process documents in batches for efficiency and memory management
   */
  protected async processBatches(
    documents: MasterDocument[],
  ): Promise<BatchProcessingResult> {
    const config = this.getIndexerConfig();
    const batchSize = config.batchSize;
    const startTime = Date.now();

    const result: BatchProcessingResult = {
      success: true,
      totalProcessed: 0,
      totalEmbedded: 0,
      totalStored: 0,
      batchesProcessed: 0,
      errors: [],
      processingTime: 0,
    };

    this.logger.log(
      `Processing ${documents.length} documents in batches of ${batchSize}`,
    );

    // Process documents in batches
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(documents.length / batchSize);

      try {
        this.logger.debug(
          `Processing batch ${batchNumber}/${totalBatches} (${batch.length} documents)`,
        );

        // Store batch in unified collection
        const storageResult = await this.unifiedStorage.storeBatch(batch);

        result.totalProcessed += batch.length;
        result.totalEmbedded += batch.length; // Assuming all documents get embedded
        result.totalStored += storageResult.stored;
        result.batchesProcessed += 1;

        if (!storageResult.success) {
          result.errors.push(...storageResult.errors);
        }

        // Add processing delay to avoid overwhelming external services
        if (config.processingDelayMs > 0 && i + batchSize < documents.length) {
          await this.sleep(config.processingDelayMs);
        }
      } catch (error) {
        this.logger.error(
          `Batch ${batchNumber} processing failed: ${error.message}`,
        );
        result.errors.push(`Batch ${batchNumber} failed: ${error.message}`);
        result.success = false;
      }
    }

    result.processingTime = Date.now() - startTime;
    return result;
  }

  /**
   * Get health status of the indexer service
   */
  async getHealth(): Promise<IndexerHealth> {
    const config = this.getIndexerConfig();
    this.ensureStatisticsInitialized();

    const health: IndexerHealth = {
      isHealthy: true,
      serviceName: config.serviceName,
      collectionName: this.unifiedStorage.getCollectionName(),
      lastRun: this.statistics.lastRun,
      errors: [],
      dependencies: [],
    };

    try {
      // Check unified storage dependency
      const storageHealth = await this.checkStorageHealth();
      health.dependencies.push(storageHealth);

      if (!storageHealth.isHealthy) {
        health.isHealthy = false;
        health.errors.push(
          `Storage dependency unhealthy: ${storageHealth.error}`,
        );
      }

      // Check external API dependency (implemented by subclasses)
      const apiHealth = await this.checkExternalApiHealth();
      if (apiHealth) {
        health.dependencies.push(apiHealth);
        if (!apiHealth.isHealthy) {
          health.isHealthy = false;
          health.errors.push(`External API unhealthy: ${apiHealth.error}`);
        }
      }
    } catch (error) {
      health.isHealthy = false;
      health.errors.push(`Health check failed: ${error.message}`);
    }

    return health;
  }

  /**
   * Get indexer statistics
   */
  getStatistics(): IndexerStatistics {
    this.ensureStatisticsInitialized();
    return { ...this.statistics };
  }

  /**
   * Sleep utility for processing delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Ensure statistics object is initialized (lazy initialization to avoid constructor order issues)
   */
  private ensureStatisticsInitialized(): void {
    if (!this.statistics) {
      const config = this.getIndexerConfig();
      this.statistics = {
        serviceName: config.serviceName,
        totalProcessed: 0,
        totalEmbedded: 0,
        totalStored: 0,
        successfulRuns: 0,
        failedRuns: 0,
        lastRun: undefined,
        averageProcessingTime: 0,
        errorCount: 0,
        uptime: Date.now(),
      };
    }
  }

  /**
   * Update statistics with new values
   */
  private updateStatistics(updates: Partial<IndexerStatistics>): void {
    this.ensureStatisticsInitialized();
    this.statistics = { ...this.statistics, ...updates };
  }

  /**
   * Check storage dependency health
   */
  private async checkStorageHealth(): Promise<{
    name: string;
    isHealthy: boolean;
    error?: string;
    responseTime?: number;
  }> {
    const startTime = Date.now();

    try {
      // Simple health check - try to retrieve one document
      await this.unifiedStorage.getBySource(this.getIndexerConfig().source, 1);

      return {
        name: 'UnifiedStorageService',
        isHealthy: true,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'UnifiedStorageService',
        isHealthy: false,
        error: error.message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  // ==========================================
  // ABSTRACT METHODS (Must be implemented by subclasses)
  // ==========================================

  /**
   * Execute the indexing process specific to the data source
   * Subclasses implement their specific indexing logic here
   */
  protected abstract executeIndexingProcess(): Promise<IndexingResult>;

  /**
   * Get indexer-specific configuration
   * Subclasses provide their configuration here
   */
  protected abstract getIndexerConfig(): IndexerConfig;

  /**
   * Check external API health (optional)
   * Subclasses can implement this to check their specific external APIs
   */
  protected async checkExternalApiHealth(): Promise<
    | {
        name: string;
        isHealthy: boolean;
        error?: string;
        responseTime?: number;
      }
    | undefined
  > {
    return undefined; // Default implementation - no external API health check
  }
}
