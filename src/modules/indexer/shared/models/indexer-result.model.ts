import { MasterDocument } from './master-document.model';

/**
 * Base Indexing Result
 *
 * Common result structure for all indexing operations
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

  // Source-specific fields
  rateLimited?: boolean; // For Twitter API limits
  hasMoreData?: boolean; // For pagination continuation
  requestsUsed?: number; // For rate limit tracking
  nextContinuationPoint?: string; // For stateful resume
}

/**
 * Message Processing Result
 *
 * Result of processing a batch of messages
 */
export interface MessageProcessingResult {
  success: boolean;
  processed: number;
  embedded: number;
  stored: number;
  errors: string[];
  messages: MasterDocument[];

  // Rate limiting and pagination
  rateLimited?: boolean;
  hasMoreData?: boolean;
  requestsUsed?: number;
}

/**
 * Batch Processing Result
 *
 * Result of processing multiple batches of messages
 */
export interface BatchProcessingResult {
  success: boolean;
  totalProcessed: number;
  totalEmbedded: number;
  totalStored: number;
  batchesProcessed: number;
  errors: string[];
  processingTime: number;
}

/**
 * Storage Operation Result
 *
 * Result of storing messages in the unified collection
 */
export interface StorageOperationResult {
  success: boolean;
  stored: number;
  failed: number;
  errors: string[];
  duplicatesSkipped?: number;
}

/**
 * Embedding Operation Result
 *
 * Result of generating embeddings for messages
 */
export interface EmbeddingOperationResult {
  success: boolean;
  embedded: number;
  failed: number;
  errors: string[];
  averageProcessingTime?: number;
}

/**
 * Indexer Health Status
 *
 * Health check result for indexer services
 */
export interface IndexerHealth {
  isHealthy: boolean;
  serviceName: string;
  collectionName: string;
  lastRun?: Date;
  errors: string[];
  dependencies: DependencyHealth[];
}

/**
 * Dependency Health Status
 *
 * Health status of external dependencies
 */
export interface DependencyHealth {
  name: string;
  isHealthy: boolean;
  error?: string;
  responseTime?: number;
}

/**
 * Indexer Statistics
 *
 * Operational statistics for indexer services
 */
export interface IndexerStatistics {
  serviceName: string;
  totalProcessed: number;
  totalEmbedded: number;
  totalStored: number;
  successfulRuns: number;
  failedRuns: number;
  lastRun?: Date;
  averageProcessingTime: number;
  errorCount: number;
  uptime: number;
}
