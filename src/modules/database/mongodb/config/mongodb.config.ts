import { MongooseModuleOptions } from '@nestjs/mongoose';

/**
 * MongoDB Configuration
 *
 * Provides connection configuration for MongoDB.
 * Following DEVELOPMENT_RULES.md: All configuration through environment variables.
 */
export class MongoDbConfig {
  /**
   * Get MongoDB connection options
   */
  static getConnectionOptions(uri: string): MongooseModuleOptions {
    return {
      uri,
      retryAttempts: 5,
      retryDelay: 1000,
      // Connection pool is handled by Mongoose defaults
      // which are appropriate for most use cases
    };
  }

  /**
   * Collection names
   */
  static readonly COLLECTIONS = {
    TWITTER_TWEETS: 'twitter_tweets',
    TWITTER_ACCOUNTS: 'twitter_accounts',
    TELEGRAM_MESSAGES: 'telegram_messages',
    TELEGRAM_CHANNELS: 'telegram_channels',
  } as const;
}

