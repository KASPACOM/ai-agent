import { Injectable } from '@nestjs/common';
import { BaseIndexerService } from './base-indexer.service';
import { TwitterApiService } from './twitter-api.service';
import { QdrantRepository } from '../../database/qdrant/services/qdrant.repository';
import { EmbeddingService } from './embedding.service';
import { EtlConfigService } from '../config/etl.config';
import { Tweet } from '../models/tweet.model';
import { TweetSource, TweetProcessingStatus } from '../models/etl.enums';
import {
  BaseMessage,
  HistoricalFetchParams,
  IndexingResult,
  MessageProcessingResult,
} from '../models/base-indexer.model';
import { TwitterMessageTransformer } from '../transformers/twitter-message.transformer';

/**
 * Twitter Indexer Service
 *
 * Specialized indexer for Twitter messages
 * Inherits common functionality from BaseIndexerService
 * Uses TwitterApiService for fetching tweets
 */
@Injectable()
export class TwitterIndexerService extends BaseIndexerService {
  constructor(
    qdrantRepository: QdrantRepository,
    embeddingService: EmbeddingService,
    etlConfig: EtlConfigService,
    private readonly twitterApi: TwitterApiService,
  ) {
    super(
      qdrantRepository,
      embeddingService,
      etlConfig,
      'Twitter',
      'kaspa_tweets', // Collection name for Twitter messages
    );
  }

  /**
   * Get Twitter accounts from configuration
   */
  protected getServiceAccounts(): string[] {
    return this.etlConfig.getTwitterAccounts();
  }

  /**
   * Twitter-specific indexing implementation with rate-limit-aware stateful processing
   * Processes accounts bidirectionally: new tweets + historical backfill
   * Limits to 10 API requests per 15-minute run, saves state for continuation
   */
  async runIndexer(): Promise<IndexingResult> {
    return this.executeIndexingProcess(async () => {
      return this.processAccountsWithRateLimit();
    });
  }

  /**
   * Process accounts with rate limit awareness (new method)
   * Uses bidirectional strategy: fill forward (new tweets) and backward (historical)
   */
  private async processAccountsWithRateLimit(): Promise<MessageProcessingResult> {
    const REQUEST_LIMIT = 10; // Basic tier limit per 15 minutes
    const allErrors: string[] = [];
    let totalProcessed = 0;
    let totalEmbedded = 0;
    let totalStored = 0;
    const allMessages: BaseMessage[] = [];
    let requestsUsed = 0;
    let rateLimited = false;
    let hasMoreData = false;

    const accounts = this.config.accounts;
    this.logger.log(
      `Starting rate-limited Twitter processing for ${accounts.length} accounts (${REQUEST_LIMIT} request budget)`,
    );

    for (const account of accounts) {
      if (requestsUsed >= REQUEST_LIMIT) {
        this.logger.warn(
          `Reached request limit (${REQUEST_LIMIT}). Stopping processing. Will continue with ${account} next run.`,
        );
        rateLimited = true;
        hasMoreData = true;
        break;
      }

      try {
        this.logger.log(`Processing Twitter account: @${account} (requests used: ${requestsUsed}/${REQUEST_LIMIT})`);
        
        // Get current data boundaries for this account from Qdrant
        const boundaries = await this.qdrantRepository.getTweetBoundariesForAccount(account, this.config.collectionName);
        this.logger.log(
          `Account @${account} boundaries: earliest=${boundaries.earliest?.toISOString()}, latest=${boundaries.latest?.toISOString()}, hasData=${boundaries.hasData}`,
        );

        let accountProcessed = 0;
        let accountStored = 0;
        const remainingRequests = REQUEST_LIMIT - requestsUsed;

        if (!boundaries.hasData) {
          // No data for this account yet - start fresh historical fetch
          this.logger.log(`@${account} has no data - starting fresh historical fetch`);
          const result = await this.fetchAccountTweets(account, undefined, remainingRequests);
          accountProcessed += result.processed;
          accountStored += result.stored;
          requestsUsed += result.requestsUsed;
          allMessages.push(...result.messages);
          
          if (result.rateLimited) {
            rateLimited = true;
            hasMoreData = result.hasMoreData;
          }
        } else {
          // Account has data - do bidirectional processing
          
          // 1. First, fetch new tweets (newer than latest)
          if (remainingRequests > 0) {
            this.logger.log(`@${account} - fetching new tweets newer than ${boundaries.latest?.toISOString()}`);
            const newResult = await this.fetchAccountTweets(account, boundaries.latest, Math.min(5, remainingRequests));
            accountProcessed += newResult.processed;
            accountStored += newResult.stored;
            requestsUsed += newResult.requestsUsed;
            allMessages.push(...newResult.messages);
          }

          // 2. Then, if we have requests left, do historical backfill (older than earliest)
          const remainingAfterNew = REQUEST_LIMIT - requestsUsed;
          if (remainingAfterNew > 0) {
            this.logger.log(`@${account} - backfilling tweets older than ${boundaries.earliest?.toISOString()}`);
            const historicalResult = await this.fetchAccountTweetsHistorical(account, boundaries.earliest, remainingAfterNew);
            accountProcessed += historicalResult.processed;
            accountStored += historicalResult.stored;
            requestsUsed += historicalResult.requestsUsed;
            allMessages.push(...historicalResult.messages);
            
            if (historicalResult.hasMoreData) {
              hasMoreData = true;
            }
          }

          if (requestsUsed >= REQUEST_LIMIT) {
            this.logger.log(`@${account} - reached request limit during processing`);
            rateLimited = true;
            hasMoreData = true;
          }
        }

        totalProcessed += accountProcessed;
        totalStored += accountStored;

        this.logger.log(
          `Completed @${account}: ${accountProcessed} processed, ${accountStored} stored. Total requests used: ${requestsUsed}/${REQUEST_LIMIT}`,
        );

        if (requestsUsed >= REQUEST_LIMIT) {
          break;
        }
      } catch (error) {
        const errorMsg = `Failed to process Twitter account @${account}: ${error.message}`;
        this.logger.error(errorMsg);
        allErrors.push(errorMsg);
      }
    }

    const success = allErrors.length === 0;
    this.logger.log(
      `Rate-limited Twitter processing completed: ${totalProcessed} processed, ${totalStored} stored, ${requestsUsed} requests used, rateLimited: ${rateLimited}, hasMoreData: ${hasMoreData}`,
    );

    return {
      success,
      processed: totalProcessed,
      embedded: totalEmbedded,
      stored: totalStored,
      errors: allErrors,
      messages: allMessages,
      rateLimited,
      hasMoreData,
      requestsUsed,
    };
  }

