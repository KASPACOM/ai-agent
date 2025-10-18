import { Injectable, Logger } from '@nestjs/common';
import { TwitterRepository } from '../../../database/mongodb/repositories/twitter.repository';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { TwitterMasterDocumentTransformer } from '../transformers/twitter-master-document.transformer';

/**
 * Vector Generation Result
 */
export interface VectorGenerationResult {
  processed: number;
  stored: number;
  errors: string[];
  unprocessedRemaining: number;
}

/**
 * Twitter Vector Generation Service
 *
 * Generates vectors for tweets stored in MongoDB and saves them to Qdrant.
 * Following DEVELOPMENT_RULES.md: Separation of concerns - data collection vs vector generation.
 *
 * Process:
 * 1. Query MongoDB for unprocessed tweets (vectorGeneratedAt is null)
 * 2. Transform raw tweets to MasterDocument format
 * 3. Generate embeddings and store in Qdrant
 * 4. Mark tweets as processed in MongoDB
 */
@Injectable()
export class TwitterVectorGenerationService {
  private readonly logger = new Logger(TwitterVectorGenerationService.name);
  private readonly DEFAULT_BATCH_SIZE = 100;

  constructor(
    private readonly twitterRepo: TwitterRepository,
    private readonly unifiedStorage: UnifiedStorageService,
  ) {}

  /**
   * Generate vectors for all unprocessed tweets
   * Processes in batches until all tweets are processed or batch size is reached
   */
  async generateVectors(
    batchSize: number = this.DEFAULT_BATCH_SIZE,
  ): Promise<VectorGenerationResult> {
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalStored = 0;
    const errors: string[] = [];

    try {
      this.logger.log('Starting vector generation for Twitter tweets');

      // Get unprocessed tweets from MongoDB
      const unprocessedTweets = await this.twitterRepo.getUnprocessed(batchSize);

      if (unprocessedTweets.length === 0) {
        this.logger.log('No unprocessed tweets found');
        return {
          processed: 0,
          stored: 0,
          errors: [],
          unprocessedRemaining: 0,
        };
      }

      this.logger.log(
        `Found ${unprocessedTweets.length} unprocessed tweets. Generating vectors...`,
      );

      // Transform to MasterDocuments
      const masterDocuments = [];
      for (const tweet of unprocessedTweets) {
        try {
          const masterDoc =
            TwitterMasterDocumentTransformer.transformTweetToMasterDocument(
              tweet.payload,
              tweet.username,
            );
          masterDocuments.push(masterDoc);
          totalProcessed++;
        } catch (error) {
          const errorMsg = `Failed to transform tweet ${tweet.tweetId}: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Store in Qdrant with embeddings
      if (masterDocuments.length > 0) {
        const storageResult =
          await this.unifiedStorage.storeBatch(masterDocuments);
        totalStored = storageResult.stored;
        errors.push(...storageResult.errors);

        // Mark tweets as processed in MongoDB
        const tweetIds = unprocessedTweets
          .slice(0, masterDocuments.length)
          .map((t) => t.tweetId);
        await this.twitterRepo.markAsProcessed(tweetIds);

        this.logger.log(
          `✅ Generated and stored ${totalStored} tweet vectors in ${Date.now() - startTime}ms`,
        );
      }

      // Get remaining unprocessed count
      const unprocessedRemaining = await this.twitterRepo.getUnprocessedCount();

      return {
        processed: totalProcessed,
        stored: totalStored,
        errors,
        unprocessedRemaining,
      };
    } catch (error) {
      this.logger.error(
        `Vector generation failed: ${error.message}`,
        error.stack,
      );

      return {
        processed: totalProcessed,
        stored: totalStored,
        errors: [...errors, error.message],
        unprocessedRemaining: 0,
      };
    }
  }

  /**
   * Get statistics about vector generation
   */
  async getGenerationStats(): Promise<{
    unprocessedCount: number;
    totalTweets: number;
  }> {
    const unprocessedCount = await this.twitterRepo.getUnprocessedCount();
    // Total tweets would require a count query - for now just return unprocessed
    return {
      unprocessedCount,
      totalTweets: 0, // Would need separate query to get total
    };
  }
}

