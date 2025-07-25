import { MessageSource } from './message-source.enum';

/**
 * Processing Status Enum
 *
 * Tracks the processing state of messages
 */
export enum ProcessingStatus {
  SCRAPED = 'scraped',
  PROCESSED = 'processed',
  EMBEDDED = 'embedded',
  STORED = 'stored',
  FAILED = 'failed',
}

/**
 * Telegram Message Type Enum
 */
export enum TelegramMessageType {
  TEXT = 'text',
  MEDIA = 'media',
  FORWARDED = 'forwarded',
  REPLY = 'reply',
  CHANNEL_POST = 'channel_post',
}

/**
 * Master Document Model
 *
 * Unified document model containing ALL possible fields from ALL data sources.
 * Following DEVELOPMENT_RULES.md: Transform data ONCE at entry point to this complete model,
 * then use consistently throughout the entire pipeline.
 *
 * Fields are optional based on source - only populate fields relevant to the message source.
 */
export interface MasterDocument {
  // ==========================================
  // CORE FIELDS (Always Present)
  // ==========================================
  id: string;
  source: MessageSource;
  text: string;
  author: string;
  authorHandle: string;
  createdAt: string; // ISO string for storage consistency
  url: string;

  // ==========================================
  // PROCESSING METADATA (Always Present)
  // ==========================================
  processingStatus: ProcessingStatus;
  processedAt: string; // ISO string
  kaspaRelated: boolean;
  kaspaTopics: string[];
  hashtags: string[];
  mentions: string[];
  links: string[];
  language: string;
  errors: string[];
  retryCount: number;

  // ==========================================
  // TELEGRAM-SPECIFIC FIELDS (Optional)
  // ==========================================

  // Channel/Group Information
  telegramChannelTitle?: string;
  telegramChannelUsername?: string;
  telegramChannelId?: string | number;

  // Topic Information (for forum-style groups)
  telegramTopicId?: number;
  telegramTopicTitle?: string;

  // Message Author Information (person who posted the message)
  telegramAuthorName?: string;
  telegramAuthorUsername?: string;
  telegramAuthorId?: string | number;
  telegramIsAuthorChannel?: boolean;

  // Message Metadata
  telegramMessageType?: TelegramMessageType;
  telegramMessageId?: number;
  telegramIsForwarded?: boolean;
  telegramForwardedFrom?: string;
  telegramHasMedia?: boolean;
  telegramViews?: number;
  telegramReactions?: any[];
  telegramEditDate?: string; // ISO string
  telegramReplyToMessageId?: number;

  // Computed fields
  hasLinks?: boolean;

  // ==========================================
  // TWITTER-SPECIFIC FIELDS (Optional)
  // ==========================================

  // Tweet Metrics
  twitterRetweetCount?: number;
  twitterLikeCount?: number;
  twitterReplyCount?: number;
  twitterQuoteCount?: number;

  // Tweet Relationships
  twitterIsRetweet?: boolean;
  twitterOriginalTweetId?: string;
  twitterQuotedTweetId?: string;
  twitterInReplyToUserId?: string;
  twitterInReplyToTweetId?: string;

  // Twitter User Information
  twitterUserFollowersCount?: number;
  twitterUserVerified?: boolean;
  twitterUserCreatedAt?: string; // ISO string

  // ==========================================
  // FUTURE DATA SOURCE FIELDS (Optional)
  // ==========================================

  // Reddit fields (for future implementation)
  redditSubreddit?: string;
  redditScore?: number;
  redditCommentCount?: number;

  // Discord fields (for future implementation)
  discordGuildId?: string;
  discordChannelId?: string;
  discordMessageType?: string;

  // ==========================================
  // VECTOR STORAGE FIELDS (Optional)
  // ==========================================
  vector?: number[];
  vectorDimensions?: number;
  embeddedAt?: string; // ISO string
  storedAt?: string; // ISO string
}

/**
 * Master Document Creation Options
 *
 * Options for creating MasterDocument instances with source-specific requirements
 */
export interface MasterDocumentCreateOptions {
  source: MessageSource;
  skipEmbedding?: boolean;
  customProcessingStatus?: ProcessingStatus;
}
