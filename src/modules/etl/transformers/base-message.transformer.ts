import { BaseMessage } from '../models/base-indexer.model';

/**
 * Base Message Transformer
 *
 * Common transformation utilities for all message types
 * Provides shared functionality for Twitter and Telegram transformers
 */
export class BaseMessageTransformer {
  /**
   * Create common storage metadata for any message type
   */
  public static createBaseStorageMetadata(message: BaseMessage): any {
    return {
      text: message.text,
      author: message.author,
      authorHandle: message.authorHandle,
      createdAt: message.createdAt.toISOString(),
      url: message.url,
      kaspaRelated: message.kaspaRelated,
      kaspaTopics: message.kaspaTopics,
      hashtags: message.hashtags,
      mentions: message.mentions,
      links: message.links,
      language: message.language,
      source: message.source,
      processingStatus: message.processingStatus,
      processedAt: message.processedAt.toISOString(),
      retryCount: message.retryCount,
    };
  }

  /**
   * Validate required fields in a BaseMessage
   */
  public static validateBaseMessage(message: BaseMessage): string[] {
    const errors: string[] = [];

    if (!message.id) errors.push('Missing message ID');
    if (!message.text) errors.push('Missing message text');
    if (!message.author) errors.push('Missing message author');
    if (!message.createdAt) errors.push('Missing creation date');
    if (!message.source) errors.push('Missing message source');

    return errors;
  }

  /**
   * Clean and normalize message text
   */
  public static normalizeText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[\r\n]+/g, ' '); // Replace line breaks with spaces
  }

  /**
   * Extract common Kaspa-related information
   */
  public static analyzeKaspaContent(text: string): {
    isKaspaRelated: boolean;
    kaspaTopics: string[];
  } {
    const lowerText = text.toLowerCase();

    const kaspaKeywords = [
      'kaspa',
      'kas',
      '$kas',
      'ghostdag',
      'blockdag',
      'kaspad',
      'kasplex',
      'kasparebro',
    ];

    const isKaspaRelated = kaspaKeywords.some((keyword) =>
      lowerText.includes(keyword),
    );

    const topics: string[] = [];
    const topicMap = {
      mining: ['mining', 'miner', 'hashrate', 'pool'],
      development: ['development', 'dev', 'code', 'github', 'update'],
      trading: ['trading', 'price', 'exchange', 'buy', 'sell'],
      technology: ['ghostdag', 'blockdag', 'consensus', 'protocol'],
      community: ['community', 'event', 'meetup', 'announcement'],
      defi: ['defi', 'dex', 'swap', 'liquidity', 'yield'],
      nft: ['nft', 'token', 'mint', 'collection'],
    };

    Object.entries(topicMap).forEach(([topic, keywords]) => {
      if (keywords.some((keyword) => lowerText.includes(keyword))) {
        topics.push(topic);
      }
    });

    return {
      isKaspaRelated,
      kaspaTopics: topics,
    };
  }

  /**
   * Extract hashtags from text
   */
  public static extractHashtags(text: string): string[] {
    const hashtags = text.match(/#\w+/g) || [];
    return hashtags.map((tag) => tag.toLowerCase());
  }

  /**
   * Extract mentions from text
   */
  public static extractMentions(text: string): string[] {
    const mentions = text.match(/@\w+/g) || [];
    return mentions.map((mention) => mention.toLowerCase());
  }

  /**
   * Extract URLs from text
   */
  public static extractLinks(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
  }

  /**
   * Detect message language (basic implementation)
   */
  public static detectLanguage(text: string): string {
    // Simple language detection - could be enhanced with a proper language detection library
    const englishWords = [
      'the',
      'and',
      'is',
      'in',
      'to',
      'of',
      'a',
      'for',
      'on',
      'with',
    ];
    const lowerText = text.toLowerCase();

    const englishWordCount = englishWords.filter((word) =>
      lowerText.includes(word),
    ).length;

    // If contains common English words, assume English, otherwise 'unknown'
    return englishWordCount >= 2 ? 'en' : 'unknown';
  }
}
