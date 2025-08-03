import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramIndexerService } from 'src/modules/indexer/telegram/services/telegram-indexer.service';
import { AppConfigService } from 'src/modules/core/modules/config/app-config.service';
import { BaseIndexerService } from 'src/modules/indexer/shared/services/base-indexer.service';
import { TwitterIndexerService } from 'src/modules/indexer/twitter/services/twitter-indexer.service';

@Injectable()
export class IndexersCron {
  private readonly logger = new Logger(IndexersCron.name);

  constructor(
    private readonly telegramIndexer: TelegramIndexerService,
    private readonly twitterIndexer: TwitterIndexerService,
    private readonly appConfig: AppConfigService,
  ) {}

//   @Cron('*/15 * * * *')
//   async runTelegramIndexer() {
//     await this.runIndexer(this.telegramIndexer);
//   }

  @Cron('*/15 * * * *')
  async runTwitterIndexer() {
    await this.runIndexer(this.twitterIndexer);
  }

  protected async runIndexer(indexer: BaseIndexerService) {
    if (this.appConfig.getSkipIndexers) {
      this.logger.log(`Skipping ${indexer.constructor.name} indexing`);
      return;
    }

    try {
      const result = await indexer.runIndexer();
      this.logger.log(
        `${indexer.constructor.name} indexing completed: ${result.processed} processed, ${result.errors.length} errors`,
      );
    } catch (error) {
      this.logger.error(
        `${indexer.constructor.name} indexing failed: ${error.message}`,
      );
    }
  }
}
