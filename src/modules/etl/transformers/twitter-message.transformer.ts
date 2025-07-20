import { BaseMessageTransformer } from './base-message.transformer';
import { BaseMessage } from '../models/base-indexer.model';
import { Tweet } from '../models/tweet.model';
import { TweetProcessingStatus, TweetSource } from '../models/etl.enums';
import { TweetV2, UserV2 } from 'twitter-api-v2';

/**
 * Twitter Message Transformer
 *
 * Handles Twitter-specific message transformations
 * Converts between Tweet and BaseMessage formats
 * Extends base transformer functionality
 */
export class TwitterMessageTransformer extends BaseMessageTransformer {
  /**
   * Convert Tweet to BaseMessage format
   */
  public static convertTweetToBaseMessage(tweet: Tweet): BaseMessage {
    const normalizedText = this.normalizeText(tweet.text);
    const kaspaAnalysis = this.analyzeKaspaContent(normalizedText);

    return {
      id: tweet.id,
      text: normalizedText,
      author: tweet.author,
      authorHandle: tweet.authorHandle,
      createdAt: tweet.createdAt,
      url: tweet.url,
      source: tweet.source,
      processingStatus: tweet.processingStatus,
      processedAt: tweet.processedAt,
      kaspaRelated: kaspaAnalysis.isKaspaRelated,
      kaspaTopics: kaspaAnalysis.kaspaTopics,
      hashtags: tweet.hashtags || this.extractHashtags(normalizedText),
      mentions: tweet.mentions || this.extractMentions(normalizedText),
      links: tweet.links || this.extractLinks(normalizedText),
      language: tweet.language || this.detectLanguage(normalizedText),
      errors: tweet.errors || [],
      retryCount: tweet.retryCount || 0,
    };
  }

  /**
   * Transform Twitter message for Qdrant storage
   */
  public static transformMessageForStorage(message: BaseMessage): any {
    const baseMetadata = this.createBaseStorageMetadata(message);

    // Add Twitter-specific metadata
    return {
      ...baseMetadata,
      originalTweetId: message.id,
      // Twitter-specific engagement metrics (if available)
      likes: (message as any).likes || 0,
      retweets: (message as any).retweets || 0,
      replies: (message as any).replies || 0,
      views: (message as any).views || 0,
      // Twitter-specific fields
      tweetType: this.determineTweetType(message.text),
      isReply: this.isReplyTweet(message.text),
      isRetweet: this.isRetweetContent(message.text),
      threadPosition: this.detectThreadPosition(message.text),
    };
  }

  /**
   * Create a BaseMessage from raw Twitter data
   */
  public static createFromRawTwitterData(
    twitterData: any,
    authorInfo?: any,
  ): BaseMessage {
    const now = new Date();
    const text = this.normalizeText(twitterData.text || '');
    const kaspaAnalysis = this.analyzeKaspaContent(text);

    return {
      id: twitterData.id || `twitter_${now.getTime()}`,
      text,
      author: authorInfo?.name || twitterData.author_name || 'Unknown',
      authorHandle: authorInfo?.username || twitterData.username || 'unknown',
      createdAt: new Date(
        twitterData.created_at || twitterData.timestamp || now,
      ),
      url: this.buildTwitterUrl(
        authorInfo?.username || twitterData.username,
        twitterData.id,
      ),
      source: TweetSource.API,
      processingStatus: TweetProcessingStatus.SCRAPED,
      processedAt: now,
      kaspaRelated: kaspaAnalysis.isKaspaRelated,
      kaspaTopics: kaspaAnalysis.kaspaTopics,
      hashtags: this.extractHashtags(text),
      mentions: this.extractMentions(text),
      links: this.extractLinks(text),
      language: this.detectLanguage(text),
      errors: [],
      retryCount: 0,
    };
  }

  /**
   * Build Twitter URL for a tweet
   */
  public static buildTwitterUrl(username?: string, tweetId?: string): string {
    if (!username || !tweetId) {
      return 'https://twitter.com/unknown/status/unknown';
    }
    return `https://twitter.com/${username}/status/${tweetId}`;
  }

  /**
   * Determine tweet type based on content
   */
  public static determineTweetType(text: string): string {
    if (this.isReplyTweet(text)) return 'reply';
    if (this.isRetweetContent(text)) return 'retweet';
    if (this.isQuoteTweet(text)) return 'quote';
    if (this.isThreadTweet(text)) return 'thread';
    return 'original';
  }

  /**
   * Check if tweet is a reply
   */
  public static isReplyTweet(text: string): boolean {
    return text.startsWith('@') || text.includes('Replying to');
  }

  /**
   * Check if tweet is a retweet
   */
  public static isRetweetContent(text: string): boolean {
    return text.startsWith('RT @') || text.includes('Retweeted');
  }

  /**
   * Check if tweet is a quote tweet
   */
  public static isQuoteTweet(text: string): boolean {
    return text.includes('QT @') || text.includes('Quote Tweet');
  }

  /**
   * Check if tweet is part of a thread
   */
  public static isThreadTweet(text: string): boolean {
    const threadIndicators = ['🧵', 'thread', '1/', '2/', 'continued...'];
    const lowerText = text.toLowerCase();
    return threadIndicators.some((indicator) => lowerText.includes(indicator));
  }

  /**
   * Detect position in thread
   */
  public static detectThreadPosition(text: string): number | null {
    const threadMatch = text.match(/(\d+)\/\d+/);
    return threadMatch ? parseInt(threadMatch[1], 10) : null;
  }

  /**
   * Extract Twitter-specific engagement metrics
   */
  public static extractEngagementMetrics(twitterData: any): {
    likes: number;
    retweets: number;
    replies: number;
    views: number;
  } {
    const publicMetrics = twitterData.public_metrics || {};

    return {
      likes: publicMetrics.like_count || 0,
      retweets: publicMetrics.retweet_count || 0,
      replies: publicMetrics.reply_count || 0,
      views: publicMetrics.impression_count || 0,
    };
  }

  /**
   * Validate Twitter-specific message data
   */
  public static validateTwitterMessage(message: BaseMessage): string[] {
    const baseErrors = this.validateBaseMessage(message);
    const twitterErrors: string[] = [];

    // Twitter-specific validations
    if (!message.authorHandle.match(/^[a-zA-Z0-9_]{1,15}$/)) {
      twitterErrors.push('Invalid Twitter handle format');
    }

    if (message.text.length > 280) {
      twitterErrors.push('Tweet text exceeds 280 characters');
    }

    return [...baseErrors, ...twitterErrors];
  }

  /**
   * Clean Twitter-specific text artifacts
   */
  public static cleanTwitterText(text: string): string {
    return this.normalizeText(text)
      .replace(/https:\/\/t\.co\/\w+/g, '') // Remove t.co shortened URLs
      .replace(/pic\.twitter\.com\/\w+/g, '') // Remove pic.twitter.com links
      .replace(/&amp;/g, '&') // Decode HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }
}
