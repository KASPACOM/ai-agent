import { Controller, Post, Logger, OnModuleInit } from '@nestjs/common';
import { TwitterIndexerService } from '../services/twitter-indexer.service';
import { AccountRotationService } from '../services/account-rotation.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';

/**
 * Twitter Controller
 *
 * Simple controller for Twitter indexing operations.
 * Following user's suggestion: Each module has a controller that uses shared CronManager.
 */
@Controller('twitter')
export class TwitterController {
  private readonly logger = new Logger(TwitterController.name);

  constructor(
    private readonly twitterIndexer: TwitterIndexerService,
  ) {}

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
