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
   * Fetch historical tweets using Twitter API
   */
  protected async fetchHistoricalMessages(
    params: HistoricalFetchParams,
  ): Promise<BaseMessage[]> {
    try {
      this.logger.log(`Fetching historical tweets for ${params.account}`);

      const tweets = await this.twitterApi.fetchAccountTweets(
        params.account,
        params.batchSize,
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
}
