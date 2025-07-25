import {
  MasterDocument,
  ProcessingStatus,
} from '../../shared/models/master-document.model';
import { MessageSource } from '../../shared/models/message-source.enum';

/**
 * Twitter Master Document Transformer
 *
 * Static helper methods for transforming Twitter API responses to MasterDocument format.
 * Moved from TwitterIndexerService to follow proper separation of concerns.
 *
 * ✅ Static methods only - no dependencies, pure transformations
 */
export class TwitterMasterDocumentTransformer {
  /**
   * Transform BaseMessage to MasterDocument format
   */
  static transformToMasterDocument(
    baseMessage: any,
    accountHandle: string,
  ): MasterDocument {
    const now = new Date().toISOString();

    return {
      id: baseMessage.id,
      source: MessageSource.TWITTER,
      text: baseMessage.text || '',
      author: baseMessage.author || accountHandle,
      authorHandle: baseMessage.authorHandle || accountHandle.toLowerCase(),
      createdAt:
        baseMessage.createdAt instanceof Date
          ? baseMessage.createdAt.toISOString()
          : baseMessage.createdAt,
      url:
        baseMessage.url ||
        `https://twitter.com/${accountHandle}/status/${baseMessage.id.replace('twitter_', '')}`,
      processingStatus: ProcessingStatus.PROCESSED,
      processedAt: now,
      kaspaRelated:
        baseMessage.kaspaRelated ||
        this.analyzeKaspaContent(baseMessage.text || ''),
      kaspaTopics:
        baseMessage.kaspaTopics ||
        this.extractKaspaTopics(baseMessage.text || ''),
      hashtags:
        baseMessage.hashtags || this.extractHashtags(baseMessage.text || ''),
      mentions:
        baseMessage.mentions || this.extractMentions(baseMessage.text || ''),
      links: baseMessage.links || this.extractLinks(baseMessage.text || ''),
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
   * Analyze if text content is Kaspa-related
   */
  static analyzeKaspaContent(text: string): boolean {
    const kaspaKeywords = ['kaspa', '$kas', 'blockdag', 'pow'];
    return kaspaKeywords.some((keyword) =>
      text.toLowerCase().includes(keyword),
    );
  }

  /**
   * Extract Kaspa-specific topics from text
   */
  static extractKaspaTopics(text: string): string[] {
    const topics: string[] = [];
    if (text.toLowerCase().includes('mining')) topics.push('mining');
    if (text.toLowerCase().includes('price')) topics.push('price');
    if (text.toLowerCase().includes('development')) topics.push('development');
    if (text.toLowerCase().includes('wallet')) topics.push('wallet');
    if (text.toLowerCase().includes('exchange')) topics.push('exchange');
    return topics;
  }

  /**
   * Extract hashtags from text
   */
  static extractHashtags(text: string): string[] {
    const hashtagRegex = /#[\w]+/g;
    return text.match(hashtagRegex) || [];
  }

  /**
   * Extract mentions from text
   */
  static extractMentions(text: string): string[] {
    const mentionRegex = /@[\w]+/g;
    return text.match(mentionRegex) || [];
  }

  /**
   * Extract links from text
   */
  static extractLinks(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/g;
    return text.match(urlRegex) || [];
  }
}
