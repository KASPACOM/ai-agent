import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../core/modules/config/app-config.service';
import { QdrantDistance } from '../models/qdrant.enums';
import { QdrantCollectionConfig } from '../models/qdrant.model';

/**
 * Qdrant Configuration Service
 *
 * Centralized configuration for Qdrant vector database operations
 */
@Injectable()
export class QdrantConfigService {
  constructor(private readonly appConfig: AppConfigService) {}

  /**
   * Get Qdrant server URL
   */
  getQdrantUrl(): string {
    return this.appConfig.getQdrantUrl;
  }

  /**
   * Get Qdrant API key (optional)
   */
  getQdrantApiKey(): string | undefined {
    return this.appConfig.getQdrantApiKey;
  }

  /**
   * Get collection name for tweets
   */
  getCollectionName(): string {
    return this.appConfig.getQdrantCollectionName;
  }

  /**
   * Get collection configuration for tweet vectors
   */
  getCollectionConfig(): QdrantCollectionConfig {
    return {
      name: this.getCollectionName(),
      vectors: {
        size: this.appConfig.getOpenAiEmbeddingDimensions,
        distance: QdrantDistance.COSINE,
      },
      optimizers_config: {
        deleted_threshold: 0.2,
        vacuum_min_vector_number: 1000,
        default_segment_number: 0,
      },
      replication_factor: 1,
      write_consistency_factor: 1,
      on_disk_payload: true,
      hnsw_config: {
        m: 16,
        ef_construct: 100,
        full_scan_threshold: 10000,
        max_indexing_threads: 0,
      },
    };
  }

  /**
   * Get search configuration defaults
   */
  getSearchDefaults(): {
    limit: number;
    scoreThreshold: number;
    withPayload: boolean;
    withVector: boolean;
  } {
    return {
      limit: 10,
      scoreThreshold: 0.7,
      withPayload: true,
      withVector: false,
    };
  }

  /**
   * Get timeout configuration
   */
  getTimeouts(): {
    connectionTimeout: number;
    requestTimeout: number;
  } {
    return {
      connectionTimeout: 5000,
      requestTimeout: 30000,
    };
  }
}
