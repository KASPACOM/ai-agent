import { Controller, Post, Logger, OnModuleInit } from '@nestjs/common';
import { TwitterIndexerService } from '../services/twitter-indexer.service';
import { AccountRotationService } from '../services/account-rotation.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { CronManager } from '../../shared/services/cron-manager.service';

/**
 * Twitter Controller
 *
 * Simple controller for Twitter indexing operations.
 * Following user's suggestion: Each module has a controller that uses shared CronManager.
 */
@Controller('twitter')
export class TwitterController implements OnModuleInit {
  private readonly logger = new Logger(TwitterController.name);

  constructor(
    private readonly twitterIndexer: TwitterIndexerService,
    private readonly accountRotation: AccountRotationService,
    private readonly cronManager: CronManager,
  ) {}

  async onModuleInit() {
    try {
      const result = await this.twitterIndexer.runIndexer();
      this.logger.log(
        `Twitter indexing completed: ${result.processed} processed, ${result.errors.length} errors`,
      );
    } catch (error) {
      this.logger.error(`Twitter indexing failed: ${error.message}`);
    }
    // ✅ Setup cron job using shared CronManager (builder pattern)
    this.cronManager.addJob({
      name: 'twitter-indexer',
      cronExpression: '*/15 * * * * *', // Every 30 minutes (more frequent than Telegram)
      handler: async () => {
        try {
          const result = await this.twitterIndexer.runIndexer();
          this.logger.log(
            `Twitter indexing completed: ${result.processed} processed, ${result.errors.length} errors`,
          );
        } catch (error) {
          this.logger.error(`Twitter indexing failed: ${error.message}`);
        }
      },
      enabled: true,
    });

    this.logger.log('Twitter Controller initialized with cron job');
  }

  /**
   * Manual trigger endpoint
   * POST /twitter/run
   */
  @Post('run')
  async triggerManualRun(): Promise<IndexingResult> {
    this.logger.log('Manual twitter indexing triggered via API');
    return this.twitterIndexer.runIndexer();
  }
}
