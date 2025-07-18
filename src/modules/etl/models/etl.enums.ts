/**
 * ETL Enums
 * 
 * Following DEVELOPMENT_RULES.md: Use enums for string options instead of union types
 * This provides better IDE support, refactoring safety, and compile-time checking
 */

/**
 * Source of tweet data
 */
export enum TweetSource {
  HISTORICAL = 'historical',
  LIVE = 'live',
  MANUAL = 'manual',
  API = 'api',
}

/**
 * ETL pipeline processing status
 */
export enum ETLStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * OpenAI embedding model options
 */
export enum EmbeddingModel {
  TEXT_EMBEDDING_3_SMALL = 'text-embedding-3-small',
  TEXT_EMBEDDING_3_LARGE = 'text-embedding-3-large',
  TEXT_EMBEDDING_ADA_002 = 'text-embedding-ada-002',
}

/**
 * ETL operation types
 */
export enum ETLOperationType {
  SCRAPE_HISTORICAL = 'scrape_historical',
  POLL_LIVE = 'poll_live',
  GENERATE_EMBEDDINGS = 'generate_embeddings',
  STORE_VECTORS = 'store_vectors',
  HEALTH_CHECK = 'health_check',
}

/**
 * Priority levels for ETL operations
 */
export enum ETLPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Tweet processing status
 */
export enum TweetProcessingStatus {
  PENDING = 'pending',
  SCRAPED = 'scraped',
  TRANSFORMED = 'transformed',
  EMBEDDED = 'embedded',
  STORED = 'stored',
  FAILED = 'failed',
} 