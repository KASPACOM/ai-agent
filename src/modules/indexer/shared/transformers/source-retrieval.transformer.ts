import {
  MasterDocument,
  ProcessingStatus,
  TelegramMessageType,
} from '../models/master-document.model';
import { MessageSource } from '../models/message-source.enum';

/**
 * Telegram Message Interface
 * 
 * Source-specific model for telegram messages retrieved from unified collection
 */
export interface TelegramMessageView {
  // Core fields
  id: string;
  text: string;
  author: string;
  authorHandle: string;
  createdAt: string;
  url: string;

  // Processing metadata
  processingStatus: ProcessingStatus; // ✅ Now using enum
  processedAt: string;
  kaspaRelated: boolean;
  kaspaTopics: string[];
  hashtags: string[];
  mentions: string[];
  links: string[];
  language: string;

  // Telegram-specific fields
  telegramChannelTitle?: string;
  telegramChannelUsername?: string;
  telegramChannelId?: string | number;
  telegramTopicId?: number;
  telegramTopicTitle?: string;
  telegramAuthorName?: string;
  telegramAuthorUsername?: string;
  telegramAuthorId?: string | number;
  telegramIsAuthorChannel?: boolean;
  telegramMessageType?: TelegramMessageType; // ✅ Now using enum
  telegramMessageId?: number;
  telegramIsForwarded?: boolean;
  telegramForwardedFrom?: string;
  telegramHasMedia?: boolean;
  telegramViews?: number;
  telegramEditDate?: string;
  telegramReplyToMessageId?: number;
  hasLinks?: boolean;
}

/**
 * Twitter Message Interface
 * 
 * Source-specific model for twitter messages retrieved from unified collection
 */
export interface TwitterMessageView {
  // Core fields
  id: string;
  text: string;
  author: string;
  authorHandle: string;
  createdAt: string;
  url: string;

  // Processing metadata
  processingStatus: ProcessingStatus; // ✅ Now using enum
  processedAt: string;
  kaspaRelated: boolean;
  kaspaTopics: string[];
  hashtags: string[];
  mentions: string[];
  links: string[];
  language: string;

  // Twitter-specific fields
  twitterRetweetCount?: number;
  twitterLikeCount?: number;
  twitterReplyCount?: number;
  twitterQuoteCount?: number;
  twitterIsRetweet?: boolean;
  twitterOriginalTweetId?: string;
  twitterQuotedTweetId?: string;
  twitterInReplyToUserId?: string;
  twitterInReplyToTweetId?: string;
  twitterUserFollowersCount?: number;
  twitterUserVerified?: boolean;
  twitterUserCreatedAt?: string;
}

/**
 * Source Retrieval Transformer
 * 
 * Transforms MasterDocument instances back to source-specific models for retrieval.
 * Following DEVELOPMENT_RULES.md: Single transformation principle - we store unified
 * documents and transform only on retrieval based on source.
 */
export class SourceRetrievalTransformer {

  /**
   * Transform MasterDocument to Telegram-specific view
   * Only includes telegram-relevant fields and core fields
   */
  static toTelegramMessage(document: MasterDocument): TelegramMessageView {
    if (document.source !== MessageSource.TELEGRAM) {
      throw new Error(`Cannot convert ${document.source} document to TelegramMessageView`);
    }

    return {
      // Core fields (always present)
      id: document.id,
      text: document.text,
      author: document.author,
      authorHandle: document.authorHandle,
      createdAt: document.createdAt,
      url: document.url,

      // Processing metadata
      processingStatus: document.processingStatus,
      processedAt: document.processedAt,
      kaspaRelated: document.kaspaRelated,
      kaspaTopics: document.kaspaTopics,
      hashtags: document.hashtags,
      mentions: document.mentions,
      links: document.links,
      language: document.language,

      // Telegram-specific fields (only populated for telegram messages)
      telegramChannelTitle: document.telegramChannelTitle,
      telegramChannelUsername: document.telegramChannelUsername,
      telegramChannelId: document.telegramChannelId,
      telegramTopicId: document.telegramTopicId,
      telegramTopicTitle: document.telegramTopicTitle,
      telegramAuthorName: document.telegramAuthorName,
      telegramAuthorUsername: document.telegramAuthorUsername,
      telegramAuthorId: document.telegramAuthorId,
      telegramIsAuthorChannel: document.telegramIsAuthorChannel,
      telegramMessageType: document.telegramMessageType,
      telegramMessageId: document.telegramMessageId,
      telegramIsForwarded: document.telegramIsForwarded,
      telegramForwardedFrom: document.telegramForwardedFrom,
      telegramHasMedia: document.telegramHasMedia,
      telegramViews: document.telegramViews,
      telegramEditDate: document.telegramEditDate,
      telegramReplyToMessageId: document.telegramReplyToMessageId,
      hasLinks: document.hasLinks,
    };
  }

