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
   * Safely parse a date string, returning current date if invalid
   */
  private static safeParseDate(dateStr: any): Date {
    if (!dateStr) {
      return new Date(); // Default to now if no date provided
    }
    
    const parsed = new Date(dateStr);
    
    // Check if the date is valid
    if (isNaN(parsed.getTime())) {
      console.warn(`Invalid date encountered: "${dateStr}", using current time`);
      return new Date(); // Default to now if invalid date
    }
    
    return parsed;
  }

  /**
   * Convert Tweet to BaseMessage format
   */
  public static convertTweetToBaseMessage(
    tweet: any,
    authorHandle: string,
    collectionName: string = 'kaspa_tweets',
  ): BaseMessage {
    const normalizedText = this.normalizeText(tweet.text);
    const kaspaAnalysis = this.analyzeKaspaContent(normalizedText);
    const normalizedAuthorHandle = authorHandle.toLowerCase();

    return {
      id: `twitter_${tweet.id}`,
      text: normalizedText,
      author: tweet.author_id,
      authorHandle: normalizedAuthorHandle, // Already normalized
      createdAt: this.safeParseDate(tweet.created_at), // Safe date parsing
      url: `https://twitter.com/${normalizedAuthorHandle}/status/${tweet.id}`, // Use normalized handle
      source: collectionName,
      kaspaRelated: kaspaAnalysis.isKaspaRelated,
      kaspaTopics: kaspaAnalysis.kaspaTopics,
      hashtags: tweet.hashtags || this.extractHashtags(normalizedText),
      mentions: tweet.mentions || this.extractMentions(normalizedText),
      links: tweet.links || this.extractLinks(normalizedText),
      language: tweet.language || this.detectLanguage(normalizedText),
      processingStatus: tweet.processingStatus || TweetProcessingStatus.SCRAPED,
      processedAt: tweet.processedAt || new Date(),
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
    collectionName: string = 'kaspa_tweets',
    authorInfo?: any,
  ): BaseMessage {
    const now = new Date();
    const text = this.normalizeText(twitterData.text || twitterData.full_text || '');
    const kaspaAnalysis = this.analyzeKaspaContent(text);
    
    const id = twitterData.id_str || twitterData.id || `twitter_${now.getTime()}`;
    const normalizedAuthorHandle = (authorInfo?.username || twitterData.username || 'unknown').toLowerCase();

    return {
      id: id,
      text: text,
      author: authorInfo?.name || twitterData.name || authorInfo?.username || twitterData.username || 'Unknown',
      authorHandle: normalizedAuthorHandle, // Already normalized
      createdAt: this.safeParseDate(twitterData.created_at), // Safe date parsing
      url: `https://twitter.com/${normalizedAuthorHandle}/status/${twitterData.id_str || twitterData.id}`, // Use normalized handle
      source: collectionName,
      kaspaRelated: kaspaAnalysis.isKaspaRelated,
      kaspaTopics: kaspaAnalysis.kaspaTopics,
      // Prefer API entities if available, fallback to text extraction
      hashtags: twitterData.entities?.hashtags?.map((h: any) => h.text.toLowerCase()) || this.extractHashtags(text),
      mentions: twitterData.entities?.user_mentions?.map((m: any) => m.screen_name.toLowerCase()) || this.extractMentions(text),
      links: twitterData.entities?.urls?.map((u: any) => u.expanded_url) || this.extractLinks(text),
      language: twitterData.lang || this.detectLanguage(text),
      processingStatus: TweetProcessingStatus.SCRAPED,
      processedAt: now,
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
    // Since we normalize to lowercase, check accordingly
    if (!message.authorHandle.match(/^[a-z0-9_]{1,15}$/)) {
      twitterErrors.push('Invalid Twitter handle format (should be lowercase alphanumeric with underscores, max 15 chars)');
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