  /**
   * Process all configured Twitter accounts (legacy method for backwards compatibility)
   */
  private async processAllTwitterAccounts(): Promise<MessageProcessingResult> {
    const allErrors: string[] = [];
    let totalProcessed = 0;
    let totalEmbedded = 0;
    let totalStored = 0;
    const allMessages: BaseMessage[] = [];

    const accounts = this.config.accounts;
    this.logger.log(`Processing ${accounts.length} Twitter accounts`);

    for (const account of accounts) {
      try {
        this.logger.log(`Processing Twitter account: @${account}`);
        const result = await this.processAccount(account);

        totalProcessed += result.processed;
        totalEmbedded += result.embedded;
        totalStored += result.stored;
        allMessages.push(...result.messages);

        if (result.errors.length > 0) {
          allErrors.push(...result.errors);
        }

        this.logger.log(
          `Completed processing @${account}: ${result.processed} tweets processed, ${result.stored} stored`,
        );
      } catch (error) {
        const errorMsg = `Failed to process Twitter account @${account}: ${error.message}`;
        this.logger.error(errorMsg);
        allErrors.push(errorMsg);
      }
    }

    const success = allErrors.length === 0;
    this.logger.log(
      `Twitter indexing completed: ${totalProcessed} processed, ${totalStored} stored, ${allErrors.length} errors`,
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
   * Fetch historical tweets using Twitter API
   */
  protected async fetchHistoricalMessages(
    params: HistoricalFetchParams,
  ): Promise<BaseMessage[]> {
    try {
      this.logger.log(`Fetching historical tweets for ${params.account}`);

      const tweets = await this.twitterApi.fetchAccountTweets(
        params.account,
        params.startFromDate,
      );

      // Convert tweets to BaseMessage format
      const baseMessages = tweets.map((tweet) =>
        TwitterMessageTransformer.convertTweetToBaseMessage(tweet),
      );

      // Filter out tweets that are older than or equal to startFromDate if provided
      const filteredMessages = params.startFromDate
        ? baseMessages.filter((msg) => msg.createdAt > params.startFromDate!)
        : baseMessages;

      this.logger.log(
        `Found ${filteredMessages.length} new tweets for ${params.account}`,
      );
      return filteredMessages;
    } catch (error) {
      this.logger.error(
        `Failed to fetch historical tweets for ${params.account}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Transform message for Qdrant storage
   */
  protected transformMessageForStorage(message: BaseMessage): any {
    return TwitterMessageTransformer.transformMessageForStorage(message);
  }

  /**
   * Test Twitter API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      return await this.twitterApi.testConnection();
    } catch (error) {
      this.logger.error('Twitter API connection test failed', error);
      return false;
    }
  }

  /**
   * Get recent Kaspa-related tweets
   */
  async getRecentKaspaTweets(maxResults: number = 100): Promise<BaseMessage[]> {
    try {
      this.logger.log(`Fetching recent Kaspa tweets (limit: ${maxResults})`);

      const tweets = await this.twitterApi.getRecentKaspaTweets(maxResults);
      const baseMessages = tweets.map((tweet) =>
        TwitterMessageTransformer.convertTweetToBaseMessage(tweet),
      );

      this.logger.log(`Found ${baseMessages.length} recent Kaspa tweets`);
      return baseMessages;
    } catch (error) {
      this.logger.error('Failed to fetch recent Kaspa tweets', error);
      throw error;
    }
  }

  /**
   * Search tweets by query
   */
  async searchTweets(
    query: string,
    maxResults: number = 100,
    startTime?: Date,
    endTime?: Date,
  ): Promise<BaseMessage[]> {
    try {
      this.logger.log(`Searching tweets with query: ${query}`);

      const tweets = await this.twitterApi.searchTweets(
        query,
        maxResults,
        startTime,
        endTime,
      );
      const baseMessages = tweets.map((tweet) =>
        TwitterMessageTransformer.convertTweetToBaseMessage(tweet),
      );

      this.logger.log(
        `Found ${baseMessages.length} tweets for query: ${query}`,
      );
      return baseMessages;
    } catch (error) {
      this.logger.error(`Failed to search tweets with query: ${query}`, error);
      throw error;
    }
  }

  /**
   * Get Twitter API statistics
   */
  async getApiStatistics(): Promise<any> {
    try {
      return await this.twitterApi.getApiStats();
    } catch (error) {
      this.logger.error('Failed to get Twitter API statistics', error);
      return null;
    }
  }

  /**
   * Fetch account tweets with request counting and rate limiting awareness
   * Used for forward processing (new tweets)
   */
  private async fetchAccountTweets(
    account: string,
    latestIndexedDate: Date | undefined,
    maxRequests: number,
  ): Promise<{
    processed: number;
    stored: number;
    requestsUsed: number;
    rateLimited: boolean;
    hasMoreData: boolean;
    messages: BaseMessage[];
  }> {
    const messages: BaseMessage[] = [];
    let requestsUsed = 0;
    let rateLimited = false;
    let hasMoreData = false;

    try {
      // Fetch tweets with the updated API that includes request counting
      const tweets = await this.twitterApi.fetchAccountTweets(account, latestIndexedDate);
      
      // Each API call in fetchAccountTweets counts as multiple requests due to pagination
      // For now, estimate 1 request per 100 tweets + 1 base request
      requestsUsed = Math.max(1, Math.ceil(tweets.length / 100));
      
      if (requestsUsed >= maxRequests) {
        rateLimited = true;
        hasMoreData = tweets.length > 0;
      }

      // Convert tweets to BaseMessage format
      const baseMessages = tweets.map((tweet) =>
        TwitterMessageTransformer.convertTweetToBaseMessage(tweet),
      );

      // Filter out tweets that are older than or equal to latestIndexedDate if provided
      const filteredMessages = latestIndexedDate
        ? baseMessages.filter((msg) => msg.createdAt > latestIndexedDate)
        : baseMessages;

      messages.push(...filteredMessages);

      // Process and store the messages
      // TODO: Implement proper message processing and storage
      // For now, we'll count as processed but not stored until we implement 
      // the proper embedding and storage pipeline for fetched messages
      let stored = 0;
      if (filteredMessages.length > 0) {
        this.logger.log(`${filteredMessages.length} messages processed for @${account} - storage not yet implemented in rate-limited mode`);
        // stored = await this.processAndStoreMessages(filteredMessages, account);
      }

      this.logger.log(
        `Fetched ${tweets.length} tweets for @${account}, ${filteredMessages.length} new, ${stored} stored, ${requestsUsed} requests used`,
      );

      return {
        processed: filteredMessages.length,
        stored,
        requestsUsed,
        rateLimited,
        hasMoreData,
        messages: filteredMessages,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch tweets for @${account}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch account tweets for historical backfill (older than earliest)
   * Used for backward processing
   */
  private async fetchAccountTweetsHistorical(
    account: string,
    earliestIndexedDate: Date | undefined,
    maxRequests: number,
  ): Promise<{
    processed: number;
    stored: number;
    requestsUsed: number;
    hasMoreData: boolean;
    messages: BaseMessage[];
  }> {
    const messages: BaseMessage[] = [];
    let requestsUsed = 0;
    let hasMoreData = false;

    try {
      // For historical backfill, we need to use a different approach since fetchAccountTweets
      // goes forward from a date. For now, we'll use the same method but with different logic.
      // In a complete implementation, you might need a separate method in TwitterApiService
      // that can fetch tweets older than a specific date.
      
      // TODO: Implement proper historical backfill in TwitterApiService
      // For now, we'll skip historical backfill and just log it
      this.logger.log(
        `Historical backfill for @${account} older than ${earliestIndexedDate?.toISOString()} - not yet implemented`,
      );

      return {
        processed: 0,
        stored: 0,
        requestsUsed: 0,
        hasMoreData: false,
        messages: [],
      };
    } catch (error) {
      this.logger.error(`Failed to fetch historical tweets for @${account}: ${error.message}`);
      throw error;
    }
  }
}
