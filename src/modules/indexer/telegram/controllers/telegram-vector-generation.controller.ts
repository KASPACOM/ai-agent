import { Controller, Post, Get, Query, Logger } from '@nestjs/common';
import { TelegramVectorGenerationService, VectorGenerationResult } from '../services/telegram-vector-generation.service';

/**
 * Telegram Vector Generation Controller
 *
 * Provides endpoints for generating vectors from MongoDB-stored messages.
 * Following DEVELOPMENT_RULES.md: Clean separation - indexing vs vector generation.
 *
 * Routes:
 * - POST /telegram/vectors - Generate vectors for unprocessed messages
 * - GET /telegram/vectors/stats - Get vector generation statistics
 */
@Controller('telegram')
export class TelegramVectorGenerationController {
  private readonly logger = new Logger(TelegramVectorGenerationController.name);

  constructor(
    private readonly vectorGenService: TelegramVectorGenerationService,
  ) {}

  /**
   * Generate vectors for unprocessed messages
   * POST /telegram/vectors
   * Query params:
   * - batchSize: number (default: 100)
   */
  @Post('vectors')
  async generateVectors(
    @Query('batchSize') batchSize?: string,
  ): Promise<VectorGenerationResult> {
    const parsedBatchSize = batchSize ? parseInt(batchSize, 10) : 100;

    this.logger.log(
      `📊 Generating vectors for unprocessed messages (batch size: ${parsedBatchSize})`,
    );

    const result = await this.vectorGenService.generateVectors(parsedBatchSize);

    this.logger.log(
      `✅ Vector generation completed: ${result.processed} processed, ${result.stored} stored, ${result.errors.length} errors, ${result.unprocessedRemaining} remaining`,
    );

    return result;
  }

  /**
   * Get vector generation statistics
   * GET /telegram/vectors/stats
   */
  @Get('vectors/stats')
  async getStats(): Promise<{
    unprocessedCount: number;
    totalMessages: number;
  }> {
    this.logger.log('📊 Getting vector generation statistics');
    return this.vectorGenService.getGenerationStats();
  }
}

