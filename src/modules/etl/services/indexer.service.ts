import { Injectable, Logger } from '@nestjs/common';
import { TwitterScraperService } from './twitter-scraper.service';
import { TwitterListenerService } from './twitter-listener.service';
import { EmbeddingService } from './embedding.service';
import { EtlConfigService } from '../config/etl.config';
import { QdrantRepository } from '../../database/qdrant/services/qdrant.repository';
import { ETLStatus, TweetProcessingStatus } from '../models/etl.enums';
import { Tweet } from '../models/tweet.model';
import { EmbeddingRequest } from '../models/embedding.model';
import {
  IndexingResult,
  IndexingOperationResults,
  ProcessingResults,
  AccountProcessingResult,
  StorageResult,
  IndexingStatistics,
  IndexingStatus,
  IndexingHealth,
  IndexingConfiguration,
  IndexingStatisticsPublic,
  HealthServices,
  TweetVectorBatchItem,
  TweetVectorMetadata,
} from '../models/indexer.model';

/**
 * Indexer Service
 *
 * Handles tweet indexing operations with separate processes for scraping and listening.
 * Operates in batches per account for efficient processing.
 */
@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private isRunning = false;
  private lastRun?: Date;
  private runCount = 0;
  private indexingStats: IndexingStatistics = {
    totalTweetsProcessed: 0,
    totalEmbeddingsGenerated: 0,
    totalVectorsStored: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageProcessingTime: 0,
    errors: [],
    runInitialScrape: true,
    accountStats: {},
  };

  constructor(
    private readonly twitterScraper: TwitterScraperService,
    private readonly twitterListener: TwitterListenerService,
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantRepository: QdrantRepository,
    private readonly etlConfig: EtlConfigService,
  ) {}

  /**
   * Run listener-based indexing
   * Processes new tweets from live monitoring
   */
  async runListenerIndexing(): Promise<IndexingResult> {
    if (this.isRunning) {
      this.logger.warn('Indexer is already running');
      return {
        success: false,
        status: ETLStatus.PROCESSING,
        processingTime: 0,
        results: null,
        errors: ['Indexer already running'],
      };
    }

    this.isRunning = true;
    this.runCount++;
    this.lastRun = new Date();
    const startTime = Date.now();

    try {
      this.logger.log(`Starting listener indexing run #${this.runCount}`);

      // Initialize account tracking if first run
      if (this.runCount === 1) {
        this.logger.log('Initializing account tracking for first run');
        await this.twitterListener.initializeAllAccounts();
      }

      // Poll for new tweets
      this.logger.log('Polling for new tweets...');
      const newTweets = await this.twitterListener.pollNewTweets();
      this.logger.log(`Found ${newTweets.length} new tweets`);

      const processingResults = await this.processAccountBatches(
        newTweets,
        'listener',
      );

      const processingTime = Date.now() - startTime;
      this.updateIndexingStats(
        processingResults,
        processingTime,
        processingResults.errors.length === 0,
      );

      const operationResults: IndexingOperationResults = {
        ...processingResults,
        newTweets: newTweets.length,
        processingTime,
        runNumber: this.runCount,
      };

      return {
        success: processingResults.errors.length === 0,
        status:
          processingResults.errors.length === 0
            ? ETLStatus.COMPLETED
            : ETLStatus.FAILED,
        processingTime,
        results: operationResults,
        errors: processingResults.errors,
      };
    } catch (error) {
      this.logger.error('Listener indexing failed', error);
      const processingTime = Date.now() - startTime;
      this.updateIndexingStats(
        { processed: 0, embedded: 0, stored: 0, errors: [] },
        processingTime,
        false,
      );

      return {
        success: false,
        status: ETLStatus.FAILED,
        processingTime,
        results: null,
        errors: [error.message],
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run scraper-based indexing
   * Processes historical tweets for specific accounts
   */
  async runScraperIndexing(maxDays: number = 30): Promise<IndexingResult> {
    if (this.isRunning) {
      this.logger.warn('Indexer is already running');
      return {
        success: false,
        status: ETLStatus.PROCESSING,
        processingTime: 0,
        results: null,
        errors: ['Indexer already running'],
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.log(`Starting scraper indexing for ${maxDays} days`);

      const accounts = this.etlConfig.getTwitterAccounts();
      const allTweets: Tweet[] = [];

      // Process each account separately for better control
      for (const account of accounts) {
        this.logger.log(`Scraping historical tweets for account: ${account}`);

        // Query database for the latest tweet to start from
        const startFromDate = await this.getStartDate(account, maxDays);

        const accountBatch = await this.twitterScraper.scrapeHistoricalTweets(
          [account],
          maxDays,
          startFromDate,
        );

        if (accountBatch.tweets.length > 0) {
          allTweets.push(...accountBatch.tweets);
          this.logger.log(
            `Found ${accountBatch.tweets.length} tweets for ${account}`,
          );
        }
      }

      const processingResults = await this.processAccountBatches(
        allTweets,
        'scraper',
      );

      const processingTime = Date.now() - startTime;
      this.updateIndexingStats(
        processingResults,
        processingTime,
        processingResults.errors.length === 0,
      );

      const operationResults: IndexingOperationResults = {
        ...processingResults,
        historicalTweets: allTweets.length,
        processingTime,
        maxDays,
      };

      return {
        success: processingResults.errors.length === 0,
        status:
          processingResults.errors.length === 0
            ? ETLStatus.COMPLETED
            : ETLStatus.FAILED,
        processingTime,
        results: operationResults,
        errors: processingResults.errors,
      };
    } catch (error) {
      this.logger.error('Scraper indexing failed', error);
      const processingTime = Date.now() - startTime;
      this.updateIndexingStats(
        { processed: 0, embedded: 0, stored: 0, errors: [] },
        processingTime,
        false,
      );

      return {
        success: false,
        status: ETLStatus.FAILED,
        processingTime,
        results: null,
        errors: [error.message],
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async getStartDate(account: string, maxDays: number): Promise<Date> {
    const latestTweetInDb = await this.qdrantRepository.getLatestTweetByAccount(account);
        let startFromDate: Date | undefined;
        
        if (latestTweetInDb) {
          startFromDate = new Date(latestTweetInDb.payload.createdAt);
          this.logger.log(
            `Found latest tweet in database for ${account}: ${latestTweetInDb.payload.originalTweetId} at ${startFromDate.toISOString()}`,
          );
        } else {
          // If no tweets in database, use maxDays as fallback
          startFromDate = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);
          this.logger.log(
            `No previous tweets found in database for ${account}, starting from ${startFromDate.toISOString()}`,
          );
        }
        return startFromDate;
      }
  /**
   * Process tweets in account-based batches
   * Shared logic for both listener and scraper operations
   */
  private async processAccountBatches(
    tweets: Tweet[],
    source: 'listener' | 'scraper',
  ): Promise<ProcessingResults> {
    const errors: string[] = [];
    let totalProcessed = 0;
    let totalEmbedded = 0;
    let totalStored = 0;

    if (tweets.length === 0) {
      this.logger.log('No tweets to process');
      return { processed: 0, embedded: 0, stored: 0, errors: [] };
    }

    // Group tweets by account
    const tweetsByAccount = this.groupTweetsByAccount(tweets);

    this.logger.log(
      `Processing ${Object.keys(tweetsByAccount).length} accounts with ${tweets.length} total tweets`,
    );

    // Process each account's tweets as a logical bulk
    for (const [account, accountTweets] of Object.entries(tweetsByAccount)) {
      this.logger.log(
        `Processing ${accountTweets.length} tweets for account: ${account}`,
      );

      try {
        const accountResults = await this.processTweetBulkForAccount(
          account,
          accountTweets,
          source,
        );

        totalProcessed += accountResults.processed;
        totalEmbedded += accountResults.embedded;
        totalStored += accountResults.stored;

        if (accountResults.errors.length > 0) {
          errors.push(...accountResults.errors);
        }

        // Update account-specific stats
        this.updateAccountStats(account, accountResults);
      } catch (error) {
        const errorMsg = `Failed to process tweets for account ${account}: ${error.message}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return {
      processed: totalProcessed,
      embedded: totalEmbedded,
      stored: totalStored,
      errors,
    };
  }

  /**
   * Process a bulk of tweets for a specific account
   * Handles transformation → embedding → storage pipeline
   */
  private async processTweetBulkForAccount(
    account: string,
    tweets: Tweet[],
    source: 'listener' | 'scraper',
  ): Promise<AccountProcessingResult> {
    const errors: string[] = [];
    let processed = 0;
    let embedded = 0;
    let stored = 0;

    this.logger.log(
      `Processing bulk of ${tweets.length} tweets for ${account} (${source})`,
    );

    // Filter tweets that need processing
    const tweetsToProcess = tweets.filter(
      (tweet) => tweet.processingStatus === TweetProcessingStatus.SCRAPED,
    );

    if (tweetsToProcess.length === 0) {
      this.logger.log(`No tweets require processing for account: ${account}`);
      return { processed: 0, embedded: 0, stored: 0, errors: [] };
    }

    // Process tweets in configurable batches
    const batchSize = this.etlConfig.getBatchSize();
    const batches = this.chunkArray(tweetsToProcess, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.log(
        `Processing batch ${i + 1}/${batches.length} for ${account} (${batch.length} tweets)`,
      );

      try {
        // Transform tweets
        const transformedTweets = await this.transformTweets(batch);

        // Generate embeddings
        const embeddingResults =
          await this.generateEmbeddingsForTweets(transformedTweets);

        // Update tweets with embeddings
        const processedTweets = await this.attachEmbeddingsToTweets(
          transformedTweets,
          embeddingResults,
        );

        // Store vectors in Qdrant
        const storageResults = await this.storeVectorsInQdrant(processedTweets);

        processed += processedTweets.length;
        embedded += embeddingResults.embeddings.length;
        stored += storageResults.stored;

        if (embeddingResults.errors && embeddingResults.errors.length > 0) {
          errors.push(...embeddingResults.errors);
        }

        if (storageResults.errors.length > 0) {
          errors.push(...storageResults.errors);
        }
      } catch (error) {
        const errorMsg = `Batch ${i + 1} processing failed for ${account}: ${error.message}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return { processed, embedded, stored, errors };
  }

  /**
   * Group tweets by account for logical bulk processing
   */
  private groupTweetsByAccount(tweets: Tweet[]): Record<string, Tweet[]> {
    const tweetsByAccount: Record<string, Tweet[]> = {};

    for (const tweet of tweets) {
      const account = tweet.authorHandle || 'unknown';
      if (!tweetsByAccount[account]) {
        tweetsByAccount[account] = [];
      }
      tweetsByAccount[account].push(tweet);
    }

    return tweetsByAccount;
  }

  /**
   * Transform tweets using the transformer service
   */
  private async transformTweets(tweets: Tweet[]): Promise<Tweet[]> {
    // Additional transformations can be added here
    return tweets.map((tweet) => ({
      ...tweet,
      processingStatus: TweetProcessingStatus.TRANSFORMED,
    }));
  }

  /**
   * Generate embeddings for tweets
   */
  private async generateEmbeddingsForTweets(tweets: Tweet[]) {
    const texts = tweets.map((tweet) => tweet.text);
    const embeddingRequest: EmbeddingRequest = {
      texts,
      model: this.etlConfig.getEmbeddingConfig().model,
    };

    return await this.embeddingService.generateEmbeddings(embeddingRequest);
  }

  /**
   * Attach embeddings to tweets
   */
  private async attachEmbeddingsToTweets(
    tweets: Tweet[],
    embeddingResults: any,
  ): Promise<Tweet[]> {
    const processedTweets: Tweet[] = [];

    for (let i = 0; i < tweets.length; i++) {
      const tweet = tweets[i];
      if (i < embeddingResults.embeddings.length) {
        const embedding = embeddingResults.embeddings[i];
        tweet.embedding = embedding.vector;
        tweet.embeddingModel = embedding.model;
        tweet.embeddingGeneratedAt = embedding.generatedAt;
        tweet.processingStatus = TweetProcessingStatus.EMBEDDED;
      } else {
        tweet.processingStatus = TweetProcessingStatus.FAILED;
        tweet.errors = tweet.errors || [];
        tweet.errors.push({
          stage: 'embedding',
          error: 'No embedding generated',
          timestamp: new Date(),
          recoverable: true,
        });
      }
      processedTweets.push(tweet);
    }

    return processedTweets;
  }

  /**
   * Store processed tweets with vectors in Qdrant
   */
  private async storeVectorsInQdrant(tweets: Tweet[]): Promise<StorageResult> {
    const errors: string[] = [];
    let stored = 0;

    const embeddedTweets = tweets.filter(
      (tweet) =>
        tweet.processingStatus === TweetProcessingStatus.EMBEDDED &&
        tweet.embedding,
    );

    if (embeddedTweets.length === 0) {
      this.logger.log('No embedded tweets to store');
      return { stored: 0, errors: [] };
    }

    try {
      const tweetVectorBatch: TweetVectorBatchItem[] = embeddedTweets.map(
        (tweet) => {
          const metadata: TweetVectorMetadata = {
            originalTweetId: tweet.id,
            author: tweet.author,
            authorHandle: tweet.authorHandle,
            text: tweet.text,
            createdAt: tweet.createdAt.toISOString(),
            url: tweet.url,
            likes: tweet.likes,
            retweets: tweet.retweets,
            replies: tweet.replies,
            kaspaRelated: tweet.kaspaRelated,
            kaspaTopics: tweet.kaspaTopics,
            hashtags: tweet.hashtags,
            mentions: tweet.mentions,
            links: tweet.links,
            source: tweet.source,
          };

          return {
            tweetId: tweet.id,
            vector: tweet.embedding!,
            metadata,
          };
        },
      );

      const upsertResult =
        await this.qdrantRepository.storeTweetVectorsBatch(tweetVectorBatch);
      stored = upsertResult.stored;

      // Update tweet status
      for (const tweet of embeddedTweets) {
        tweet.processingStatus = TweetProcessingStatus.STORED;
        tweet.storedAt = new Date();
      }

      this.logger.log(`Successfully stored ${stored} vectors in Qdrant`);
    } catch (error) {
      const errorMsg = `Failed to store vectors in Qdrant: ${error.message}`;
      this.logger.error(errorMsg);
      errors.push(errorMsg);
    }

    return { stored, errors };
  }

  /**
   * Update account-specific statistics
   */
  private updateAccountStats(
    account: string,
    results: AccountProcessingResult,
  ): void {
    if (!this.indexingStats.accountStats[account]) {
      this.indexingStats.accountStats[account] = {
        processed: 0,
        embedded: 0,
        stored: 0,
        lastProcessed: new Date(),
      };
    }

    const stats = this.indexingStats.accountStats[account];
    stats.processed += results.processed;
    stats.embedded += results.embedded;
    stats.stored += results.stored;
    stats.lastProcessed = new Date();
  }

  /**
   * Update overall indexing statistics
   */
  private updateIndexingStats(
    results: ProcessingResults,
    processingTime: number,
    success: boolean,
  ): void {
    this.indexingStats.totalTweetsProcessed += results.processed;
    this.indexingStats.totalEmbeddingsGenerated += results.embedded;
    this.indexingStats.totalVectorsStored += results.stored;

    if (success) {
      this.indexingStats.successfulRuns++;
    } else {
      this.indexingStats.failedRuns++;
    }

    // Update average processing time
    const totalRuns =
      this.indexingStats.successfulRuns + this.indexingStats.failedRuns;
    this.indexingStats.averageProcessingTime =
      (this.indexingStats.averageProcessingTime * (totalRuns - 1) +
        processingTime) /
      totalRuns;

    this.logger.log(
      `Indexing stats updated: ${results.processed} processed, ${results.embedded} embedded, ${results.stored} stored`,
    );
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

  /**
   * Get indexing status
   */
  getIndexingStatus(): IndexingStatus {
    const configuration: IndexingConfiguration = {
      accounts: this.etlConfig.getTwitterAccounts(),
      batchSize: this.etlConfig.getBatchSize(),
      isEnabled: this.etlConfig.isEtlEnabled(),
      embeddingModel: this.etlConfig.getEmbeddingConfig().model,
    };

    const statistics: IndexingStatisticsPublic = {
      totalTweetsProcessed: this.indexingStats.totalTweetsProcessed,
      totalEmbeddingsGenerated: this.indexingStats.totalEmbeddingsGenerated,
      totalVectorsStored: this.indexingStats.totalVectorsStored,
      successfulRuns: this.indexingStats.successfulRuns,
      failedRuns: this.indexingStats.failedRuns,
      averageProcessingTime: this.indexingStats.averageProcessingTime,
      errorCount: this.indexingStats.errors.length,
      accountStats: this.indexingStats.accountStats,
    };

    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      runCount: this.runCount,
      configuration,
      statistics,
    };
  }

  /**
   * Get indexing health status
   */
  async getIndexingHealth(): Promise<IndexingHealth> {
    const services: HealthServices = {
      twitter: false,
      embedding: false,
      qdrant: false,
      config: false,
    };

    const errors: string[] = [];

    try {
      // Check Twitter services
      const twitterStatus = await this.twitterListener.getListenerStatus();
      services.twitter =
        !twitterStatus.isRunning || twitterStatus.errors.length === 0;

      // Check embedding service
      const embeddingStatus = await this.embeddingService.getEmbeddingStatus();
      services.embedding = embeddingStatus.isAvailable;

      // Check Qdrant service
      const qdrantHealth = await this.qdrantRepository.checkHealth();
      services.qdrant = qdrantHealth.isHealthy;
      if (!qdrantHealth.isHealthy) {
        errors.push(...qdrantHealth.issues);
      }

      // Check configuration
      services.config = this.etlConfig.isEtlEnabled();
    } catch (error) {
      errors.push(`Health check failed: ${error.message}`);
    }

    const isHealthy =
      Object.values(services).every((status) => status) && errors.length === 0;

    return {
      isHealthy,
      services,
      lastRun: this.lastRun,
      errors,
    };
  }

  /**
   * Clear indexing errors
   */
  clearErrors(): void {
    this.indexingStats.errors = [];
    this.logger.log('Indexing errors cleared');
  }

  /**
   * Reset indexing statistics
   */
  resetStatistics(): void {
    this.indexingStats.totalTweetsProcessed = 0;
    this.indexingStats.totalEmbeddingsGenerated = 0;
    this.indexingStats.totalVectorsStored = 0;
    this.indexingStats.successfulRuns = 0;
    this.indexingStats.failedRuns = 0;
    this.indexingStats.averageProcessingTime = 0;
    this.indexingStats.errors = [];
    this.indexingStats.accountStats = {};
    this.runCount = 0;
    this.lastRun = undefined;
    this.logger.log('Indexing statistics reset');
  }
}
