import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QdrantClientService } from './qdrant-client.service';
import { QdrantConfigService } from '../config/qdrant.config';
import { QdrantCollectionInfo } from '../models/qdrant.model';

/**
 * Qdrant Collection Service
 *
 * Handles collection management operations with automatic initialization
 */
@Injectable()
export class QdrantCollectionService implements OnModuleInit {
  private readonly logger = new Logger(QdrantCollectionService.name);
  private isInitialized = false;

  constructor(
    private readonly qdrantClient: QdrantClientService,
    private readonly qdrantConfig: QdrantConfigService,
  ) {}

  async onModuleInit() {
    // Ensure collection exists on module initialization
    await this.ensureCollectionExists();
  }

  /**
   * Create collection if it doesn't exist
   */
  async ensureCollectionExists(): Promise<boolean> {
    try {
      const collectionName = this.qdrantConfig.getCollectionName();
      this.logger.log(`Ensuring collection exists: ${collectionName}`);

      // Check if collection already exists
      const exists = await this.qdrantClient.collectionExists(collectionName);

      if (exists) {
        this.logger.log(`Collection already exists: ${collectionName}`);
        this.isInitialized = true;
        return true;
      }

      // Create collection with configuration
      const config = this.qdrantConfig.getCollectionConfig();

      const createConfig = {
        vectors: config.vectors,
        optimizers_config: config.optimizers_config,
        replication_factor: config.replication_factor,
        write_consistency_factor: config.write_consistency_factor,
        on_disk_payload: config.on_disk_payload,
        hnsw_config: config.hnsw_config,
      };

      this.logger.log(`Creating collection with config:`, createConfig);

      const success = await this.qdrantClient.createCollection(
        collectionName,
        createConfig,
      );

      if (success) {
        this.logger.log(`Collection created successfully: ${collectionName}`);
        this.isInitialized = true;

        // Verify collection creation
        const collectionInfo = await this.getCollectionInfo();
        this.logger.log(`Collection verification:`, {
          status: collectionInfo.status,
          vectorsConfig: collectionInfo.config?.vectors,
          pointsCount: collectionInfo.points_count,
        });

        return true;
      } else {
        throw new Error('Collection creation returned false');
      }
    } catch (error) {
      this.logger.error(`Failed to ensure collection exists: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get collection information
   */
  async getCollectionInfo(): Promise<QdrantCollectionInfo> {
    try {
      const collectionName = this.qdrantConfig.getCollectionName();
      this.logger.debug(`Getting collection information: ${collectionName}`);

      const collectionData =
        await this.qdrantClient.getCollectionInfo(collectionName);

      if (!collectionData) {
        throw new Error(`Collection not found: ${collectionName}`);
      }

      const collectionInfo: QdrantCollectionInfo = {
        status: collectionData.status || 'unknown',
        optimizer_status: collectionData.optimizer_status || { ok: false },
        vectors_count: collectionData.vectors_count || 0,
        indexed_vectors_count: collectionData.indexed_vectors_count || 0,
        points_count: collectionData.points_count || 0,
        segments_count: collectionData.segments_count || 0,
        config: {
          name: collectionName,
          vectors:
            collectionData.config?.params?.vectors ||
            this.qdrantConfig.getCollectionConfig().vectors,
          optimizers_config: collectionData.config?.optimizer_config,
          replication_factor: collectionData.config?.params?.replication_factor,
          write_consistency_factor:
            collectionData.config?.params?.write_consistency_factor,
          on_disk_payload: collectionData.config?.params?.on_disk_payload,
          hnsw_config: collectionData.config?.hnsw_config,
        },
      };

      return collectionInfo;
    } catch (error) {
      this.logger.error(`Failed to get collection info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(): Promise<{
    totalVectors: number;
    indexedVectors: number;
    totalPoints: number;
    segmentsCount: number;
    status: string;
    diskUsage?: number;
  }> {
    try {
      const collectionInfo = await this.getCollectionInfo();

      return {
        totalVectors: collectionInfo.vectors_count,
        indexedVectors: collectionInfo.indexed_vectors_count,
        totalPoints: collectionInfo.points_count,
        segmentsCount: collectionInfo.segments_count,
        status: collectionInfo.status,
      };
    } catch (error) {
      this.logger.error(`Failed to get collection stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check collection health
   */
  async checkCollectionHealth(): Promise<{
    isHealthy: boolean;
    status: string;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      const collectionInfo = await this.getCollectionInfo();

      // Check basic health indicators
      if (collectionInfo.status !== 'green') {
        issues.push(
          `Collection status is ${collectionInfo.status}, expected 'green'`,
        );
      }

      if (!collectionInfo.optimizer_status?.ok) {
        issues.push('Optimizer status is not OK');
      }

      // Check vector configuration
      const expectedConfig = this.qdrantConfig.getCollectionConfig();
      if (
        collectionInfo.config?.vectors?.size !== expectedConfig.vectors.size
      ) {
        issues.push(
          `Vector size mismatch: expected ${expectedConfig.vectors.size}, got ${collectionInfo.config?.vectors?.size}`,
        );
      }

      const isHealthy =
        issues.length === 0 && collectionInfo.status === 'green';

      return {
        isHealthy,
        status: collectionInfo.status,
        issues,
      };
    } catch (error) {
      issues.push(`Health check failed: ${error.message}`);
      return {
        isHealthy: false,
        status: 'error',
        issues,
      };
    }
  }

  /**
   * Recreate collection (dangerous operation)
   */
  async recreateCollection(): Promise<boolean> {
    try {
      const collectionName = this.qdrantConfig.getCollectionName();
      this.logger.warn(
        `Recreating collection: ${collectionName} - This will delete all data!`,
      );

      // Delete existing collection
      try {
        await this.qdrantClient.deleteCollection(collectionName);
        this.logger.log(`Deleted existing collection: ${collectionName}`);
      } catch (error) {
        this.logger.warn(
          `Failed to delete collection (may not exist): ${error.message}`,
        );
      }

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Create new collection
      this.isInitialized = false;
      const success = await this.ensureCollectionExists();

      if (success) {
        this.logger.log(`Collection recreated successfully: ${collectionName}`);
        return true;
      } else {
        throw new Error('Failed to recreate collection');
      }
    } catch (error) {
      this.logger.error(`Failed to recreate collection: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete collection
   */
  async deleteCollection(): Promise<boolean> {
    try {
      const collectionName = this.qdrantConfig.getCollectionName();
      this.logger.warn(
        `Deleting collection: ${collectionName} - This will delete all data!`,
      );

      const success = await this.qdrantClient.deleteCollection(collectionName);

      if (success) {
        this.isInitialized = false;
        this.logger.log(`Collection deleted successfully: ${collectionName}`);
        return true;
      } else {
        throw new Error('Collection deletion returned false');
      }
    } catch (error) {
      this.logger.error(`Failed to delete collection: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if collection is properly initialized
   */
  isCollectionInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Force re-initialization of collection
   */
  async reinitialize(): Promise<boolean> {
    this.isInitialized = false;
    return await this.ensureCollectionExists();
  }
}
