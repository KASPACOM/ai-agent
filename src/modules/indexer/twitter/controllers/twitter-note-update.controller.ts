import { Controller, Post, Get, Query, Logger } from '@nestjs/common';
import {
  TwitterNoteUpdateService,
  UpdateResult,
} from '../services/twitter-note-update.service';

/**
 * Twitter Note Update Controller
 *
 * HTTP endpoints for managing Twitter note_tweet updates
 */
@Controller('twitter/note-update')
export class TwitterNoteUpdateController {
  private readonly logger = new Logger(TwitterNoteUpdateController.name);

  constructor(
    private readonly twitterNoteUpdateService: TwitterNoteUpdateService,
  ) {}

  /**
   * Update tweets with note_tweet content
   *
   * @param batchSize Number of tweets to process in one batch (default: 100)
   * @param dryRun If true, only logs what would be updated without making changes (default: false)
   */
  @Post('update')
  async updateTweetsWithNoteContent(
    @Query('batchSize') batchSize?: string,
    @Query('dryRun') dryRun?: string,
  ): Promise<UpdateResult> {
    try {
      const options = {
        batchSize: batchSize ? parseInt(batchSize, 10) : 100,
        dryRun: dryRun === 'true',
      };

      this.logger.log(
        `🚀 Starting Twitter note_tweet update${options.dryRun ? ' (DRY RUN)' : ''}`,
      );
      this.logger.log(`📊 Batch size: ${options.batchSize}`);

      const result =
        await this.twitterNoteUpdateService.updateTweetsWithNoteContent(
          options,
        );

      this.logger.log(
        `✅ Update completed: ${result.updated}/${result.processed} tweets updated`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Twitter note_tweet update failed: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get status/health check for the update service
   */
  @Get('status')
  async getStatus(): Promise<{
    service: string;
    status: string;
    description: string;
  }> {
    return {
      service: 'TwitterNoteUpdateService',
      status: 'ready',
      description: 'Service ready to update tweets with note_tweet content',
    };
  }
}
