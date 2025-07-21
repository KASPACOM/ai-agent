import { Injectable, Logger } from '@nestjs/common';
import { QdrantRepository } from '../../database/qdrant/services/qdrant.repository';
import { EmbeddingService } from '../../embedding/embedding.service';
import { EtlConfigService } from '../config/etl.config';
import { TweetProcessingStatus } from '../models/etl.enums';
import {
  IndexerConfig,
  IndexingResult,
  IndexerStatistics,
  IndexerHealth,
  HistoricalFetchParams,
  LatestMessageInfo,
  MessageProcessingResult,
  BaseMessage,
} from '../models/base-indexer.model';

/**
 * Base Indexer Service
 *
 * Abstract base class providing common indexing functionality for Twitter and Telegram services
 * Handles Qdrant operations, embedding generation, and message processing pipeline
 */
@Injectable()
export abstract class BaseIndexerService {
  protected readonly logger: Logger;
  protected readonly config: IndexerConfig;
  protected readonly stats: IndexerStatistics;
  private isRunning = false;

  constructor(
    protected readonly qdrantRepository: QdrantRepository,
    protected readonly embeddingService: EmbeddingService,
    protected readonly etlConfig: EtlConfigService,
    protected readonly serviceName: string,
    protected readonly collectionName: string,
  ) {
    this.logger = new Logger(`${serviceName}IndexerService`);

    this.config = {
      collectionName: collectionName,
      maxHistoricalDays: this.etlConfig.getMaxHistoricalDays(),
      batchSize: this.etlConfig.getBatchSize(),
      accounts: this.getServiceAccounts(),
    };

    this.stats = {
      totalProcessed: 0,
      totalEmbedded: 0,
      totalStored: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageProcessingTime: 0,
      errorCount: 0,
    };

    this.logger.log(
      `${serviceName} Indexer Service initialized with collection: ${collectionName}`,
    );
  }

  /**
   * Abstract method to get service-specific accounts
   */
  protected abstract getServiceAccounts(): string[];

  /**
   * Abstract method to fetch historical messages
   */
  protected abstract fetchHistoricalMessages(
    params: HistoricalFetchParams,
  ): Promise<BaseMessage[]>;

  /**
   * Abstract method to transform message for storage
   */
  protected abstract transformMessageForStorage(message: BaseMessage): any;

  /**
   * Main indexer entry point
   * Each service implements its own account/channel processing logic
   */
  abstract runIndexer(): Promise<IndexingResult>;

  /**
   * Common indexer execution pattern
   * Used by implementations to handle timing, logging, and error handling
   */
  protected async executeIndexingProcess(
    processFunction: () => Promise<MessageProcessingResult>,
  ): Promise<IndexingResult> {
    if (this.isRunning) {
      this.logger.warn(`${this.serviceName} indexer is already running`);
      return this.createFailureResult(
        'Indexer already running',
        Date.now(),
        Date.now(),
      );
    }

    const startTime = Date.now();
    const startDate = new Date(startTime);
    this.isRunning = true;

    try {
      this.logger.log(`Starting ${this.serviceName} indexing process`);

      const result = await processFunction();
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      this.updateStatistics(result, processingTime, result.success);

      return {
        ...result,
        processingTime,
        startTime: startDate,
        endTime: new Date(endTime),
      };
    } catch (error) {
      this.logger.error(`${this.serviceName} indexing failed`, error);
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      const failureResult = {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors: [error.message],
        messages: [],
      };

      this.updateStatistics(failureResult, processingTime, false);
      return this.createFailureResult(error.message, startTime, endTime);
    } finally {
      this.isRunning = false;
    }
  }



