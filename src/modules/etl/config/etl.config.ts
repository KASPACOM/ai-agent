import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../core/modules/config/app-config.service';
import { EmbeddingModel, ETLPriority } from '../models/etl.enums';
import { EmbeddingConfig } from '../models/embedding.model';

/**
 * ETL Configuration Service
 * 
 * Centralized configuration for all ETL operations
 */
@Injectable()
export class EtlConfigService {
  constructor(private readonly appConfig: AppConfigService) {}

  /**
   * Get Twitter accounts to monitor
   */
  getTwitterAccounts(): string[] {
    return this.appConfig.getTwitterAccountsConfig;
  }

  /**
   * Get Twitter authentication username
   */
  getTwitterUsername(): string {
    return this.appConfig.getTwitterUsername;
  }

  /**
   * Get Twitter authentication password
   */
  getTwitterPassword(): string {
    return this.appConfig.getTwitterPassword;
  }

  /**
   * Get Twitter authentication email
   */
  getTwitterEmail(): string {
    return this.appConfig.getTwitterEmail;
  }

  /**
   * Get Twitter API Bearer Token
   */
  getTwitterBearerToken(): string {
    return this.appConfig.getTwitterBearerToken;
  }

  /**
   * Get ETL scheduling configuration
   */
  getScheduleInterval(): string {
    return this.appConfig.getEtlScheduleInterval;
  }

  /**
   * Check if ETL is enabled
   */
  isEtlEnabled(): boolean {
    return this.appConfig.getEtlEnabled;
  }

  /**
   * Get batch size for processing
   */
  getBatchSize(): number {
    return this.appConfig.getEtlBatchSize;
  }

  /**
   * Get maximum days to look back for historical data
   */
  getMaxHistoricalDays(): number {
    return this.appConfig.getEtlMaxHistoricalDays;
  }

  /**
   * Get embedding configuration
   */
  getEmbeddingConfig(): EmbeddingConfig {
    return {
      model: this.appConfig.getOpenAiEmbeddingModel as EmbeddingModel,
      dimensions: this.appConfig.getOpenAiEmbeddingDimensions,
      maxBatchSize: 100,
      maxTokensPerRequest: 8000,
      retryAttempts: 3,
      retryDelay: 1000,
      rateLimitPerMinute: 60,
      normalizeVectors: true,
    };
  }

  /**
   * Get OpenAI API key
   */
  getOpenAiApiKey(): string {
    return this.appConfig.getOpenAiApiKey;
  }

  /**
   * Get processing priorities
   */
  getProcessingPriorities(): Record<string, ETLPriority> {
    return {
      live_tweets: ETLPriority.HIGH,
      historical_tweets: ETLPriority.MEDIUM,
      embeddings: ETLPriority.HIGH,
      vector_storage: ETLPriority.MEDIUM,
      health_checks: ETLPriority.LOW,
    };
  }

  /**
   * Get rate limiting configuration
   */
  getRateLimits(): Record<string, number> {
    return {
      tweetsPerMinute: 300,
      embeddingsPerMinute: 60,
      vectorStorePerMinute: 100,
      apiCallsPerMinute: 50,
    };
  }

  /**
   * Get retry configuration
   */
  getRetryConfig(): Record<string, { attempts: number; delay: number }> {
    return {
      twitter_scraping: { attempts: 3, delay: 2000 },
      embedding_generation: { attempts: 5, delay: 1000 },
      vector_storage: { attempts: 3, delay: 1500 },
      health_checks: { attempts: 2, delay: 5000 },
    };
  }

  /**
   * Get timeout configuration (in milliseconds)
   */
  getTimeouts(): Record<string, number> {
    return {
      twitter_scraping: 30000,
      embedding_generation: 60000,
      vector_storage: 15000,
      health_checks: 10000,
    };
  }

  /**
   * Get Kaspa-related keywords for content analysis
   */
  getKaspaKeywords(): string[] {
    return [
      'kaspa',
      'kas',
      'kasplex',
      'kasparebro',
      'ghostdag',
      'blockdag',
      'kaspa mining',
      'kaspa wallet',
      'kaspa defi',
      'kaspa ecosystem',
      'kaspa tokens',
      'kaspa nft',
      'kaspa dex',
      'kaspa swap',
      'kaspa bridge',
      'kaspa staking',
      'kaspa validator',
      'kaspa node',
      'kaspa network',
      'kaspa blockchain',
    ];
  }

  /**
   * Get content filtering configuration
   */
  getContentFilters(): Record<string, any> {
    return {
      minTextLength: 10,
      maxTextLength: 5000,
      excludeRetweets: false,
      excludeReplies: false,
      requireKaspaRelevance: false,
      minEngagement: 0,
      languageFilter: ['en'], // Only English for now
      spamKeywords: ['spam', 'scam', 'fake', 'phishing'],
    };
  }
} 