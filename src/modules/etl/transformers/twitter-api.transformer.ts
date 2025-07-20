import { TweetV2, UserV2 } from 'twitter-api-v2';
import { TweetSource, TweetProcessingStatus } from '../models/etl.enums';
import { Tweet } from '../models/tweet.model';

export class TwitterTransformer {
  /**
   * Transform Twitter API tweet to our Tweet interface
   */
  public static transformApiTweet(apiTweet: TweetV2, author?: UserV2): Tweet {
    const now = new Date();

    return {
      // Basic Tweet Data
      id: apiTweet.id,
      text: apiTweet.text || '',
      author: author?.name || 'Unknown',
      authorHandle: author?.username || 'unknown',
      createdAt: new Date(apiTweet.created_at || now),
      url: `https://twitter.com/${author?.username || 'unknown'}/status/${apiTweet.id}`,

      // Engagement Metrics
      likes: apiTweet.public_metrics?.like_count || 0,
      retweets: apiTweet.public_metrics?.retweet_count || 0,
      replies: apiTweet.public_metrics?.reply_count || 0,
      views: apiTweet.public_metrics?.impression_count || 0,

      // Processing Metadata
      source: TweetSource.API,
      processingStatus: TweetProcessingStatus.SCRAPED,
      processedAt: now,

      // Content Analysis
      hashtags: this.extractHashtags(apiTweet.entities?.hashtags),
      mentions: this.extractMentions(apiTweet.entities?.mentions),
      links: this.extractLinks(apiTweet.entities?.urls),
      language: apiTweet.lang || 'en',

      // Kaspa-specific Tags
      kaspaRelated: this.isKaspaRelated(apiTweet.text || ''),
      kaspaTopics: this.extractKaspaTopics(apiTweet.text || ''),

      // Error Handling
      errors: [],
      retryCount: 0,
    };
  }

  /**
   * Extract hashtags from Twitter API entities
   */
  public static extractHashtags(hashtags?: any[]): string[] {
    if (!hashtags) return [];
    return hashtags.map((tag) => `#${tag.tag.toLowerCase()}`);
  }

  /**
   * Extract mentions from Twitter API entities
   */
  public static extractMentions(mentions?: any[]): string[] {
    if (!mentions) return [];
    return mentions.map((mention) => `@${mention.username.toLowerCase()}`);
  }

  /**
   * Extract links from Twitter API entities
   */
  public static extractLinks(urls?: any[]): string[] {
    if (!urls) return [];
    return urls.map((url) => url.expanded_url || url.url);
  }

  /**
   * Check if tweet is Kaspa-related
   */
  public static isKaspaRelated(text: string): boolean {
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
  public static extractKaspaTopics(text: string): string[] {
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
}
