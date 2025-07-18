import { Injectable, Logger } from '@nestjs/common';
import { TwitterApi, TwitterApiReadOnly, TweetV2, UserV2 } from 'twitter-api-v2';
import { Tweet, TweetBatch } from '../models/tweet.model';
import { TweetSource, TweetProcessingStatus } from '../models/etl.enums';
import { EtlConfigService } from '../config/etl.config';
import { TwitterTransformer } from '../transformers/twitter-api.transformer';

/**
 * Twitter API Service
 *
 * Handles tweet collection using the official Twitter API v2
 * Provides methods for fetching tweets with proper rate limiting and authentication
 */
@Injectable()
export class TwitterApiService {
  private readonly logger = new Logger(TwitterApiService.name);
  private readonly twitterClient: TwitterApiReadOnly;
  private readonly apiStats = {
    totalFetched: 0,
    apiCalls: 0,
    rateLimitHits: 0,
    errors: [] as string[],
    isRunning: false,
    lastRun: null as Date | null,
  };

  constructor(private readonly etlConfig: EtlConfigService) {
    // Initialize Twitter API client
    this.twitterClient = this.initializeTwitterClient();
    this.logger.log('TwitterApiService initialized');
  }

  /**
   * Initialize Twitter API client with authentication
   */
  private initializeTwitterClient(): TwitterApiReadOnly {
    try {
      const bearerToken = this.etlConfig.getTwitterBearerToken();
      
      if (!bearerToken) {
        this.logger.warn('Twitter Bearer Token not provided. API service may not work properly.');
        throw new Error('Twitter Bearer Token is required');
      }

      const client = new TwitterApi(bearerToken);
      this.logger.log('Twitter API client initialized successfully');
      return client.readOnly;
    } catch (error) {
      this.logger.error(`Failed to initialize Twitter API client: ${error.message}`);
      this.apiStats.errors.push(`Client initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch tweets from specified accounts using Twitter API
   */
  async fetchTweetsFromAccounts(
    accounts: string[],
    maxResults: number = 100,
    startTime?: Date,
    endTime?: Date,
  ): Promise<TweetBatch> {
    this.logger.log(`Fetching tweets from ${accounts.length} accounts via Twitter API`);

    this.apiStats.isRunning = true;
    this.apiStats.lastRun = new Date();

    const batchId = `api_${Date.now()}`;
    const allTweets: Tweet[] = [];

    try {
      for (const account of accounts) {
        this.logger.log(`Fetching tweets from account: ${account}`);

        try {
          const accountTweets = await this.fetchAccountTweets(
            account,
            maxResults,
            startTime,
            endTime,
          );
          allTweets.push(...accountTweets);

          this.logger.log(
            `Successfully fetched ${accountTweets.length} tweets from ${account}`,
          );
        } catch (error) {
          const errorMsg = `Failed to fetch tweets from account ${account}: ${error.message}`;
          this.logger.error(errorMsg);
          this.apiStats.errors.push(errorMsg);
        }
      }

      this.apiStats.totalFetched += allTweets.length;
      this.logger.log(`API fetch completed. Total tweets: ${allTweets.length}`);

      return {
        id: batchId,
        tweets: allTweets,
        source: TweetSource.API,
        createdAt: new Date(),
        processedAt: new Date(),
        status: TweetProcessingStatus.SCRAPED,
        totalCount: allTweets.length,
        processedCount: allTweets.length,
        errorCount: this.apiStats.errors.length,
      };
    } catch (error) {
      this.logger.error(`Twitter API fetch failed: ${error.message}`);
      this.apiStats.errors.push(`API fetch failed: ${error.message}`);

      return {
        id: batchId,
        tweets: allTweets,
        source: TweetSource.API,
        createdAt: new Date(),
        processedAt: new Date(),
        status: TweetProcessingStatus.FAILED,
        totalCount: 0,
        processedCount: allTweets.length,
        errorCount: this.apiStats.errors.length,
      };
    } finally {
      this.apiStats.isRunning = false;
    }
  }

  /**
   * Fetch tweets from a specific account using Twitter API
   */
  async fetchAccountTweets(
    username: string,
    maxResults: number = 100,
    startTime?: Date,
    endTime?: Date,
  ): Promise<Tweet[]> {
    this.logger.log(`Fetching tweets from account: ${username}`);

    const tweets: Tweet[] = [];

    try {
      // Get user by username first
      const user = await this.getUserByUsername(username);
      if (!user) {
        throw new Error(`User not found: ${username}`);
      }

      // Prepare timeline options
      const timelineOptions: any = {
        max_results: Math.min(maxResults, 100), // API limit is 100 per request
        'tweet.fields': [
          'id',
          'text',
          'author_id',
          'created_at',
          'public_metrics',
          'lang',
          'context_annotations',
          'entities',
          'referenced_tweets',
        ],
        'user.fields': ['id', 'name', 'username', 'verified'],
        expansions: ['author_id', 'referenced_tweets.id'],
      };

      // Add time filters if provided
      if (startTime) {
        timelineOptions.start_time = startTime.toISOString();
      }
      if (endTime) {
        timelineOptions.end_time = endTime.toISOString();
      }

      // Fetch user timeline
      this.apiStats.apiCalls++;
      const timeline = await this.twitterClient.v2.userTimeline(user.id, timelineOptions);

      // Process tweets
      for (const tweet of timeline.data || []) {
        const transformedTweet = TwitterTransformer.transformApiTweet(tweet, user);
        tweets.push(transformedTweet);
      }

      this.logger.log(`Fetched ${tweets.length} tweets from ${username}`);
      return tweets;
    } catch (error) {
      // Handle rate limiting
      if (error.code === 429) {
        this.apiStats.rateLimitHits++;
        this.logger.warn(`Rate limit hit for ${username}. Waiting before retry...`);
        await this.handleRateLimit(error);
        throw error;
      }

      this.logger.error(`Failed to fetch tweets from ${username}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user information by username
   */
  async getUserByUsername(username: string): Promise<UserV2 | null> {
    try {
      this.apiStats.apiCalls++;
      const user = await this.twitterClient.v2.userByUsername(username);
      return user.data || null;
    } catch (error) {
      this.logger.error(`Failed to get user ${username}: ${error.message}`);
      return null;
    }
  }

  /**
   * Search for tweets using Twitter API
   */
  async searchTweets(
    query: string,
    maxResults: number = 100,
    startTime?: Date,
    endTime?: Date,
  ): Promise<Tweet[]> {
    this.logger.log(`Searching tweets with query: ${query}`);

    const tweets: Tweet[] = [];

    try {
      const searchOptions: any = {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': [
          'id',
          'text',
          'author_id',
          'created_at',
          'public_metrics',
          'lang',
          'context_annotations',
          'entities',
          'referenced_tweets',
        ],
        'user.fields': ['id', 'name', 'username', 'verified'],
        expansions: ['author_id', 'referenced_tweets.id'],
      };

      if (startTime) {
        searchOptions.start_time = startTime.toISOString();
      }
      if (endTime) {
        searchOptions.end_time = endTime.toISOString();
      }

      this.apiStats.apiCalls++;
      const searchResults = await this.twitterClient.v2.search(query, searchOptions);

      // Process search results
      for (const tweet of searchResults.data || []) {
        const author = searchResults.includes?.users?.find(u => u.id === tweet.author_id);
        const transformedTweet = TwitterTransformer.transformApiTweet(tweet, author);
        tweets.push(transformedTweet);
      }

      this.logger.log(`Found ${tweets.length} tweets for query: ${query}`);
      return tweets;
    } catch (error) {
      if (error.code === 429) {
        this.apiStats.rateLimitHits++;
        await this.handleRateLimit(error);
        throw error;
      }

      this.logger.error(`Failed to search tweets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get recent tweets (last 7 days) for Kaspa-related content
   */
  async getRecentKaspaTweets(maxResults: number = 100): Promise<Tweet[]> {
    const kaspaQuery = '(kaspa OR #kaspa OR $kas OR ghostdag OR blockdag) -is:retweet lang:en';
    const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
    
    return this.searchTweets(kaspaQuery, maxResults, startTime);
  }

  

  /**
   * Handle rate limiting with exponential backoff
   */
  private async handleRateLimit(error: any): Promise<void> {
    const resetTime = error.rateLimit?.reset;
    if (resetTime) {
      const waitTime = Math.max(0, resetTime * 1000 - Date.now());
      this.logger.warn(`Rate limit hit. Waiting ${waitTime}ms until reset...`);
      await this.sleep(waitTime);
    } else {
      // Fallback: exponential backoff
      const waitTime = Math.min(300000, Math.pow(2, this.apiStats.rateLimitHits) * 1000); // Max 5 minutes
      this.logger.warn(`Rate limit hit. Waiting ${waitTime}ms with exponential backoff...`);
      await this.sleep(waitTime);
    }
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get API usage statistics
   */
  async getApiStats(): Promise<{
    isRunning: boolean;
    lastRun?: Date;
    totalFetched: number;
    apiCalls: number;
    rateLimitHits: number;
    errors: string[];
  }> {
    return {
      isRunning: this.apiStats.isRunning,
      lastRun: this.apiStats.lastRun,
      totalFetched: this.apiStats.totalFetched,
      apiCalls: this.apiStats.apiCalls,
      rateLimitHits: this.apiStats.rateLimitHits,
      errors: [...this.apiStats.errors], // Return a copy
    };
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.apiStats.errors = [];
    this.logger.log('API error history cleared');
  }

  /**
   * Reset API statistics
   */
  resetStats(): void {
    this.apiStats.totalFetched = 0;
    this.apiStats.apiCalls = 0;
    this.apiStats.rateLimitHits = 0;
    this.apiStats.errors = [];
    this.apiStats.lastRun = null;
    this.logger.log('API statistics reset');
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      this.apiStats.apiCalls++;
      await this.twitterClient.v2.me();
      this.logger.log('Twitter API connection test successful');
      return true;
    } catch (error) {
      this.logger.error(`Twitter API connection test failed: ${error.message}`);
      this.apiStats.errors.push(`Connection test failed: ${error.message}`);
      return false;
    }
  }
} 