  /**
   * Transform MasterDocument to Twitter-specific view
   * Only includes twitter-relevant fields and core fields
   */
  static toTwitterMessage(document: MasterDocument): TwitterMessageView {
    if (document.source !== MessageSource.TWITTER) {
      throw new Error(`Cannot convert ${document.source} document to TwitterMessageView`);
    }

    return {
      // Core fields (always present)
      id: document.id,
      text: document.text,
      author: document.author,
      authorHandle: document.authorHandle,
      createdAt: document.createdAt,
      url: document.url,

      // Processing metadata
      processingStatus: document.processingStatus,
      processedAt: document.processedAt,
      kaspaRelated: document.kaspaRelated,
      kaspaTopics: document.kaspaTopics,
      hashtags: document.hashtags,
      mentions: document.mentions,
      links: document.links,
      language: document.language,

      // Twitter-specific fields (only populated for twitter messages)
      twitterRetweetCount: document.twitterRetweetCount,
      twitterLikeCount: document.twitterLikeCount,
      twitterReplyCount: document.twitterReplyCount,
      twitterQuoteCount: document.twitterQuoteCount,
      twitterIsRetweet: document.twitterIsRetweet,
      twitterOriginalTweetId: document.twitterOriginalTweetId,
      twitterQuotedTweetId: document.twitterQuotedTweetId,
      twitterInReplyToUserId: document.twitterInReplyToUserId,
      twitterInReplyToTweetId: document.twitterInReplyToTweetId,
      twitterUserFollowersCount: document.twitterUserFollowersCount,
      twitterUserVerified: document.twitterUserVerified,
      twitterUserCreatedAt: document.twitterUserCreatedAt,
    };
  }

  /**
   * Transform multiple MasterDocuments to Telegram messages
   */
  static toTelegramMessages(documents: MasterDocument[]): TelegramMessageView[] {
    return documents
      .filter(doc => doc.source === MessageSource.TELEGRAM)
      .map(doc => this.toTelegramMessage(doc));
  }

  /**
   * Transform multiple MasterDocuments to Twitter messages
   */
  static toTwitterMessages(documents: MasterDocument[]): TwitterMessageView[] {
    return documents
      .filter(doc => doc.source === MessageSource.TWITTER)
      .map(doc => this.toTwitterMessage(doc));
  }

  /**
   * Get documents by source and transform to appropriate view model
   */
  static transformBySource(documents: MasterDocument[], source: MessageSource): TelegramMessageView[] | TwitterMessageView[] {
    switch (source) {
      case MessageSource.TELEGRAM:
        return this.toTelegramMessages(documents);
      case MessageSource.TWITTER:
        return this.toTwitterMessages(documents);
      default:
        throw new Error(`Unsupported source for transformation: ${source}`);
    }
  }

  /**
   * Utility method to check if a document belongs to a specific source
   */
  static isOfSource(document: MasterDocument, source: MessageSource): boolean {
    return document.source === source;
  }

  /**
   * Filter documents by source
   */
  static filterBySource(documents: MasterDocument[], source: MessageSource): MasterDocument[] {
    return documents.filter(doc => doc.source === source);
  }

  /**
   * Group documents by source
   */
  static groupBySource(documents: MasterDocument[]): Record<MessageSource, MasterDocument[]> {
    const grouped: Record<MessageSource, MasterDocument[]> = {} as Record<MessageSource, MasterDocument[]>;

    for (const doc of documents) {
      if (!grouped[doc.source]) {
        grouped[doc.source] = [];
      }
      grouped[doc.source].push(doc);
    }

    return grouped;
  }
} 