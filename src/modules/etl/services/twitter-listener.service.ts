import { Injectable, Logger } from '@nestjs/common';
import { Scraper } from '@the-convocation/twitter-scraper';
import { Tweet } from '../models/tweet.model';
import { TweetSource, TweetProcessingStatus } from '../models/etl.enums';
import { EtlConfigService } from '../config/etl.config';

/**
 * Twitter Listener Service
 *
 * Handles live tweet monitoring and polling using @the-convocation/twitter-scraper
 * Tracks latest tweets from monitored accounts and provides real-time updates
 */
@Injectable()
export class TwitterListenerService {
  private readonly logger = new Logger(TwitterListenerService.name);
  private readonly scraper: Scraper;
  private readonly lastTweetIds = new Map<string, string>();
  private readonly monitoringStats = {
    totalPolled: 0,
    errors: [] as string[],
    isRunning: false,
    lastPoll: null as Date | null,
  };

  constructor(private readonly etlConfig: EtlConfigService) {
    // Initialize the scraper for live monitoring
    this.scraper = new Scraper();
    this.logger.log('TwitterListenerService initialized');

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
          'Twitter authentication credentials not provided. Listener may not work properly.',
        );
        return;
      }

      this.logger.log('Authenticating Twitter listener...');
      await this.scraper.login(username, password, email);
      this.logger.log('Twitter listener authentication successful');
    } catch (error) {
      this.logger.error(
        `Twitter listener authentication failed: ${error.message}`,
      );
      // Store the error but don't throw - let individual polling attempts handle it
      this.monitoringStats.errors.push(
        `Authentication failed: ${error.message}`,
      );
    }
  }

  /**
   * Poll for new tweets from monitored accounts
   * Checks each account for new tweets since last poll
   */
  async pollNewTweets(): Promise<Tweet[]> {
    this.logger.log('Starting new tweet polling cycle');

    this.monitoringStats.isRunning = true;
    this.monitoringStats.lastPoll = new Date();

    const accounts = this.etlConfig.getTwitterAccounts();
    const newTweets: Tweet[] = [];

    if (accounts.length === 0) {
      this.logger.warn('No Twitter accounts configured for monitoring');
      this.monitoringStats.isRunning = false;
      return [];
    }

    this.logger.log(
      `Polling ${accounts.length} accounts: ${accounts.join(', ')}`,
    );

    try {
      for (const account of accounts) {
        try {
          const accountTweets = await this.checkAccountForNewTweets(account);
          newTweets.push(...accountTweets);

          if (accountTweets.length > 0) {
            this.logger.log(
              `Found ${accountTweets.length} new tweets from ${account}`,
            );
          }
        } catch (error) {
          const errorMsg = `Failed to poll account ${account}: ${error.message}`;
          this.logger.error(errorMsg);
          this.monitoringStats.errors.push(errorMsg);
        }
      }

      this.monitoringStats.totalPolled += newTweets.length;

      if (newTweets.length > 0) {
        this.logger.log(
          `Polling completed. Found ${newTweets.length} new tweets`,
        );
      } else {
        this.logger.log('Polling completed. No new tweets found');
      }

      return newTweets;
    } catch (error) {
      this.logger.error(`Polling failed: ${error.message}`);
      this.monitoringStats.errors.push(`Polling failed: ${error.message}`);
      return [];
    } finally {
      this.monitoringStats.isRunning = false;
    }
  }

  /**
   * Check for new tweets from a specific account
   * Compares against last known tweet ID to detect new content
   */
  async checkAccountForNewTweets(account: string): Promise<Tweet[]> {
    this.logger.log(`Checking account for new tweets: ${account}`);

    const newTweets: Tweet[] = [];
    const lastKnownId = this.getLastTweetId(account);

    try {
      // Get the latest tweets from the account
      const latestTweet = await this.scraper.getLatestTweet(account);

      if (!latestTweet) {
        this.logger.log(`No tweets found for account: ${account}`);
        return [];
      }

      // Check if this is a new tweet
      const latestTweetId = latestTweet.id || (latestTweet as any).id_str;

      if (lastKnownId && latestTweetId === lastKnownId) {
        this.logger.log(
          `No new tweets for ${account} (latest ID: ${latestTweetId})`,
        );
        return [];
      }

      // If we have a new tweet, get recent tweets to catch any we might have missed
      const recentTweets = await this.getRecentTweets(account, 10);

      for (const tweet of recentTweets) {
        const tweetId = tweet.id || tweet.id_str;

        // Stop when we reach the last known tweet
        if (lastKnownId && tweetId === lastKnownId) {
          break;
        }

        // Transform and add the new tweet
        const transformedTweet = this.transformScrapedTweet(tweet, account);
        newTweets.push(transformedTweet);
      }

      // Update the last known tweet ID
      if (newTweets.length > 0) {
        const mostRecentTweet = newTweets[0];
        this.updateLastTweetId(account, mostRecentTweet.id);
        this.logger.log(
          `Updated last tweet ID for ${account}: ${mostRecentTweet.id}`,
        );
      }

      return newTweets;
    } catch (error) {
      this.logger.error(`Failed to check account ${account}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get recent tweets from an account
   */
  private async getRecentTweets(
    account: string,
    count: number = 10,
  ): Promise<any[]> {
    const tweets: any[] = [];

    try {
      const tweetIterator = this.scraper.getTweets(account, count);

      for await (const tweet of tweetIterator) {
        tweets.push(tweet);
        if (tweets.length >= count) break;
      }

      return tweets;
    } catch (error) {
      this.logger.error(
        `Failed to get recent tweets for ${account}: ${error.message}`,
      );
      return [];
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
      source: TweetSource.LIVE,
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
   * Update the last known tweet ID for an account
   */
  updateLastTweetId(account: string, tweetId: string): void {
    this.lastTweetIds.set(account, tweetId);
    this.logger.log(`Updated last tweet ID for ${account}: ${tweetId}`);
  }

  /**
   * Get the last known tweet ID for an account
   */
  getLastTweetId(account: string): string | undefined {
    return this.lastTweetIds.get(account);
  }

  /**
   * Initialize tracking for a new account
   */
  async initializeAccount(account: string): Promise<void> {
    this.logger.log(`Initializing tracking for account: ${account}`);

    try {
      const latestTweet = await this.scraper.getLatestTweet(account);

      if (latestTweet) {
        const tweetId = latestTweet.id || (latestTweet as any).id_str;
        this.updateLastTweetId(account, tweetId);
        this.logger.log(
          `Initialized ${account} with latest tweet ID: ${tweetId}`,
        );
      } else {
        this.logger.warn(`No tweets found for account: ${account}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to initialize account ${account}: ${error.message}`,
      );
    }
  }

  /**
   * Initialize tracking for all configured accounts
   */
  async initializeAllAccounts(): Promise<void> {
    const accounts = this.etlConfig.getTwitterAccounts();
    this.logger.log(`Initializing tracking for ${accounts.length} accounts`);

    for (const account of accounts) {
      await this.initializeAccount(account);
    }

    this.logger.log('Account initialization completed');
  }

  /**
   * Get listener status and statistics
   */
  async getListenerStatus(): Promise<{
    isRunning: boolean;
    monitoredAccounts: string[];
    lastPoll?: Date;
    totalPolled: number;
    errors: string[];
    lastTweetIds: Record<string, string>;
  }> {
    const lastTweetIds: Record<string, string> = {};
    for (const [account, tweetId] of this.lastTweetIds.entries()) {
      lastTweetIds[account] = tweetId;
    }

    return {
      isRunning: this.monitoringStats.isRunning,
      monitoredAccounts: this.etlConfig.getTwitterAccounts(),
      lastPoll: this.monitoringStats.lastPoll,
      totalPolled: this.monitoringStats.totalPolled,
      errors: [...this.monitoringStats.errors], // Return a copy
      lastTweetIds,
    };
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.monitoringStats.errors = [];
    this.logger.log('Error history cleared');
  }

  /**
   * Reset monitoring statistics
   */
  resetStats(): void {
    this.monitoringStats.totalPolled = 0;
    this.monitoringStats.errors = [];
    this.monitoringStats.lastPoll = null;
    this.logger.log('Monitoring statistics reset');
  }
}
