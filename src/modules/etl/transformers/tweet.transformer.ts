import { Injectable, Logger } from '@nestjs/common';
import { Tweet } from '../models/tweet.model';
import { TweetSource, TweetProcessingStatus } from '../models/etl.enums';
import { EtlConfigService } from '../config/etl.config';

/**
 * Tweet Transformer
 * 
 * Handles tweet data transformation and normalization
 * Following DEVELOPMENT_RULES.md: Type-safe transformers with proper interfaces
 */
@Injectable()
export class TweetTransformer {
  private readonly logger = new Logger(TweetTransformer.name);

  constructor(private readonly etlConfig: EtlConfigService) {}

  /**
   * Transform raw tweet data into standardized Tweet interface
   * TODO: Phase 4 - Implement actual transformation logic
   */
  async transformTweet(rawTweet: any, source: TweetSource): Promise<Tweet> {
    this.logger.debug(`Transforming tweet: ${rawTweet.id || 'unknown'}`);
    
    // TODO: Phase 4 - Implement actual transformation
    const tweet: Tweet = {
      id: rawTweet.id || `placeholder_${Date.now()}`,
      text: rawTweet.text || '',
      author: rawTweet.author || 'unknown',
      authorHandle: rawTweet.authorHandle || 'unknown',
      createdAt: rawTweet.createdAt || new Date(),
      url: rawTweet.url || '',
      likes: rawTweet.likes || 0,
      retweets: rawTweet.retweets || 0,
      replies: rawTweet.replies || 0,
      views: rawTweet.views,
      source,
      processingStatus: TweetProcessingStatus.TRANSFORMED,
      processedAt: new Date(),
      hashtags: this.extractHashtags(rawTweet.text || ''),
      mentions: this.extractMentions(rawTweet.text || ''),
      links: this.extractLinks(rawTweet.text || ''),
      language: rawTweet.language || 'en',
      kaspaRelated: this.isKaspaRelated(rawTweet.text || ''),
      kaspaTopics: this.extractKaspaTopics(rawTweet.text || ''),
      errors: [],
      retryCount: 0,
    };

    return tweet;
  }

  /**
   * Transform multiple tweets in batch
   */
  async transformTweets(rawTweets: any[], source: TweetSource): Promise<Tweet[]> {
    this.logger.log(`Transforming ${rawTweets.length} tweets`);
    
    const transformedTweets: Tweet[] = [];
    
    for (const rawTweet of rawTweets) {
      try {
        const tweet = await this.transformTweet(rawTweet, source);
        transformedTweets.push(tweet);
      } catch (error) {
        this.logger.error(`Error transforming tweet ${rawTweet.id}`, error);
      }
    }
    
    return transformedTweets;
  }

  /**
   * Extract hashtags from tweet text
   */
  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#(\w+)/g;
    const hashtags = [];
    let match;
    
    while ((match = hashtagRegex.exec(text)) !== null) {
      hashtags.push(match[1].toLowerCase());
    }
    
    return hashtags;
  }

  /**
   * Extract mentions from tweet text
   */
  private extractMentions(text: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1].toLowerCase());
    }
    
    return mentions;
  }

  /**
   * Extract links from tweet text
   */
  private extractLinks(text: string): string[] {
    const linkRegex = /https?:\/\/[^\s]+/g;
    return text.match(linkRegex) || [];
  }

  /**
   * Check if tweet is related to Kaspa
   */
  private isKaspaRelated(text: string): boolean {
    const kaspaKeywords = this.etlConfig.getKaspaKeywords();
    const lowerText = text.toLowerCase();
    
    return kaspaKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }

  /**
   * Extract Kaspa-related topics from tweet text
   */
  private extractKaspaTopics(text: string): string[] {
    const kaspaKeywords = this.etlConfig.getKaspaKeywords();
    const lowerText = text.toLowerCase();
    const topics = [];
    
    for (const keyword of kaspaKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        topics.push(keyword);
      }
    }
    
    return topics;
  }

  /**
   * Validate transformed tweet
   */
  validateTweet(tweet: Tweet): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!tweet.id) errors.push('Tweet ID is required');
    if (!tweet.text) errors.push('Tweet text is required');
    if (!tweet.author) errors.push('Tweet author is required');
    if (!tweet.createdAt) errors.push('Tweet creation date is required');
    
    const filters = this.etlConfig.getContentFilters();
    
    if (tweet.text.length < filters.minTextLength) {
      errors.push(`Tweet text too short (${tweet.text.length} < ${filters.minTextLength})`);
    }
    
    if (tweet.text.length > filters.maxTextLength) {
      errors.push(`Tweet text too long (${tweet.text.length} > ${filters.maxTextLength})`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }
} 