import { Controller, Post, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramIndexerService } from '../services/telegram-indexer.service';
import { TelegramHistoryService } from '../services/telegram-history.service';
import { CronManager } from '../../shared/services/cron-manager.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';

/**
 * Telegram Controller
 *
 * Simple controller for Telegram indexing operations.
 * Following user's suggestion: Each module has a controller that uses shared CronManager.
 */
@Controller('telegram')
export class TelegramController implements OnModuleInit {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegramIndexer: TelegramIndexerService,
    private readonly telegramHistory: TelegramHistoryService,
    private readonly cronManager: CronManager,
  ) {}

  async onModuleInit() {
    // ✅ Setup cron job using shared CronManager (builder pattern)
    this.cronManager.addJob({
      name: 'telegram-indexer',
      cronExpression: '0 0 20 * * *', // Daily at 8pm UTC
      handler: async () => {
        try {
          const result = await this.telegramIndexer.runIndexer();
          this.logger.log(
            `Telegram indexing completed: ${result.processed} processed, ${result.errors.length} errors`,
          );
        } catch (error) {
          this.logger.error(`Telegram indexing failed: ${error.message}`);
        }
      },
      enabled: true,
    });

    this.logger.log('Telegram Controller initialized with cron job');
  }

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
