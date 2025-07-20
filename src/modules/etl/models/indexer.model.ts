import { ETLStatus } from './etl.enums';

/**
 * Indexer Result Interface
 *
 * Standard result format for indexing operations
 */
export interface IndexingResult {
  success: boolean;
  status: ETLStatus;
  processingTime: number;
  results: IndexingOperationResults | null;
  errors: string[];
}

/**
 * Indexing Operation Results Interface
 *
 * Detailed results from an indexing operation
 */
export interface IndexingOperationResults {
  processed: number;
  embedded: number;
  stored: number;
  newTweets?: number;
  historicalTweets?: number;
  processingTime?: number;
  runNumber?: number;
  maxDays?: number;
}

/**
 * Processing Results Interface
 *
 * Results from batch processing operations
 */
export interface ProcessingResults {
  processed: number;
  embedded: number;
  stored: number;
  errors: string[];
}

/**
 * Account Processing Result Interface
 *
 * Results from processing a specific account's tweets
 */
export interface AccountProcessingResult {
  processed: number;
  embedded: number;
  stored: number;
  errors: string[];
}

/**
 * Storage Result Interface
 *
 * Results from vector storage operations
 */
export interface StorageResult {
  stored: number;
  errors: string[];
}

/**
 * Account Statistics Interface
 *
 * Statistics for individual Twitter accounts
 */
export interface AccountStatistics {
  processed: number;
  embedded: number;
  stored: number;
  lastProcessed: Date;
}

/**
 * Indexing Statistics Interface
 *
 * Comprehensive statistics for indexing operations
 */
export interface IndexingStatistics {
  totalTweetsProcessed: number;
  totalEmbeddingsGenerated: number;
  totalVectorsStored: number;
  successfulRuns: number;
  failedRuns: number;
  averageProcessingTime: number;
  errors: string[];
  runInitialScrape: boolean;
  accountStats: Record<string, AccountStatistics>;
}

/**
 * Indexing Configuration Interface
 *
 * Configuration settings for indexing operations
 */
export interface IndexingConfiguration {
  accounts: string[];
  batchSize: number;
  isEnabled: boolean;
  embeddingModel: string;
}

/**
 * Indexing Statistics Public Interface
 *
 * Public view of indexing statistics (without sensitive data)
 */
export interface IndexingStatisticsPublic {
  totalTweetsProcessed: number;
  totalEmbeddingsGenerated: number;
  totalVectorsStored: number;
  successfulRuns: number;
  failedRuns: number;
  averageProcessingTime: number;
  errorCount: number;
  accountStats: Record<string, AccountStatistics>;
}

/**
 * Indexing Status Interface
 *
 * Current status of the indexing service
 */
export interface IndexingStatus {
  isRunning: boolean;
  lastRun?: Date;
  runCount: number;
  configuration: IndexingConfiguration;
  statistics: IndexingStatisticsPublic;
}

/**
 * Health Services Interface
 *
 * Health status of dependent services
 */
export interface HealthServices {
  twitter: boolean;
  embedding: boolean;
  qdrant: boolean;
  config: boolean;
}

/**
 * Indexing Health Interface
 *
 * Health status of the indexing service
 */
export interface IndexingHealth {
  isHealthy: boolean;
  services: HealthServices;
  lastRun?: Date;
  errors: string[];
}

/**
 * Tweet Vector Batch Item Interface
 *
 * Individual item for batch vector storage operations
 */
export interface TweetVectorBatchItem {
  tweetId: string;
  vector: number[];
  metadata: TweetVectorMetadata;
}

/**
 * Tweet Vector Metadata Interface
 *
 * Metadata stored with tweet vectors in Qdrant
 */
export interface TweetVectorMetadata {
  originalTweetId: string; // Original Twitter ID (stored in metadata)
  author: string;
  authorHandle: string;
  text: string;
  createdAt: string;
  url: string;
  likes: number;
  retweets: number;
  replies: number;
  kaspaRelated: boolean;
  kaspaTopics: string[];
  hashtags: string[];
  mentions: string[];
  links: string[];
  source: string;
}
