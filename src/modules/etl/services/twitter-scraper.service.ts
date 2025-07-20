import { Injectable, Logger } from '@nestjs/common';
import { Scraper } from '@the-convocation/twitter-scraper';
import { Tweet, TweetBatch } from '../models/tweet.model';
import { TweetSource, TweetProcessingStatus } from '../models/etl.enums';
import { EtlConfigService } from '../config/etl.config';

/**
 * Twitter Scraper Service
 *
 * Handles historical tweet collection using @the-convocation/twitter-scraper
 * Provides methods for scraping tweets from specific accounts with proper error handling
 */
@Injectable()
export class TwitterScraperService {
  private readonly logger = new Logger(TwitterScraperService.name);
  private readonly scraper: Scraper;
  private readonly scrapingStats = {
    totalScraped: 0,
    errors: [] as string[],
    isRunning: false,
    lastRun: null as Date | null,
  };

  constructor(private readonly etlConfig: EtlConfigService) {
    // Initialize the scraper with basic configuration
    this.scraper = new Scraper();
    this.logger.log('TwitterScraperService initialized');

    // Initialize authentication
    this.initializeAuthentication();
  }

  /**
   * Initialize Twitter authentication
   */
  private async initializeAuthentication(): Promise<void> {
    try {
      const username = this.etlConfig.getTwitterUsername();
      const password = this.etlConfig.getTwitterPassword();
      const email = this.etlConfig.getTwitterEmail();

      if (!username || !password) {
        this.logger.warn(
          'Twitter authentication credentials not provided. Scraper may not work properly.',
        );
        return;
      }

      this.logger.log('Authenticating Twitter scraper...');
      await this.scraper.login(username, password, email);
      this.logger.log('Twitter scraper authentication successful');
    } catch (error) {
      this.logger.error(
        `Twitter scraper authentication failed: ${error.message}`,
      );
      // Store the error but don't throw - let individual scraping attempts handle it
      this.scrapingStats.errors.push(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Scrape historical tweets from specified accounts
   * Uses @the-convocation/twitter-scraper to collect tweets
   */
  async scrapeHistoricalTweets(
    accounts: string[],
    maxDays: number = 30,
    startFromDate?: Date,
  ): Promise<TweetBatch> {
    this.logger.log(
      `Starting historical scrape for ${accounts.length} accounts (max ${maxDays} days)`,
    );

    this.scrapingStats.isRunning = true;
    this.scrapingStats.lastRun = new Date();

    const batchId = `historical_${Date.now()}`;
    const allTweets: Tweet[] = [];
    const cutoffDate =
      startFromDate || new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);

    try {
      for (const account of accounts) {
        this.logger.log(`Scraping tweets from account: ${account}`);

        try {
          const accountTweets = await this.scrapeAccountTweets(
            account,
            maxDays,
            startFromDate,
          );
          allTweets.push(...accountTweets);

          this.logger.log(
            `Successfully scraped ${accountTweets.length} tweets from ${account}`,
          );
        } catch (error) {
          const errorMsg = `Failed to scrape account ${account}: ${error.message}`;
          this.logger.error(errorMsg);
          this.scrapingStats.errors.push(errorMsg);
        }
      }

      this.scrapingStats.totalScraped += allTweets.length;
      this.logger.log(
        `Historical scrape completed. Total tweets: ${allTweets.length}`,
      );

      return {
        id: batchId,
        tweets: allTweets,
        source: TweetSource.HISTORICAL,
        createdAt: new Date(),
        processedAt: new Date(),
        status: TweetProcessingStatus.SCRAPED,
        totalCount: allTweets.length,
        processedCount: allTweets.length,
        errorCount: this.scrapingStats.errors.length,
      };
    } catch (error) {
      this.logger.error(`Historical scrape failed: ${error.message}`);
      this.scrapingStats.errors.push(
        `Historical scrape failed: ${error.message}`,
      );

      return {
        id: batchId,
        tweets: allTweets,
        source: TweetSource.HISTORICAL,
        createdAt: new Date(),
        processedAt: new Date(),
        status: TweetProcessingStatus.FAILED,
        totalCount: 0,
        processedCount: allTweets.length,
        errorCount: this.scrapingStats.errors.length,
      };
    } finally {
      this.scrapingStats.isRunning = false;
    }
  }

  /**
   * Scrape tweets from a specific account
   * Uses AsyncGenerator to handle pagination and collect all tweets within date range
   */
  async scrapeAccountTweets(
    account: string,
    maxDays: number = 30,
    startFromDate?: Date,
  ): Promise<Tweet[]> {
    this.logger.log(`Scraping tweets from account: ${account}`);

    const tweets: Tweet[] = [];
    const cutoffDate =
      startFromDate || new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);
    const maxTweets = this.etlConfig.getBatchSize(); // Use configured batch size

    try {
      // Use AsyncGenerator to iterate through tweets
      const tweetIterator = this.scraper.getTweets(account, maxTweets);

      for await (const scrapedTweet of tweetIterator) {
        // Check if tweet is within our date range
        const tweetDate = new Date(
          scrapedTweet.timeParsed || scrapedTweet.timestamp,
        );

        // If we're using startFromDate (latest tweet in DB), we want to skip tweets
        // that are older than or equal to that date
        if (startFromDate && tweetDate <= cutoffDate) {
          this.logger.log(
            `Reached latest tweet in database for ${account}, stopping scrape`,
          );
          break;
        }

        // If we're using maxDays fallback, stop when we reach the cutoff date
        if (!startFromDate && tweetDate < cutoffDate) {
          this.logger.log(
            `Reached cutoff date for ${account}, stopping scrape`,
          );
          break;
        }

        // Transform the scraped tweet to our Tweet interface
        const tweet = this.transformScrapedTweet(scrapedTweet, account);
        tweets.push(tweet);

        // Log progress every 10 tweets
        if (tweets.length % 10 === 0) {
          this.logger.log(`Scraped ${tweets.length} tweets from ${account}`);
        }
      }

      this.logger.log(
        `Completed scraping ${tweets.length} tweets from ${account}`,
      );
      return tweets;
    } catch (error) {
      this.logger.error(
        `Failed to scrape account ${account}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Transform scraped tweet data to our Tweet interface
   */
  private transformScrapedTweet(scrapedTweet: any, account: string): Tweet {
    const now = new Date();

    return {
      // Basic Tweet Data
      id:
        scrapedTweet.id || scrapedTweet.id_str || `${account}_${now.getTime()}`,
      text: scrapedTweet.text || '',
      author: scrapedTweet.name || account,
      authorHandle: scrapedTweet.username || account,
      createdAt: new Date(
        scrapedTweet.timeParsed || scrapedTweet.timestamp || now,
      ),
      url:
        scrapedTweet.permanentUrl ||
        `https://twitter.com/${account}/status/${scrapedTweet.id}`,

      // Engagement Metrics
      likes: this.parseNumber(scrapedTweet.likes),
      retweets: this.parseNumber(scrapedTweet.retweets),
      replies: this.parseNumber(scrapedTweet.replies),
      views: this.parseNumber(scrapedTweet.views),

      // Processing Metadata
      source: TweetSource.HISTORICAL,
      processingStatus: TweetProcessingStatus.SCRAPED,
      processedAt: now,

      // Content Analysis
      hashtags: this.extractHashtags(scrapedTweet.text || ''),
      mentions: this.extractMentions(scrapedTweet.text || ''),
      links: this.extractLinks(scrapedTweet.text || ''),
      language: scrapedTweet.lang || 'en',

      // Kaspa-specific Tags
      kaspaRelated: this.isKaspaRelated(scrapedTweet.text || ''),
      kaspaTopics: this.extractKaspaTopics(scrapedTweet.text || ''),

      // Error Handling
      errors: [],
      retryCount: 0,
    };
  }

  /**
   * Parse numeric values from scraped data
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value.replace(/[^\d]/g, ''), 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * Extract hashtags from tweet text
   */
  private extractHashtags(text: string): string[] {
    const hashtags = text.match(/#\w+/g) || [];
    return hashtags.map((tag) => tag.toLowerCase());
  }

  /**
   * Extract mentions from tweet text
   */
  private extractMentions(text: string): string[] {
    const mentions = text.match(/@\w+/g) || [];
    return mentions.map((mention) => mention.toLowerCase());
  }

  /**
   * Extract links from tweet text
   */
  private extractLinks(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
  }

  /**
   * Check if tweet is Kaspa-related
   */
  private isKaspaRelated(text: string): boolean {
    const kaspaKeywords = [
      'kaspa',
      'kas',
      '$kas',
      'ghostdag',
      'blockdag',
      'kaspad',
    ];
    const lowerText = text.toLowerCase();
    return kaspaKeywords.some((keyword) => lowerText.includes(keyword));
  }

  /**
   * Extract Kaspa-specific topics from tweet text
   */
  private extractKaspaTopics(text: string): string[] {
    const topics: string[] = [];
    const lowerText = text.toLowerCase();

    const topicMap = {
      mining: ['mining', 'miner', 'hashrate', 'pool'],
      development: ['development', 'dev', 'code', 'github', 'update'],
      trading: ['trading', 'price', 'exchange', 'buy', 'sell'],
      technology: ['ghostdag', 'blockdag', 'consensus', 'protocol'],
      community: ['community', 'event', 'meetup', 'announcement'],
    };

    Object.entries(topicMap).forEach(([topic, keywords]) => {
      if (keywords.some((keyword) => lowerText.includes(keyword))) {
        topics.push(topic);
      }
    });

    return topics;
  }

  /**
   * Get scraping status and statistics
   */
  async getScrapingStatus(): Promise<{
    isRunning: boolean;
    lastRun?: Date;
    totalScraped: number;
    errors: string[];
  }> {
    return {
      isRunning: this.scrapingStats.isRunning,
      lastRun: this.scrapingStats.lastRun,
      totalScraped: this.scrapingStats.totalScraped,
      errors: [...this.scrapingStats.errors], // Return a copy
    };
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.scrapingStats.errors = [];
    this.logger.log('Error history cleared');
  }

  /**
   * Reset scraping statistics
   */
  resetStats(): void {
    this.scrapingStats.totalScraped = 0;
    this.scrapingStats.errors = [];
    this.scrapingStats.lastRun = null;
    this.logger.log('Scraping statistics reset');
  }
}
