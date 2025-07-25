import { Injectable, Logger } from '@nestjs/common';
import { BaseIndexerService, IndexerConfig } from '../../shared/services/base-indexer.service';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { MasterDocument, ProcessingStatus } from '../../shared/models/master-document.model';
import { MessageSource } from '../../shared/models/message-source.enum';
import { IndexingResult } from '../../shared/models/indexer-result.model';

// Import existing ETL services for Twitter functionality
import { TwitterApiService } from '../../../integrations/twitter/twitter-api.service';
import { TwitterMessageTransformer } from '../../../etl/transformers/twitter-message.transformer';
import { AccountRotationService } from './account-rotation.service';

/**
 * Twitter Indexer Service
 * 
 * Main indexing service for Twitter accounts and tweets.
 * Extends BaseIndexerService to provide consistent patterns across all indexers.
 * 
 * Features:
 * - Processes configured Twitter accounts with rate limit awareness
 * - Uses sophisticated account rotation strategy
 * - Integrates with existing AccountRotationService for history tracking
 * - Transforms messages to MasterDocument format for unified storage
 * - Respects Twitter API rate limits (15-minute windows)
 * - Handles both new tweets and historical backfilling
 */
@Injectable()
export class TwitterIndexerService extends BaseIndexerService {
  protected readonly logger = new Logger(TwitterIndexerService.name);

  constructor(
    unifiedStorage: UnifiedStorageService,
    private readonly config: IndexerConfigService,
    private readonly twitterApi: TwitterApiService,
    private readonly twitterTransformer: TwitterMessageTransformer,
    private readonly accountRotation: AccountRotationService,
  ) {
    super(unifiedStorage);
  }

