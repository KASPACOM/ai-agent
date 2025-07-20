import { TweetSource, TweetProcessingStatus } from './etl.enums';

/**
 * Tweet Interface
 *
 * Represents a tweet with all metadata needed for vector storage and search
 */
export interface Tweet {
  // === Basic Tweet Data ===
  id: string;
  text: string;
  author: string;
  authorHandle: string;
  createdAt: Date;
  url: string;

  // === Engagement Metrics ===
  likes: number;
  retweets: number;
  replies: number;
  views?: number;

  // === Processing Metadata ===
  source: TweetSource;
  processingStatus: TweetProcessingStatus;
  processedAt?: Date;

  // === Embedding Data ===
  embedding?: number[];
  embeddingModel?: string;
  embeddingGeneratedAt?: Date;

  // === Vector Storage ===
  vectorId?: string;
  storedAt?: Date;

  // === Content Analysis ===
  hashtags: string[];
  mentions: string[];
  links: string[];
  language?: string;

  // === Kaspa-specific Tags ===
  kaspaRelated: boolean;
  kaspaTopics: string[];

  // === Error Handling ===
  errors?: TweetError[];
  retryCount?: number;
  lastRetryAt?: Date;
}

/**
 * Tweet Error Interface
 *
 * Tracks errors that occurred during tweet processing
 */
export interface TweetError {
  stage: string;
  error: string;
  timestamp: Date;
  recoverable: boolean;
}

/**
 * Tweet Processing Result
 *
 * Result of processing a tweet through the ETL pipeline
 */
export interface TweetProcessingResult {
  tweet: Tweet;
  success: boolean;
  errors: TweetError[];
  processingTime: number;
  stage: string;
}

/**
 * Tweet Batch
 *
 * Collection of tweets for batch processing
 */
export interface TweetBatch {
  id: string;
  tweets: Tweet[];
  source: TweetSource;
  createdAt: Date;
  processedAt?: Date;
  status: TweetProcessingStatus;
  totalCount: number;
  processedCount: number;
  errorCount: number;
}

/**
 * Tweet Search Filters
 *
 * Filters for searching tweets in the vector database
 */
export interface TweetSearchFilters {
  author?: string;
  dateFrom?: Date;
  dateTo?: Date;
  kaspaRelated?: boolean;
  kaspaTopics?: string[];
  minLikes?: number;
  minRetweets?: number;
  source?: TweetSource;
  language?: string;
}

/**
 * Tweet Search Result
 *
 * Result of semantic search in tweet vectors
 */
export interface TweetSearchResult {
  tweet: Tweet;
  similarity: number;
  relevantText: string;
}
