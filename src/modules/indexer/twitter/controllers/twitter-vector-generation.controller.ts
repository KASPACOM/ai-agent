import { Controller, Post, Get, Query, Logger } from '@nestjs/common';
import { TwitterVectorGenerationService, VectorGenerationResult } from '../services/twitter-vector-generation.service';

/**
 * Twitter Vector Generation Controller
 *
 * Provides endpoints for generating vectors from MongoDB-stored tweets.
 * Following DEVELOPMENT_RULES.md: Clean separation - indexing vs vector generation.
 *
 * Routes:
 * - POST /twitter/vectors - Generate vectors for unprocessed tweets
 * - GET /twitter/vectors/stats - Get vector generation statistics
 */
@Controller('twitter')
export class TwitterVectorGenerationController {
  private readonly logger = new Logger(TwitterVectorGenerationController.name);

  constructor(
    private readonly vectorGenService: TwitterVectorGenerationService,
  ) {}

  /**
   * Generate vectors for unprocessed tweets
   * POST /twitter/vectors
   * Query params:
   * - batchSize: number (default: 100)
   */
  @Post('vectors')
  async generateVectors(
    @Query('batchSize') batchSize?: string,
  ): Promise<VectorGenerationResult> {
    const parsedBatchSize = batchSize ? parseInt(batchSize, 10) : 100;

    this.logger.log(
      `📊 Generating vectors for unprocessed tweets (batch size: ${parsedBatchSize})`,
    );

    const result = await this.vectorGenService.generateVectors(parsedBatchSize);

    this.logger.log(
      `✅ Vector generation completed: ${result.processed} processed, ${result.stored} stored, ${result.errors.length} errors, ${result.unprocessedRemaining} remaining`,
    );

    return result;
  }

  /**
   * Get vector generation statistics
   * GET /twitter/vectors/stats
   */
  @Get('vectors/stats')
  async getStats(): Promise<{
    unprocessedCount: number;
    totalTweets: number;
  }> {
    this.logger.log('📊 Getting vector generation statistics');
    return this.vectorGenService.getGenerationStats();
  }
}