  /**
   * Main indexing execution logic
   */
  protected async executeIndexingProcess(): Promise<IndexingResult> {
    const startTime = new Date();
    let totalProcessed = 0;
    let totalEmbedded = 0;
    let totalStored = 0;
    const errors: string[] = [];
    let rateLimited = false;
    let hasMoreData = false;

    try {
      this.logger.log('Starting Twitter indexing process');

      // Get configured request limit per run
      const requestLimit = this.config.getTwitterRequestLimit();
      
      // Select accounts to process with request budget allocation
      const accountsToProcess = await this.accountRotation.selectAccountsForProcessing(requestLimit);
      
      if (accountsToProcess.length === 0) {
        this.logger.log('No Twitter accounts need processing at this time');
        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          processingTime: Date.now() - startTime.getTime(),
          startTime,
          endTime: new Date(),
          rateLimited: false,
          hasMoreData: false,
        };
      }

      this.logger.log(`Processing ${accountsToProcess.length} Twitter accounts with ${requestLimit} total requests`);

      // Process each selected account
      for (const accountWithBudget of accountsToProcess) {
        try {
          const accountResult = await this.processAccount(accountWithBudget);
          
          totalProcessed += accountResult.processed;
          totalEmbedded += accountResult.embedded;
          totalStored += accountResult.stored;
          errors.push(...accountResult.errors);
          
          if (accountResult.rateLimited) {
            rateLimited = true;
          }
          if (accountResult.hasMoreData) {
            hasMoreData = true;
          }

          // Update account status with results
          await this.accountRotation.updateAccountStatus(
            accountWithBudget.account,
            {
              lastSync: new Date(),
              messagesIndexed: accountResult.processed,
              hasMoreData: accountResult.hasMoreData,
              errors: accountResult.errors,
            }
          );

          // Add processing delay between accounts to respect API limits
          await this.sleep(this.getIndexerConfig().processingDelayMs);

        } catch (error) {
          const errorMsg = `Failed to process account ${accountWithBudget.account}: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);

          // Update account status with error
          await this.accountRotation.updateAccountStatus(
            accountWithBudget.account,
            {
              lastSync: new Date(),
              errors: [error.message],
            }
          );
        }
      }

      const endTime = new Date();
      const success = errors.length === 0 || totalProcessed > 0;

      this.logger.log('Twitter indexing completed', {
        accounts: accountsToProcess.length,
        processed: totalProcessed,
        embedded: totalEmbedded,
        stored: totalStored,
        errors: errors.length,
        rateLimited,
        hasMoreData,
        processingTimeMs: endTime.getTime() - startTime.getTime(),
      });

      return {
        success,
        processed: totalProcessed,
        embedded: totalEmbedded,
        stored: totalStored,
        errors,
        processingTime: endTime.getTime() - startTime.getTime(),
        startTime,
        endTime,
        rateLimited,
        hasMoreData,
      };

    } catch (error) {
      this.logger.error(`Twitter indexing failed: ${error.message}`, error.stack);
      
      return {
        success: false,
        processed: totalProcessed,
        embedded: totalEmbedded,
        stored: totalStored,
        errors: [...errors, error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
        rateLimited,
        hasMoreData,
      };
    }
  }

  /**
   * Process a single Twitter account with allocated request budget
   */
  private async processAccount(accountWithBudget: any): Promise<IndexingResult & { rateLimited: boolean; hasMoreData: boolean }> {
    const startTime = new Date();
    let processed = 0;
    let embedded = 0;
    let stored = 0;
    const errors: string[] = [];
    let rateLimited = false;
    let hasMoreData = false;

    try {
      this.logger.log(`Processing Twitter account: ${accountWithBudget.account} (budget: ${accountWithBudget.requestBudget} requests)`);

      // Get latest indexed date for this account
      const latestDate = await this.unifiedStorage.getLatestMessageDate(
        MessageSource.TWITTER,
        accountWithBudget.account
      );

      // Fetch tweets from Twitter API using existing service
      const tweets = await this.twitterApi.fetchAccountTweets(
        accountWithBudget.account,
        latestDate
      );

      if (tweets.length === 0) {
        this.logger.debug(`No new tweets for account: ${accountWithBudget.account}`);
        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          processingTime: Date.now() - startTime.getTime(),
          startTime,
          endTime: new Date(),
          rateLimited: false,
          hasMoreData: false,
        };
      }

      this.logger.log(`Processing ${tweets.length} tweets from @${accountWithBudget.account}`);

      // Transform tweets to MasterDocument format
      const masterDocuments: MasterDocument[] = [];
      for (const tweet of tweets) {
        try {
          // Convert to BaseMessage first using existing transformer
          const baseMessage = TwitterMessageTransformer.convertTweetToBaseMessage(
            tweet,
            accountWithBudget.account
          );
          
          // Convert to MasterDocument
          const masterDoc = this.transformToMasterDocument(baseMessage, accountWithBudget.account);
          masterDocuments.push(masterDoc);
          processed++;

        } catch (error) {
          const errorMsg = `Failed to transform tweet ${tweet.id}: ${error.message}`;
          this.logger.warn(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Store in unified collection
      if (masterDocuments.length > 0) {
        const storageResult = await this.unifiedStorage.storeBatch(masterDocuments);
        stored = storageResult.stored;
        embedded = storageResult.stored; // Assume embedding happened during storage
        errors.push(...storageResult.errors);
      }

      // Check if we hit rate limits or have more data
      // This would normally be determined by the API response headers
      const requestsUsed = Math.max(1, Math.ceil(tweets.length / 100));
      rateLimited = requestsUsed >= accountWithBudget.requestBudget;
      hasMoreData = tweets.length > 0 && tweets.length >= 200; // Twitter pagination threshold

      return {
        success: errors.length === 0 || stored > 0,
        processed,
        embedded,
        stored,
        errors,
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
        rateLimited,
        hasMoreData,
      };

    } catch (error) {
      this.logger.error(`Failed to process account ${accountWithBudget.account}: ${error.message}`);
      
      return {
        success: false,
        processed,
        embedded,
        stored,
        errors: [...errors, error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
        rateLimited: false,
        hasMoreData: false,
      };
    }
  }

  /**
   * Transform BaseMessage to MasterDocument format
   */
  private transformToMasterDocument(baseMessage: any, accountHandle: string): MasterDocument {
    const now = new Date().toISOString();

    return {
      id: baseMessage.id,
      source: MessageSource.TWITTER,
      text: baseMessage.text || '',
      author: baseMessage.author || accountHandle,
      authorHandle: baseMessage.authorHandle || accountHandle.toLowerCase(),
      createdAt: baseMessage.createdAt instanceof Date ? baseMessage.createdAt.toISOString() : baseMessage.createdAt,
      url: baseMessage.url || `https://twitter.com/${accountHandle}/status/${baseMessage.id.replace('twitter_', '')}`,
      processingStatus: ProcessingStatus.PROCESSED,
      processedAt: now,
      kaspaRelated: baseMessage.kaspaRelated || false,
      kaspaTopics: baseMessage.kaspaTopics || [],
      hashtags: baseMessage.hashtags || [],
      mentions: baseMessage.mentions || [],
      links: baseMessage.links || [],
      language: baseMessage.language || 'unknown',
      errors: [],
      retryCount: 0,

      // Twitter-specific fields
      twitterRetweetCount: baseMessage.retweets || 0,
      twitterLikeCount: baseMessage.likes || 0,
      twitterReplyCount: baseMessage.replies || 0,
      twitterIsRetweet: baseMessage.isRetweet || false,

      // Fields that will be populated during storage
      vector: undefined,
      vectorDimensions: undefined,
      embeddedAt: undefined,
      storedAt: undefined,
    };
  }

  /**
   * Get indexer configuration
   */
  protected getIndexerConfig(): IndexerConfig {
    return {
      serviceName: 'TwitterIndexer',
      source: MessageSource.TWITTER,
      batchSize: this.config.getDefaultBatchSize(),
      maxRetries: this.config.getMaxRetries(),
      processingDelayMs: this.config.getDefaultProcessingDelayMs(),
    };
  }
} 