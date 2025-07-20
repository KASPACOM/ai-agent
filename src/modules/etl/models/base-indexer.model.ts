/**
 * Base Indexer Models and Interfaces
 *
 * Defines common interfaces for all indexer services
 */

/**
 * Configuration for indexer services
 */
export interface IndexerConfig {
  collectionName: string;
  maxHistoricalDays: number;
  batchSize: number;
  accounts: string[];
}

/**
 * Result of indexing operation
 */
export interface IndexingResult {
  success: boolean;
  processed: number;
  embedded: number;
  stored: number;
  errors: string[];
  processingTime: number;
  startTime: Date;
  endTime: Date;
}

/**
 * Statistics for indexer service
 */
export interface IndexerStatistics {
  totalProcessed: number;
  totalEmbedded: number;
  totalStored: number;
  successfulRuns: number;
  failedRuns: number;
  lastRun?: Date;
  averageProcessingTime: number;
  errorCount: number;
}

/**
 * Health status of indexer service
 */
export interface IndexerHealth {
  isHealthy: boolean;
  serviceName: string;
  collectionName: string;
  lastRun?: Date;
  errors: string[];
  qdrantConnected: boolean;
  embeddingServiceConnected: boolean;
}

/**
 * Parameters for fetching historical messages
 */
export interface HistoricalFetchParams {
  account: string;
  maxDays: number;
  startFromDate?: Date;
  batchSize: number;
}

/**
 * Latest message information from database
 */
export interface LatestMessageInfo {
  id: string;
  createdAt: Date;
  account: string;
}

/**
 * Message processing result
 */
export interface MessageProcessingResult {
  success: boolean;
  processed: number;
  embedded: number;
  stored: number;
  errors: string[];
  messages: any[];
}

/**
 * Base message interface that Twitter and Telegram messages should extend
 */
export interface BaseMessage {
  id: string;
  text: string;
  author: string;
  authorHandle: string;
  createdAt: Date;
  url: string;
  source: string;
  processingStatus: string;
  processedAt: Date;
  kaspaRelated: boolean;
  kaspaTopics: string[];
  hashtags: string[];
  mentions: string[];
  links: string[];
  language: string;
  errors: any[];
  retryCount: number;
}
