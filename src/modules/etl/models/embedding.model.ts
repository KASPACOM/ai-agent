import { EmbeddingModel } from './etl.enums';

/**
 * Embedding Vector Interface
 *
 * Represents a vector embedding with metadata
 */
export interface EmbeddingVector {
  // === Vector Data ===
  vector: number[];
  dimensions: number;

  // === Source Information ===
  sourceText: string;
  sourceId: string;

  // === Model Information ===
  model: EmbeddingModel;
  generatedAt: Date;

  // === Processing Metadata ===
  processingTime: number;
  tokenCount?: number;

  // === Quality Metrics ===
  magnitude?: number;
  normalized?: boolean;
}

/**
 * Embedding Request Interface
 *
 * Request for generating embeddings
 */
export interface EmbeddingRequest {
  texts: string[];
  model: EmbeddingModel;
  batchId?: string;
  metadata?: Record<string, any>;
}

/**
 * Embedding Response Interface
 *
 * Response from embedding generation
 */
export interface EmbeddingResponse {
  embeddings: EmbeddingVector[];
  success: boolean;
  errors?: string[];
  processingTime: number;
  totalTokens: number;
  batchId?: string;
}

/**
 * Embedding Batch Interface
 *
 * Collection of embeddings for batch processing
 */
export interface EmbeddingBatch {
  id: string;
  embeddings: EmbeddingVector[];
  createdAt: Date;
  completedAt?: Date;
  model: EmbeddingModel;
  totalCount: number;
  successCount: number;
  errorCount: number;
  totalTokens: number;
  totalCost?: number;
}

/**
 * Embedding Statistics Interface
 *
 * Statistics about embedding generation
 */
export interface EmbeddingStats {
  totalGenerated: number;
  totalTokens: number;
  totalCost: number;
  averageProcessingTime: number;
  modelBreakdown: Record<EmbeddingModel, number>;
  dailyStats: Record<string, number>;
  errorRate: number;
}

/**
 * Embedding Configuration Interface
 *
 * Configuration for embedding generation
 */
export interface EmbeddingConfig {
  model: EmbeddingModel;
  dimensions: number;
  maxBatchSize: number;
  maxTokensPerRequest: number;
  retryAttempts: number;
  retryDelay: number;
  rateLimitPerMinute: number;
  normalizeVectors: boolean;
}
