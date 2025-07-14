import { QdrantDistance, QdrantCollectionStatus, QdrantOperationStatus } from './qdrant.enums';

/**
 * Qdrant Point Interface
 * 
 * Represents a vector point in Qdrant with payload metadata
 */
export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, any>;
}

/**
 * Qdrant Collection Configuration
 */
export interface QdrantCollectionConfig {
  name: string;
  vectors: {
    size: number;
    distance: QdrantDistance;
  };
  optimizers_config?: {
    deleted_threshold?: number;
    vacuum_min_vector_number?: number;
    default_segment_number?: number;
  };
  replication_factor?: number;
  write_consistency_factor?: number;
  on_disk_payload?: boolean;
  hnsw_config?: {
    m?: number;
    ef_construct?: number;
    full_scan_threshold?: number;
    max_indexing_threads?: number;
  };
}

/**
 * Qdrant Collection Info
 */
export interface QdrantCollectionInfo {
  status: QdrantCollectionStatus;
  optimizer_status: {
    ok: boolean;
    error?: string;
  };
  vectors_count: number;
  indexed_vectors_count: number;
  points_count: number;
  segments_count: number;
  config: QdrantCollectionConfig;
}

/**
 * Qdrant Search Result
 */
export interface QdrantSearchResult {
  id: string | number;
  version: number;
  score: number;
  payload?: Record<string, any>;
  vector?: number[];
}

/**
 * Qdrant Search Request
 */
export interface QdrantSearchRequest {
  vector: number[];
  filter?: QdrantFilter;
  params?: QdrantSearchParams;
  limit?: number;
  offset?: number;
  with_payload?: boolean | string[];
  with_vector?: boolean;
  score_threshold?: number;
}

/**
 * Qdrant Filter
 */
export interface QdrantFilter {
  should?: QdrantCondition[];
  must?: QdrantCondition[];
  must_not?: QdrantCondition[];
}

/**
 * Qdrant Condition
 */
export interface QdrantCondition {
  key: string;
  match?: {
    value: any;
  };
  range?: {
    lt?: number;
    lte?: number;
    gt?: number;
    gte?: number;
  };
  geo_bounding_box?: {
    top_left: {
      lat: number;
      lon: number;
    };
    bottom_right: {
      lat: number;
      lon: number;
    };
  };
  geo_radius?: {
    center: {
      lat: number;
      lon: number;
    };
    radius: number;
  };
  values_count?: {
    lt?: number;
    lte?: number;
    gt?: number;
    gte?: number;
  };
}

/**
 * Qdrant Search Parameters
 */
export interface QdrantSearchParams {
  hnsw_ef?: number;
  exact?: boolean;
  indexed_only?: boolean;
}

/**
 * Qdrant Operation Result
 */
export interface QdrantOperationResult {
  operation_id: number;
  status: QdrantOperationStatus;
}

/**
 * Qdrant Health Check
 */
export interface QdrantHealthCheck {
  title: string;
  version: string;
  commit?: string;
}

/**
 * Qdrant Telemetry
 */
export interface QdrantTelemetry {
  id: string;
  collections: Record<string, {
    vectors_count: number;
    segments_count: number;
    disk_size: number;
    ram_size: number;
  }>;
  requests: {
    rest: number;
    grpc: number;
  };
} 