import { Injectable } from '@nestjs/common';
import { BaseIndexerService } from './base-indexer.service';
import { TwitterApiService } from '../../integrations/twitter/twitter-api.service';
import { QdrantRepository } from '../../database/qdrant/services/qdrant.repository';
import { EmbeddingService } from '../../embedding/embedding.service';
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
import { AccountRotationService } from './account-rotation.service';

/**
 * Twitter Indexer Service
 *
 * Specialized indexer for Twitter messages
 * Inherits common functionality from BaseIndexerService
 * Uses TwitterApiService for fetching tweets
 * 
 * EMBEDDING MODES:
 * 
 * 🚀 BULK EMBEDDINGS (default, recommended):
 * - Use for: Batch processing, ETL runs, large datasets
 * - Benefits: ~20-50x faster, same cost, fewer rate limits
 * - When: filteredMessages.length > 1
 * 
 * 🔄 SINGLE EMBEDDINGS (fallback):
 * - Use for: Single tweets, real-time processing, testing, debugging
 * - Benefits: Simpler error handling, fine-grained control
 * - When: filteredMessages.length === 1 or useBulkEmbeddings === false
 */
@Injectable()
export class TwitterIndexerService extends BaseIndexerService {
  constructor(
    qdrantRepository: QdrantRepository,
    embeddingService: EmbeddingService,
    etlConfig: EtlConfigService,
    private readonly twitterApi: TwitterApiService,
    private readonly accountRotation: AccountRotationService,
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
   * 🎯 INTELLIGENT ACCOUNT ROTATION: Process accounts with rate limit awareness
   * 
   * NEW STRATEGY:
   * - Uses AccountRotationService to intelligently select which accounts to process
   * - Prevents account starvation by rotating through accounts based on priority
   * - Tracks completion status to avoid reprocessing recently completed accounts
   * - Allocates request budget efficiently across selected accounts
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

    this.logger.log(`🎯 Starting INTELLIGENT Twitter account rotation (${REQUEST_LIMIT} request budget)`);

    // 🧠 Step 1: Intelligently select accounts to process based on priority, staleness, and completion status
    const selectedAccounts = await this.accountRotation.selectAccountsForProcessing(REQUEST_LIMIT);
    
    if (selectedAccounts.length === 0) {
      this.logger.log('🔄 No accounts selected for processing (all may be cooling down)');
      return {
        success: true,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors: [],
        messages: [],
        rateLimited: false,
        hasMoreData: false,
        requestsUsed: 0,
      };
    }

    // 🔄 Step 2: Process each selected account with its allocated request budget
    for (const selection of selectedAccounts) {
      if (requestsUsed >= REQUEST_LIMIT) {
        this.logger.warn(`Reached global request limit (${REQUEST_LIMIT}). Remaining accounts will be processed next run.`);
        rateLimited = true;
        hasMoreData = true;
        break;
      }

      const { account, allocatedRequests, reason } = selection;

      try {
        this.logger.log(`Processing @${account} (${allocatedRequests} requests allocated) - ${reason}`);
        
        // Get current data boundaries for this account from Qdrant
        const boundaries = await this.qdrantRepository.getTweetBoundariesForAccount(account, this.config.collectionName);
        this.logger.log(
          `@${account} boundaries: earliest=${boundaries.earliest?.toISOString()}, latest=${boundaries.latest?.toISOString()}, hasData=${boundaries.hasData}`,
        );

        let accountProcessed = 0;
        let accountStored = 0;
        let accountRequestsUsed = 0;
        let accountHasMoreData = false;

        if (!boundaries.hasData) {
          // 🆕 No data for this account yet - start fresh historical fetch
          this.logger.log(`@${account} has no data - starting fresh historical fetch`);
          const result = await this.fetchAccountTweets(account, undefined, allocatedRequests, true);
          accountProcessed += result.processed;
          accountStored += result.stored;
          accountRequestsUsed += result.requestsUsed;
          allMessages.push(...result.messages);
          
          if (result.rateLimited) {
            rateLimited = true;
          }
          accountHasMoreData = result.hasMoreData;

        } else {
          // 📊 Account has data - do bidirectional processing (new + historical)
          
          // 1️⃣ First, fetch new tweets (newer than latest)
          const newTweetsAllocation = Math.ceil(allocatedRequests / 2); // Give half to new tweets
          if (newTweetsAllocation > 0) {
            this.logger.log(`@${account} - fetching NEW tweets (${newTweetsAllocation} requests allocated)`);
            const newResult = await this.fetchAccountTweets(account, boundaries.latest, newTweetsAllocation, true);
            accountProcessed += newResult.processed;
            accountStored += newResult.stored;
            accountRequestsUsed += newResult.requestsUsed;
            allMessages.push(...newResult.messages);
            
            if (newResult.hasMoreData) {
              accountHasMoreData = true;
            }
          }

          // 2️⃣ Then, if we have requests left, do historical backfill (older than earliest)
          const historicalAllocation = allocatedRequests - accountRequestsUsed;
          if (historicalAllocation > 0) {
            this.logger.log(`@${account} - fetching HISTORICAL tweets (${historicalAllocation} requests allocated)`);
            const historicalResult = await this.fetchAccountTweetsHistorical(account, boundaries.earliest, historicalAllocation, true);
            accountProcessed += historicalResult.processed;
            accountStored += historicalResult.stored;
            accountRequestsUsed += historicalResult.requestsUsed;
            allMessages.push(...historicalResult.messages);
            
            if (historicalResult.hasMoreData) {
              accountHasMoreData = true;
            }
          }
        }

        // 📊 Update account status for rotation tracking
        // IMPORTANT: Only count tweets that were SUCCESSFULLY STORED, not just processed
        await this.accountRotation.updateAccountStatus(account, {
          requestsUsed: accountRequestsUsed,
          tweetsProcessed: accountStored, // ← Use STORED count as tweetsProcessed parameter
          wasCompleted: accountRequestsUsed < allocatedRequests, // Didn't use full allocation = completed
          hasMoreData: accountHasMoreData,
        });

        totalProcessed += accountProcessed;
        totalStored += accountStored;
        requestsUsed += accountRequestsUsed;

        if (accountHasMoreData) {
          hasMoreData = true;
        }

        this.logger.log(
          `✅ Completed @${account}: ${accountProcessed} processed, ${accountStored} stored, ${accountRequestsUsed}/${allocatedRequests} requests used`,
        );

      } catch (error) {
        if (error.message.includes('429')) {
          this.logger.warn(`Rate limit encountered for @${account} - marked for retry next run`);
          rateLimited = true;
          hasMoreData = true;
          
          // Update status to indicate failed attempt
          await this.accountRotation.updateAccountStatus(account, {
            requestsUsed: 0,
            tweetsProcessed: 0, 
            wasCompleted: false,
            hasMoreData: true,
          });
        } else {
          const errorMsg = `Failed to process @${account}: ${error.message}`;
          this.logger.error(errorMsg);
          allErrors.push(errorMsg);
        }
      }
    }

    const success = allErrors.length === 0;
    this.logger.log(
      `🏁 INTELLIGENT rotation completed: ${totalProcessed} processed, ${totalStored} stored, ${requestsUsed}/${REQUEST_LIMIT} requests used. RateLimited: ${rateLimited}, HasMore: ${hasMoreData}`,
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
        // Handle rate limit errors gracefully in non-rate-limited mode too
        if (error.message.includes('429')) {
          this.logger.warn(`Rate limit encountered for @${account} - skipping to next account`);
          // Don't add to errors - rate limits are expected
        } else {
          const errorMsg = `Failed to process Twitter account @${account}: ${error.message}`;
          this.logger.error(errorMsg);
          allErrors.push(errorMsg);
        }
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
        TwitterMessageTransformer.convertTweetToBaseMessage(
          tweet,
          params.account, // Use the account parameter as authorHandle
        ),
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
   * Transform message for storage - create clean payload for Qdrant
   */
  protected transformMessageForStorage(message: any): any {
    return {
      // Essential fields only - all JSON-safe
      text: String(message.text || ''),
      author: String(message.author || ''),
      authorHandle: String(message.authorHandle || '').toLowerCase(),
      createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : String(message.createdAt),
      url: String(message.url || ''),
      
      // Kaspa analysis (safe)
      kaspaRelated: Boolean(message.kaspaRelated),
      kaspaTopics: Array.isArray(message.kaspaTopics) ? message.kaspaTopics : [],
      
      // Social data (arrays only)
      hashtags: Array.isArray(message.hashtags) ? message.hashtags : [],
      mentions: Array.isArray(message.mentions) ? message.mentions : [],
      
      // Simple metadata
      language: String(message.language || 'en'),
      source: String(message.source || 'twitter'),
    };
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
        TwitterMessageTransformer.convertTweetToBaseMessage(
          tweet,
          tweet.authorHandle || 'unknown', // Extract authorHandle from tweet object
        ),
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
        TwitterMessageTransformer.convertTweetToBaseMessage(
          tweet,
          tweet.authorHandle || 'unknown', // Extract authorHandle from tweet object
        ),
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
    useBulkEmbeddings: boolean = true,
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
        TwitterMessageTransformer.convertTweetToBaseMessage(
          tweet,
          account, // Use the account parameter as authorHandle
        ),
      );

      // Filter out tweets that are older than or equal to latestIndexedDate if provided
      const filteredMessages = latestIndexedDate
        ? baseMessages.filter((msg) => msg.createdAt > latestIndexedDate)
        : baseMessages;

      messages.push(...filteredMessages);

      // Process and store the messages
      let stored = 0;
      if (filteredMessages.length > 0) {
        this.logger.log(`Processing and storing ${filteredMessages.length} messages for @${account}`);
        
        // Generate embeddings and store in Qdrant
        try {
          const tweets = [];

          if (useBulkEmbeddings && filteredMessages.length > 1) {
            // 🚀 BULK MODE: Generate all embeddings in one API call (faster & more efficient)
            this.logger.log(`Using bulk embeddings for ${filteredMessages.length} messages`);
            
            const texts = filteredMessages.map(message => message.text);
            const embeddingResponse = await this.embeddingService.generateEmbeddings({
              texts,
              model: this.etlConfig.getEmbeddingConfig().model,
              batchId: `twitter_${account}_${Date.now()}`,
            });

            if (!embeddingResponse.success || !embeddingResponse.embeddings) {
              throw new Error(`Bulk embedding generation failed: ${embeddingResponse.errors?.join(', ')}`);
            }

            // Prepare tweet data for batch storage
            for (let i = 0; i < filteredMessages.length; i++) {
              const message = filteredMessages[i];
              const embedding = embeddingResponse.embeddings[i];
              
              if (!embedding) {
                throw new Error(`No embedding generated for message ${message.id}`);
              }

              tweets.push({
                tweetId: message.id,
                vector: embedding.vector,
                metadata: this.transformMessageForStorage(message),
              });
            }
          } else {
            // 🔄 SINGLE MODE: Generate embeddings individually (useful for small batches or debugging)
            this.logger.log(`Using single embeddings for ${filteredMessages.length} messages`);
            
            for (const message of filteredMessages) {
              // Generate embedding for the message
              const embedding = await this.embeddingService.generateSingleEmbedding(message.text);
              
              // Transform for storage
              const transformedMessage = this.transformMessageForStorage(message);
              
              // Prepare tweet data for batch storage
              tweets.push({
                tweetId: message.id,
                vector: embedding,
                metadata: transformedMessage,
              });
            }
          }
          
          // Store tweets one by one instead of bulk to identify problematic tweets
          if (tweets.length > 0) {
            let successCount = 0;
            const errors: string[] = [];

            this.logger.log(`📝 Storing ${tweets.length} tweets individually for @${account}...`);

            for (let i = 0; i < tweets.length; i++) {
              const tweet = tweets[i];
              try {
                const result = await this.qdrantRepository.storeTweetVectorsBatch(
                  [tweet], // Single tweet
                  this.config.collectionName,
                );
                
                if (result.success && result.stored > 0) {
                  successCount++;
                } else {
                  errors.push(`Tweet ${i + 1}/${tweets.length}: ${result.errors.join(', ')}`);
                  this.logger.warn(`❌ Tweet ${i + 1}/${tweets.length} failed to store:`, result.errors);
                }
              } catch (error) {
                errors.push(`Tweet ${i + 1}/${tweets.length}: ${error.message}`);
                this.logger.error(`❌ Tweet ${i + 1}/${tweets.length} failed with error: ${error.message}`);
                
                // Log the problematic tweet data for debugging
                this.logger.debug(`🔍 Problematic tweet data:`, {
                  tweetId: tweet.tweetId,
                  vectorLength: tweet.vector.length,
                  metadataKeys: Object.keys(tweet.metadata),
                  text: tweet.metadata.text?.substring(0, 100) + '...',
                });
              }

              // Progress logging every 100 tweets
              if ((i + 1) % 100 === 0) {
                this.logger.log(`📝 Progress: ${i + 1}/${tweets.length} processed, ${successCount} successful`);
              }
            }

            stored = successCount;
            
            if (errors.length > 0) {
              this.logger.warn(`❌ ${errors.length}/${tweets.length} tweets failed to store for @${account}`);
              this.logger.warn(`First few errors:`, errors.slice(0, 3));
            } else {
              this.logger.log(`✅ All ${successCount} tweets stored successfully for @${account}`);
            }
          }
          
          this.logger.log(`Successfully stored ${stored}/${filteredMessages.length} messages for @${account}`);
        } catch (error) {
          this.logger.error(`Failed to store messages for @${account}: ${error.message}`);
        }
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
   * Generate embedding for a single tweet (utility method)
   * Useful for real-time processing, testing, or single tweet queries
   */
  async generateSingleTweetEmbedding(tweetText: string): Promise<number[]> {
    return await this.embeddingService.generateSingleEmbedding(tweetText);
  }

  /**
   * Process tweets with configurable embedding mode
   * @param tweets - Array of tweets to process
   * @param useBulkEmbeddings - Whether to use bulk embedding generation (default: true)
   * @returns Processed tweets with embeddings
   */
  async processTweetsWithEmbeddings(
    tweets: BaseMessage[], 
    useBulkEmbeddings: boolean = true
  ): Promise<Array<{ tweetId: string; vector: number[]; metadata: any }>> {
    const processedTweets = [];

    if (useBulkEmbeddings && tweets.length > 1) {
      // Bulk processing for efficiency
      const texts = tweets.map(tweet => tweet.text);
      const embeddingResponse = await this.embeddingService.generateEmbeddings({
        texts,
        model: this.etlConfig.getEmbeddingConfig().model,
        batchId: `manual_${Date.now()}`,
      });

      if (!embeddingResponse.success || !embeddingResponse.embeddings) {
        throw new Error(`Bulk embedding generation failed: ${embeddingResponse.errors?.join(', ')}`);
      }

      for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i];
        const embedding = embeddingResponse.embeddings[i];
        
        if (!embedding) {
          throw new Error(`No embedding generated for tweet ${tweet.id}`);
        }

        processedTweets.push({
          tweetId: tweet.id,
          vector: embedding.vector,
          metadata: this.transformMessageForStorage(tweet),
        });
      }
    } else {
      // Single processing for small batches or specific use cases
      for (const tweet of tweets) {
        const embedding = await this.embeddingService.generateSingleEmbedding(tweet.text);
        processedTweets.push({
          tweetId: tweet.id,
          vector: embedding,
          metadata: this.transformMessageForStorage(tweet),
        });
      }
    }

    return processedTweets;
  }

  /**
   * Fetch account tweets for historical backfill (older than earliest)
   * Used for backward processing
   */
  private async fetchAccountTweetsHistorical(
    account: string,
    earliestIndexedDate: Date | undefined,
    maxRequests: number,
    useBulkEmbeddings: boolean = true,
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
