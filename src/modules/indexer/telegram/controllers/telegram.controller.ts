import { Controller, Post, Logger } from '@nestjs/common';
import { TelegramIndexerService } from '../services/telegram-indexer.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';

/**
 * Telegram Controller
 *
 * Simple controller for Telegram indexing operations.
 * Following user's suggestion: Each module has a controller that uses shared CronManager.
 */
@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(private readonly telegramIndexer: TelegramIndexerService) {}

  /**
   * Manual trigger endpoint
   * POST /telegram/run
   */
  @Post('run')
  async triggerManualRun(): Promise<IndexingResult> {
    this.logger.log('Manual telegram indexing triggered via API');
    return this.telegramIndexer.runIndexer();
  }
}
