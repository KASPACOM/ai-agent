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
 * PDF Document Type Enum
 */
export enum PDFDocumentType {
  ARTICLE = 'article',
  RESEARCH_PAPER = 'research_paper',
  WHITEPAPER = 'whitepaper',
  TECHNICAL_DOCUMENTATION = 'technical_documentation',
  REPORT = 'report',
  BOOK_CHAPTER = 'book_chapter',
  ACADEMIC_PAPER = 'academic_paper',
  BLOG_POST = 'blog_post',
}

/**
 * Chunking Strategy Enum
 */
export enum ChunkingStrategy {
  FIXED_SIZE = 'fixed_size',
  SEMANTIC = 'semantic',
  RECURSIVE = 'recursive',
  DOCUMENT_STRUCTURE = 'document_structure',
  HYBRID = 'hybrid',
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
  twitterIsRetweet?: boolean;
  twitterOriginalTweetId?: string;
  twitterQuotedTweetId?: string;
  twitterInReplyToUserId?: string;
  twitterInReplyToTweetId?: string;
  twitterUserFollowersCount?: number;
  twitterUserVerified?: boolean;
  twitterUserCreatedAt?: string; // ISO string

  // Tweet Content Processing
  hasTweetNote?: boolean; // true = has note_tweet, false = no note_tweet, null/undefined = unprocessed
  twitterOriginalText?: string; // Original tweet.text (with t.co links, exact formatting)
  twitterNoteText?: string; // Full note_tweet.text (expanded content)

  // ==========================================
  // PDF-SPECIFIC FIELDS (Optional)
  // ==========================================

  // Document Information
  pdfFileName?: string;
  pdfDocumentId?: string; // Unique identifier for the entire PDF document
  pdfTitle?: string;
  pdfAuthor?: string;
  pdfSubject?: string;
  pdfPageCount?: number;
  pdfFileSize?: number;

  // Document Classification
  pdfDocumentType?: PDFDocumentType; // article, research_paper, whitepaper, etc.
  pdfCategory?: string; // finance, technology, research, etc.

  // Chunk Structure & Semantics
  pdfPageNumber?: number; // Which page this chunk came from
  pdfChunkIndex?: number; // Sequential chunk number in document
  pdfTotalChunks?: number; // Total chunks in this document
  pdfSemanticGroupId?: string; // Groups semantically related chunks
  pdfSemanticLevel?: number; // Hierarchical level (1=main topic, 2=subtopic, etc.)
  pdfSemanticContext?: string; // Brief description of semantic topic
  pdfChunkingStrategy?: ChunkingStrategy; // How this chunk was created

  // Hierarchical Relationships
  pdfParentChunkId?: string; // If this is a sub-chunk, references parent
  pdfChildChunkIds?: string[]; // If this chunk was split, references children
  pdfSiblingChunkIds?: string[]; // Other chunks in same semantic group

  // Document Structure
  pdfSectionTitle?: string; // Heading/section this chunk belongs to
  pdfSectionLevel?: number; // H1=1, H2=2, etc.
  pdfHasStructure?: boolean; // Whether document has clear headings

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
  // VECTOR & EMBEDDING FIELDS (Always Present for Stored Documents)
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
