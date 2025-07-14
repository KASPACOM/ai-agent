import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantConfigService } from '../config/qdrant.config';
import { QdrantHealthCheck } from '../models/qdrant.model';

/**
 * Qdrant Client Service
 *
 * Low-level HTTP client for Qdrant API operations using the official Qdrant client
 */
@Injectable()
export class QdrantClientService implements OnModuleInit {
  private readonly logger = new Logger(QdrantClientService.name);
  private qdrantClient: QdrantClient;

  constructor(private readonly qdrantConfig: QdrantConfigService) {}

  async onModuleInit() {
    // Initialize Qdrant client on module initialization
    await this.initializeClient();
  }

  /**
   * Initialize Qdrant client with configuration
   */
  private async initializeClient(): Promise<void> {
    try {
      const url = this.qdrantConfig.getQdrantUrl();
      const apiKey = this.qdrantConfig.getQdrantApiKey();

      this.logger.log(`Initializing Qdrant client with URL: ${url}`);

      this.qdrantClient = new QdrantClient({
        url,
        apiKey, // Optional - will be undefined if not set
      });

      // Test connection
      await this.healthCheck();
      this.logger.log('Qdrant client initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Qdrant client: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the Qdrant client instance
   */
  getClient(): QdrantClient {
    if (!this.qdrantClient) {
      throw new Error('Qdrant client not initialized');
    }
    return this.qdrantClient;
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<QdrantHealthCheck> {
    try {
      this.logger.debug('Checking Qdrant health');

      // QdrantClient doesn't have a direct health check, so we'll use getCollections
      // If it works, the service is healthy
      await this.qdrantClient.getCollections();

      return {
        title: 'qdrant',
        version: 'unknown',
        commit: 'unknown',
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get collections list
   */
  async getCollections(): Promise<any> {
    try {
      this.logger.debug('Getting collections list');

      const response = await this.qdrantClient.getCollections();
      return response.collections || [];
    } catch (error) {
      this.logger.error(`Failed to get collections: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if collection exists
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      this.logger.debug(`Checking if collection exists: ${collectionName}`);

      const response = await this.qdrantClient.collectionExists(collectionName);
      return response.exists || false;
    } catch (error) {
      this.logger.debug(`Collection existence check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Create collection
   */
  async createCollection(
    collectionName: string,
    config: any,
  ): Promise<boolean> {
    try {
      this.logger.log(`Creating collection: ${collectionName}`);

      await this.qdrantClient.createCollection(collectionName, config);

      this.logger.log(`Collection created successfully: ${collectionName}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to create collection ${collectionName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(collectionName: string): Promise<any> {
    try {
      this.logger.debug(`Getting collection info: ${collectionName}`);

      const response = await this.qdrantClient.getCollection(collectionName);
      return response;
    } catch (error) {
      this.logger.error(
        `Failed to get collection info for ${collectionName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete collection
   */
  async deleteCollection(collectionName: string): Promise<boolean> {
    try {
      this.logger.log(`Deleting collection: ${collectionName}`);

      await this.qdrantClient.deleteCollection(collectionName);

      this.logger.log(`Collection deleted successfully: ${collectionName}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to delete collection ${collectionName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Upsert points to collection
   */
  async upsertPoints(collectionName: string, points: any[]): Promise<any> {
    try {
      this.logger.debug(
        `Upserting ${points.length} points to collection: ${collectionName}`,
      );

      const response = await this.qdrantClient.upsert(collectionName, {
        points,
      });

      this.logger.debug(`Successfully upserted ${points.length} points`);
      return response;
    } catch (error) {
      this.logger.error(
        `Failed to upsert points to ${collectionName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Search points in collection
   */
  async searchPoints(collectionName: string, searchParams: any): Promise<any> {
    try {
      this.logger.debug(`Searching points in collection: ${collectionName}`);

      const response = await this.qdrantClient.search(
        collectionName,
        searchParams,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `Failed to search points in ${collectionName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get point by ID
   */
  async getPoint(collectionName: string, pointId: string): Promise<any> {
    try {
      this.logger.debug(
        `Getting point by ID: ${pointId} from collection: ${collectionName}`,
      );

      const response = await this.qdrantClient.retrieve(collectionName, {
        ids: [pointId],
      });

      // Return the first point if found
      return response.length > 0 ? response[0] : null;
    } catch (error) {
      this.logger.error(
        `Failed to get point ${pointId} from ${collectionName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete points from collection
   */
  async deletePoints(collectionName: string, pointIds: string[]): Promise<any> {
    try {
      this.logger.debug(
        `Deleting ${pointIds.length} points from collection: ${collectionName}`,
      );

      const response = await this.qdrantClient.delete(collectionName, {
        points: pointIds,
      });

      this.logger.debug(`Successfully deleted ${pointIds.length} points`);
      return response;
    } catch (error) {
      this.logger.error(
        `Failed to delete points from ${collectionName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionName: string): Promise<any> {
    try {
      this.logger.debug(`Getting statistics for collection: ${collectionName}`);

      const collectionInfo = await this.getCollectionInfo(collectionName);

      return {
        vectors_count: collectionInfo?.vectors_count || 0,
        indexed_vectors_count: collectionInfo?.indexed_vectors_count || 0,
        points_count: collectionInfo?.points_count || 0,
        segments_count: collectionInfo?.segments_count || 0,
        status: collectionInfo?.status || 'unknown',
      };
    } catch (error) {
      this.logger.error(
        `Failed to get stats for ${collectionName}: ${error.message}`,
      );
      throw error;
    }
  }
}
