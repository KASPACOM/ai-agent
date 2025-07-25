/**
 * Twitter Models for Integration Service
 * 
 * Local models to eliminate ETL dependency.
 */

/**
 * Tweet source enum
 */
export enum TweetSource {
  HISTORICAL = 'historical',
  LIVE = 'live',
  MANUAL = 'manual',
  API = 'api',
}

/**
 * Tweet processing status enum
 */
export enum TweetProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Tweet interface
 */
export interface Tweet {
  id: string;
  text: string;
  author: string;
  createdAt: Date;
  url: string;
  source: TweetSource;
  status: TweetProcessingStatus;
  metadata?: Record<string, any>;
}

/**
 * Tweet batch interface  
 */
export interface TweetBatch {
  id: string;
  tweets: Tweet[];
  source: TweetSource;
  status: TweetProcessingStatus;
  createdAt: Date;
  processedAt?: Date;
  metadata?: Record<string, any>;
} 