  /**
   * Process a single account/channel/entity
   * Used by specific implementations for processing individual items
   */
  protected async processAccount(
    account: string,
  ): Promise<MessageProcessingResult> {
    const errors: string[] = [];

    try {
      // Get latest message from database for this account
      const startFromDate = await this.getLatestMessageDate(account);

      // Fetch historical messages from the service
      const messages = await this.fetchHistoricalMessages({
        account,
        maxDays: this.config.maxHistoricalDays,
        startFromDate,
        batchSize: this.config.batchSize,
      });

      if (messages.length === 0) {
        this.logger.log(`No new messages found for account: ${account}`);
        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          messages: [],
        };
      }

      this.logger.log(`Found ${messages.length} new messages for ${account}`);

      // Process messages in batches
      return await this.processMessageBatches(messages, account);
    } catch (error) {
      const errorMsg = `Failed to process account ${account}: ${error.message}`;
      this.logger.error(errorMsg);
      errors.push(errorMsg);

      return {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors,
        messages: [],
      };
    }
  }

  /**
   * Get the latest message date from database for an account
   */
  private async getLatestMessageDate(
    account: string,
  ): Promise<Date | undefined> {
    try {
      const latestMessage =
        await this.qdrantRepository.getLatestTweetByAccount(account, this.config.collectionName);

      if (latestMessage) {
        const date = new Date(latestMessage.payload.createdAt);
        this.logger.log(
          `Latest message for ${account}: ${latestMessage.payload.originalTweetId} at ${date.toISOString()}`,
        );
        return date;
      }

      this.logger.log(`No previous messages found for ${account}`);
      return undefined;
    } catch (error) {
      this.logger.error(
        `Failed to get latest message for ${account}: ${error.message}`,
      );
      return undefined;
    }
  }

  /**
   * Process messages in batches
   */
  private async processMessageBatches(
    messages: BaseMessage[],
    account: string,
  ): Promise<MessageProcessingResult> {
    const batchSize = this.config.batchSize;
    const batches = this.chunkArray(messages, batchSize);

    let totalProcessed = 0;
    let totalEmbedded = 0;
    let totalStored = 0;
    const allErrors: string[] = [];

    this.logger.log(`Processing ${batches.length} batches for ${account}`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      try {
        this.logger.log(
          `Processing batch ${i + 1}/${batches.length} for ${account} (${batch.length} messages)`,
        );

        const result = await this.processBatch(batch);

        totalProcessed += result.processed;
        totalEmbedded += result.embedded;
        totalStored += result.stored;

        if (result.errors.length > 0) {
          allErrors.push(...result.errors);
        }
      } catch (error) {
        const errorMsg = `Batch ${i + 1} processing failed for ${account}: ${error.message}`;
        this.logger.error(errorMsg);
        allErrors.push(errorMsg);
      }
    }

    return {
      success: allErrors.length === 0,
      processed: totalProcessed,
      embedded: totalEmbedded,
      stored: totalStored,
      errors: allErrors,
      messages,
    };
  }

  /**
   * Process a single batch of messages
   */
  private async processBatch(
    messages: BaseMessage[],
  ): Promise<MessageProcessingResult> {
    const errors: string[] = [];

    try {
      // Filter messages that need processing
      const messagesToProcess = messages.filter(
        (message) => message.processingStatus === TweetProcessingStatus.SCRAPED,
      );

      if (messagesToProcess.length === 0) {
        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          messages: [],
        };
      }

      // Generate embeddings
      const embeddingResults = await this.generateEmbeddings(messagesToProcess);

      // Transform and store messages
      const storageResults = await this.storeMessages(
        messagesToProcess,
        embeddingResults,
      );

      return {
        success: errors.length === 0,
        processed: messagesToProcess.length,
        embedded: embeddingResults.embeddings?.length || 0,
        stored: storageResults.stored,
        errors: [...(embeddingResults.errors || []), ...storageResults.errors],
        messages: messagesToProcess,
      };
    } catch (error) {
      errors.push(`Batch processing failed: ${error.message}`);
      return {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors,
        messages: [],
      };
    }
  }

  /**
   * Generate embeddings for messages
   */
  private async generateEmbeddings(messages: BaseMessage[]): Promise<any> {
    try {
      const texts = messages.map((message) => message.text);
      const embeddingRequest = {
        texts,
        model: this.etlConfig.getEmbeddingConfig().model,
      };

      return await this.embeddingService.generateEmbeddings(embeddingRequest);
    } catch (error) {
      this.logger.error('Failed to generate embeddings', error);
      throw error;
    }
  }

  /**
   * Store messages with embeddings in Qdrant
   */
  private async storeMessages(
    messages: BaseMessage[],
    embeddingResults: any,
  ): Promise<{ stored: number; errors: string[] }> {
    const errors: string[] = [];

    try {
      const vectorBatch = messages.map((message, index) => {
        const embedding = embeddingResults.embeddings?.[index];
        if (!embedding) {
          throw new Error(`No embedding found for message ${message.id}`);
        }

        return {
          tweetId: message.id,
          vector: embedding.vector,
          metadata: this.transformMessageForStorage(message),
        };
      });

      const result =
        await this.qdrantRepository.storeTweetVectorsBatch(vectorBatch, this.config.collectionName);

      return {
        stored: result.stored,
        errors: result.errors,
      };
    } catch (error) {
      const errorMsg = `Failed to store messages: ${error.message}`;
      this.logger.error(errorMsg);
      errors.push(errorMsg);

      return {
        stored: 0,
        errors,
      };
    }
  }

  /**
   * Get service health status
   */
  async getHealth(): Promise<IndexerHealth> {
    const errors: string[] = [];
    let qdrantConnected = false;
    let embeddingServiceConnected = false;

    try {
      const qdrantHealth = await this.qdrantRepository.checkHealth();
      qdrantConnected = qdrantHealth.isHealthy;
      if (!qdrantConnected) {
        errors.push(...qdrantHealth.issues);
      }
    } catch (error) {
      errors.push(`Qdrant health check failed: ${error.message}`);
    }

    try {
      const embeddingStatus = await this.embeddingService.getEmbeddingStatus();
      embeddingServiceConnected = embeddingStatus.isAvailable;
    } catch (error) {
      errors.push(`Embedding service health check failed: ${error.message}`);
    }

    return {
      isHealthy:
        qdrantConnected && embeddingServiceConnected && errors.length === 0,
      serviceName: this.serviceName,
      collectionName: this.collectionName,
      lastRun: this.stats.lastRun,
      errors,
      qdrantConnected,
      embeddingServiceConnected,
    };
  }

  /**
   * Get service statistics
   */
  getStatistics(): IndexerStatistics {
    return { ...this.stats };
  }

  /**
   * Reset service statistics
   */
  resetStatistics(): void {
    this.stats.totalProcessed = 0;
    this.stats.totalEmbedded = 0;
    this.stats.totalStored = 0;
    this.stats.successfulRuns = 0;
    this.stats.failedRuns = 0;
    this.stats.averageProcessingTime = 0;
    this.stats.errorCount = 0;
    this.stats.lastRun = undefined;
    this.logger.log('Statistics reset');
  }

  /**
   * Update service statistics
   */
  private updateStatistics(
    result: MessageProcessingResult,
    processingTime: number,
    success: boolean,
  ): void {
    this.stats.totalProcessed += result.processed;
    this.stats.totalEmbedded += result.embedded;
    this.stats.totalStored += result.stored;
    this.stats.errorCount += result.errors.length;
    this.stats.lastRun = new Date();

    if (success) {
      this.stats.successfulRuns++;
    } else {
      this.stats.failedRuns++;
    }

    // Update average processing time
    const totalRuns = this.stats.successfulRuns + this.stats.failedRuns;
    this.stats.averageProcessingTime =
      (this.stats.averageProcessingTime * (totalRuns - 1) + processingTime) /
      totalRuns;
  }

  /**
   * Create a failure result
   */
  private createFailureResult(
    errorMessage: string,
    startTime: number,
    endTime: number,
  ): IndexingResult {
    return {
      success: false,
      processed: 0,
      embedded: 0,
      stored: 0,
      errors: [errorMessage],
      processingTime: endTime - startTime,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    };
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
