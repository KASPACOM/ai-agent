/**
 * Qdrant Enums
 * 
 * Following DEVELOPMENT_RULES.md: Use enums for string options instead of union types
 */

/**
 * Qdrant vector distance metrics
 */
export enum QdrantDistance {
  COSINE = 'Cosine',
  EUCLIDEAN = 'Euclid',
  DOT_PRODUCT = 'Dot',
  MANHATTAN = 'Manhattan',
}

/**
 * Qdrant collection status
 */
export enum QdrantCollectionStatus {
  GREEN = 'green',
  YELLOW = 'yellow',
  RED = 'red',
  GREY = 'grey',
}

/**
 * Qdrant operation status
 */
export enum QdrantOperationStatus {
  ACKNOWLEDGED = 'acknowledged',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Qdrant index types
 */
export enum QdrantIndexType {
  PLAIN = 'plain',
  HNSW = 'hnsw',
}

/**
 * Qdrant payload data types
 */
export enum QdrantPayloadType {
  KEYWORD = 'keyword',
  INTEGER = 'integer',
  FLOAT = 'float',
  BOOLEAN = 'bool',
  TEXT = 'text',
  GEO = 'geo',
  DATETIME = 'datetime',
}

/**
 * Qdrant search scoring
 */
export enum QdrantScoring {
  FUSION = 'fusion',
  MAX_SIM = 'max_sim',
}

/**
 * Qdrant vector storage types
 */
export enum QdrantVectorStorage {
  DISK = 'disk',
  MEMORY = 'memory',
}

/**
 * Qdrant quantization types
 */
export enum QdrantQuantization {
  SCALAR = 'scalar',
  PRODUCT = 'product',
  BINARY = 'binary',
} 