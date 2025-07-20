import { Injectable, Logger } from '@nestjs/common';
import { QdrantClientService } from './qdrant-client.service';
import { QdrantCollectionService } from './qdrant-collection.service';
import { QdrantConfigService } from '../config/qdrant.config';
import { QdrantPoint, QdrantSearchResult } from '../models/qdrant.model';
import { v5 as uuidv5 } from 'uuid';

/**
 * Qdrant Repository Service
 *
 * High-level domain operations for vector storage and retrieval
 * Provides tweet-specific operations for the ETL pipeline
 */
@Injectable()
export class QdrantRepository {
  private readonly logger = new Logger(QdrantRepository.name);
  private readonly UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Standard UUID namespace for tweets

  constructor(
    private readonly qdrantClient: QdrantClientService,
    private readonly qdrantCollection: QdrantCollectionService,
    private readonly qdrantConfig: QdrantConfigService,
  ) {}

  /**
   * Generate a UUID from a Twitter ID
   * This ensures Qdrant compatibility while maintaining deterministic IDs
   */
  private generateUuidFromTwitterId(twitterId: string): string {
    return uuidv5(twitterId, this.UUID_NAMESPACE);
  }

  /**
   * Store tweet vector with metadata
   */
  async storeTweetVector(
    tweetId: string,
    vector: number[],
    metadata: any,
  ): Promise<boolean> {
    try {
      this.logger.debug(`Storing tweet vector: ${tweetId}`);

      const collectionName = this.qdrantConfig.getCollectionName();

      // Ensure collection exists before storing
      if (!this.qdrantCollection.isCollectionInitialized()) {
        await this.qdrantCollection.ensureCollectionExists();
      }

      // Prepare point for insertion
      const point = {
        id: this.generateUuidFromTwitterId(tweetId), // Use UUID for Qdrant compatibility
        vector: vector,
        payload: {
          ...metadata,
          originalTweetId: tweetId, // Keep original Twitter ID in metadata
          stored_at: new Date().toISOString(),
          vector_dimensions: vector.length,
        },
      };

      // Store the vector
      const result = await this.qdrantClient.upsertPoints(collectionName, [
        point,
      ]);

      if (result) {
        this.logger.debug(`Successfully stored tweet vector: ${tweetId}`);
        return true;
      } else {
        throw new Error('Upsert operation returned no result');
      }
    } catch (error) {
      this.logger.error(
        `Failed to store tweet vector ${tweetId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Store multiple tweet vectors in batch
   */
  async storeTweetVectorsBatch(
    tweets: Array<{
      tweetId: string;
      vector: number[];
      metadata: any;
    }>,
  ): Promise<{
    success: boolean;
    stored: number;
    failed: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      stored: 0,
      failed: 0,
      errors: [] as string[],
    };

    if (tweets.length === 0) {
      this.logger.warn('No tweets provided for batch storage');
      result.success = true;
      return result;
    }

    try {
      this.logger.log(`Storing ${tweets.length} tweet vectors in batch`);

      const collectionName = this.qdrantConfig.getCollectionName();

      // Ensure collection exists
      if (!this.qdrantCollection.isCollectionInitialized()) {
        await this.qdrantCollection.ensureCollectionExists();
      }

      // Prepare all points
      const points = tweets.map((tweet) => ({
        id: this.generateUuidFromTwitterId(tweet.tweetId), // Use UUID for Qdrant compatibility
        vector: tweet.vector,
        payload: {
          ...tweet.metadata,
          originalTweetId: tweet.tweetId, // Keep original Twitter ID in metadata
          stored_at: new Date().toISOString(),
          vector_dimensions: tweet.vector.length,
        },
      }));

      // Store all vectors in batch
      const batchResult = await this.qdrantClient.upsertPoints(
        collectionName,
        points,
      );

      if (batchResult) {
        result.stored = tweets.length;
        result.success = true;
        this.logger.log(`Successfully stored ${tweets.length} tweet vectors`);
      } else {
        throw new Error('Batch upsert operation returned no result');
      }
    } catch (error) {
      this.logger.error(`Batch storage failed: ${error.message}`);
      result.failed = tweets.length;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Search for similar tweets
   */
  async searchSimilarTweets(
    queryVector: number[],
    limit: number = 10,
    filters?: any,
  ): Promise<QdrantSearchResult[]> {
    try {
      this.logger.debug(`Searching for similar tweets (limit: ${limit})`);

      const collectionName = this.qdrantConfig.getCollectionName();
      const searchDefaults = this.qdrantConfig.getSearchDefaults();

      // Prepare search parameters
      const searchParams = {
        vector: queryVector,
        limit: Math.min(limit, 100), // Cap at 100 for performance
        score_threshold: searchDefaults.scoreThreshold,
        with_payload: searchDefaults.withPayload,
        with_vector: searchDefaults.withVector,
        filter: filters || undefined,
      };

      // Perform search
      const searchResult = await this.qdrantClient.searchPoints(
        collectionName,
        searchParams,
      );

      if (!searchResult) {
        return [];
      }

      // Transform results to our format
      const results: QdrantSearchResult[] = (searchResult || []).map(
        (result: any) => ({
          id: result.id,
          score: result.score,
          payload: result.payload,
          vector: result.vector,
        }),
      );

      this.logger.debug(`Found ${results.length} similar tweets`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to search similar tweets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search tweets with text query and filters
   */
  async searchTweets(options: {
    queryVector?: number[];
    filters?: any;
    limit?: number;
    scoreThreshold?: number;
    author?: string;
    kaspaRelated?: boolean;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<QdrantSearchResult[]> {
    try {
      this.logger.debug('Searching tweets with filters');

      // Build filter conditions
      const filterConditions: any[] = [];

      if (options.author) {
        filterConditions.push({
          key: 'authorHandle',
          match: { value: options.author },
        });
      }

      if (options.kaspaRelated !== undefined) {
        filterConditions.push({
          key: 'kaspaRelated',
          match: { value: options.kaspaRelated },
        });
      }

      if (options.dateFrom || options.dateTo) {
        const dateRange: any = {};
        if (options.dateFrom) {
          dateRange.gte = options.dateFrom.toISOString();
        }
        if (options.dateTo) {
          dateRange.lte = options.dateTo.toISOString();
        }
        filterConditions.push({
          key: 'createdAt',
          range: dateRange,
        });
      }

      // Combine filters
      let filter = undefined;
      if (filterConditions.length > 0) {
        filter = {
          must: filterConditions,
        };
      }

      // If we have a query vector, do similarity search
      if (options.queryVector) {
        return await this.searchSimilarTweets(
          options.queryVector,
          options.limit || 10,
          filter,
        );
      }

      // Otherwise, do a filtered scroll (get all matching records)
      return await this.scrollTweets(filter, options.limit || 10);
    } catch (error) {
      this.logger.error(`Failed to search tweets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scroll through tweets (get without similarity search)
   */
  async scrollTweets(
    filter?: any,
    limit: number = 10,
  ): Promise<QdrantSearchResult[]> {
    try {
      this.logger.debug(`Scrolling tweets with limit: ${limit}`);

      const collectionName = this.qdrantConfig.getCollectionName();

      // Use scroll API for filtered results without vector search
      const scrollParams = {
        limit: Math.min(limit, 100),
        with_payload: true,
        with_vector: false,
        filter: filter || undefined,
      };

      // Since we don't have direct scroll in the client, we'll simulate with search using a zero vector
      const zeroVector = new Array(
        this.qdrantConfig.getCollectionConfig().vectors.size,
      ).fill(0);

      const searchParams = {
        vector: zeroVector,
        limit: scrollParams.limit,
        score_threshold: 0, // Accept all scores for filtering-only queries
        with_payload: scrollParams.with_payload,
        with_vector: scrollParams.with_vector,
        filter: scrollParams.filter,
      };

      const result = await this.qdrantClient.searchPoints(
        collectionName,
        searchParams,
      );

      if (!result) {
        return [];
      }

      return (result || []).map((item: any) => ({
        id: item.id,
        score: item.score,
        payload: item.payload,
        vector: item.vector,
      }));
    } catch (error) {
      this.logger.error(`Failed to scroll tweets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get tweet by UUID (Qdrant point ID)
   */
  async getTweetById(tweetId: string): Promise<QdrantPoint | null> {
    try {
      this.logger.debug(`Getting tweet by UUID: ${tweetId}`);

      const collectionName = this.qdrantConfig.getCollectionName();
      const uuid = this.generateUuidFromTwitterId(tweetId);
      const result = await this.qdrantClient.getPoint(collectionName, uuid);

      if (!result) {
        return null;
      }

      return {
        id: result.id,
        vector: result.vector,
        payload: result.payload,
      };
    } catch (error) {
      this.logger.error(`Failed to get tweet ${tweetId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get tweet by original Twitter ID
   */
  async getTweetByOriginalId(
    originalTweetId: string,
  ): Promise<QdrantPoint | null> {
    try {
      this.logger.debug(
        `Getting tweet by original Twitter ID: ${originalTweetId}`,
      );

      const collectionName = this.qdrantConfig.getCollectionName();
      const uuid = this.generateUuidFromTwitterId(originalTweetId);
      const result = await this.qdrantClient.getPoint(collectionName, uuid);

      if (!result) {
        return null;
      }

      return {
        id: result.id,
        vector: result.vector,
        payload: result.payload,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get tweet by original ID ${originalTweetId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Update tweet metadata
   */
  async updateTweetMetadata(tweetId: string, metadata: any): Promise<boolean> {
    try {
      this.logger.debug(`Updating tweet metadata: ${tweetId}`);

      // Get current tweet to preserve vector
      const currentTweet = await this.getTweetById(tweetId);

      if (!currentTweet) {
        throw new Error(`Tweet not found: ${tweetId}`);
      }

      // Update with new metadata while preserving vector
      const updatedPayload = {
        ...currentTweet.payload,
        ...metadata,
        updated_at: new Date().toISOString(),
      };

      return await this.storeTweetVector(
        tweetId,
        currentTweet.vector,
        updatedPayload,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update tweet metadata ${tweetId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete tweet vector by original Twitter ID
   */
  async deleteTweetVector(tweetId: string): Promise<boolean> {
    try {
      this.logger.debug(`Deleting tweet vector: ${tweetId}`);

      const collectionName = this.qdrantConfig.getCollectionName();
      const uuid = this.generateUuidFromTwitterId(tweetId);
      const result = await this.qdrantClient.deletePoints(collectionName, [
        uuid,
      ]);

      if (result) {
        this.logger.debug(`Successfully deleted tweet vector: ${tweetId}`);
        return true;
      } else {
        throw new Error('Delete operation returned no result');
      }
    } catch (error) {
      this.logger.error(
        `Failed to delete tweet vector ${tweetId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete multiple tweets in batch
   */
  async deleteTweetVectorsBatch(tweetIds: string[]): Promise<{
    success: boolean;
    deleted: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      deleted: 0,
      errors: [] as string[],
    };

    try {
      this.logger.log(`Deleting ${tweetIds.length} tweet vectors in batch`);

      const collectionName = this.qdrantConfig.getCollectionName();
      const deleteResult = await this.qdrantClient.deletePoints(
        collectionName,
        tweetIds,
      );

      if (deleteResult) {
        result.deleted = tweetIds.length;
        result.success = true;
        this.logger.log(
          `Successfully deleted ${tweetIds.length} tweet vectors`,
        );
      } else {
        throw new Error('Batch delete operation returned no result');
      }
    } catch (error) {
      this.logger.error(`Batch deletion failed: ${error.message}`);
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalVectors: number;
    storageSize: number;
    indexedVectors: number;
    collectionHealth: string;
  }> {
    try {
      this.logger.debug('Getting storage statistics');

      const collectionStats = await this.qdrantCollection.getCollectionStats();

      return {
        totalVectors: collectionStats.totalVectors,
        storageSize: collectionStats.diskUsage || 0,
        indexedVectors: collectionStats.indexedVectors,
        collectionHealth: collectionStats.status,
      };
    } catch (error) {
      this.logger.error(`Failed to get storage stats: ${error.message}`);
      return {
        totalVectors: 0,
        storageSize: 0,
        indexedVectors: 0,
        collectionHealth: 'error',
      };
    }
  }

  /**
   * Get latest tweet by timestamp (globally or by account)
   */
  async getLatestTweetByTimestamp(
    account?: string,
  ): Promise<QdrantSearchResult | null> {
    try {
      this.logger.debug(
        `Getting latest tweet by timestamp${account ? ` for account: ${account}` : ' globally'}`,
      );

      const collectionName = this.qdrantConfig.getCollectionName();

      // Build filter for account if specified
      const filter = account
        ? {
            must: [
              {
                key: 'authorHandle',
                match: { value: account },
              },
            ],
          }
        : undefined;

      // Use zero vector for filtering-only query
      const zeroVector = new Array(
        this.qdrantConfig.getCollectionConfig().vectors.size,
      ).fill(0);

      const searchParams = {
        vector: zeroVector,
        limit: 1, // We only want the latest one
        score_threshold: 0, // Accept all scores for filtering-only queries
        with_payload: true,
        with_vector: false,
        filter: filter,
      };

      const result = await this.qdrantClient.searchPoints(
        collectionName,
        searchParams,
      );

      if (!result || result.length === 0) {
        this.logger.debug(
          `No tweets found${account ? ` for account: ${account}` : ' globally'}`,
        );
        return null;
      }

      // Sort by createdAt descending to get the latest
      const sortedResults = result.sort((a: any, b: any) => {
        const dateA = new Date(a.payload.createdAt);
        const dateB = new Date(b.payload.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      const latestTweet = sortedResults[0];

      this.logger.debug(
        `Found latest tweet${account ? ` for account: ${account}` : ' globally'}: ${latestTweet.payload.originalTweetId} at ${latestTweet.payload.createdAt}`,
      );

      return {
        id: latestTweet.id,
        version: latestTweet.version || 0,
        score: latestTweet.score,
        payload: latestTweet.payload,
        vector: latestTweet.vector,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get latest tweet${account ? ` for account: ${account}` : ' globally'}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get latest tweet by account (convenience method)
   */
  async getLatestTweetByAccount(
    account: string,
  ): Promise<QdrantSearchResult | null> {
    return this.getLatestTweetByTimestamp(account);
  }

  /**
   * Get latest tweet globally (convenience method)
   */
  async getLatestTweetGlobally(): Promise<QdrantSearchResult | null> {
    return this.getLatestTweetByTimestamp();
  }

  /**
   * Check repository health
   */
  async checkHealth(): Promise<{
    isHealthy: boolean;
    issues: string[];
    stats: any;
  }> {
    const issues: string[] = [];

    try {
      // Check collection health
      const collectionHealth =
        await this.qdrantCollection.checkCollectionHealth();

      if (!collectionHealth.isHealthy) {
        issues.push(...collectionHealth.issues);
      }

      // Get current stats
      const stats = await this.getStorageStats();

      // Check basic functionality
      try {
        await this.qdrantClient.healthCheck();
      } catch (error) {
        issues.push(`Qdrant client health check failed: ${error.message}`);
      }

      return {
        isHealthy: issues.length === 0,
        issues,
        stats,
      };
    } catch (error) {
      issues.push(`Repository health check failed: ${error.message}`);
      return {
        isHealthy: false,
        issues,
        stats: null,
      };
    }
  }
}
