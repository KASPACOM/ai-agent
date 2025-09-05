import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramIndexerService } from 'src/modules/indexer/telegram/services/telegram-indexer.service';
import { AppConfigService } from 'src/modules/core/modules/config/app-config.service';
import { BaseIndexerService } from 'src/modules/indexer/shared/services/base-indexer.service';
import { TwitterSourceIndexerService } from 'src/modules/indexer/twitter/services/twitter-source-indexer.service';
import { TwitterDocGenerationService } from 'src/modules/indexer/twitter/services/twitter-doc-generation.service';

@Injectable()
export class IndexersCron {
  private readonly logger = new Logger(IndexersCron.name);

  constructor(
    private readonly telegramIndexer: TelegramIndexerService,
    private readonly twitterSourceIndexer: TwitterSourceIndexerService,
    private readonly twitterDocGen: TwitterDocGenerationService,
    private readonly appConfig: AppConfigService,
  ) {}

  // @Cron('*/15 * * * *')
  // async runTelegramIndexer() {
  //   await this.runIndexer(this.telegramIndexer);
  // }

  // @Cron('*/15 * * * *')
  // async runTwitterRawIndexer() {
  //   await this.runIndexer(this.twitterSourceIndexer);
  // }

  // Run Doc Generation daily at 20:00 server time
  @Cron('0 0 20 * * *')
  async runTwitterDocGeneration() {
    if (this.appConfig.getSkipIndexers) {
      this.logger.log('Skipping doc generation');
      return;
    }
    try {
      // Iterate all configured accounts
      const accounts = this.appConfig.getTwitterAccountsConfig || [];
      let totalStored = 0;
      for (const username of accounts) {
        const res = await this.twitterDocGen.runForAccount(username);
        totalStored += res.stored;
      }
      this.logger.log(`Doc generation completed. Stored=${totalStored}`);
    } catch (error) {
      this.logger.error(`Doc generation failed: ${error.message}`);
    }
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
