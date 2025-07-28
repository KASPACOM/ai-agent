import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TelegramController } from '../../indexer/telegram/controllers/telegram.controller';
import { TelegramIndexerService } from 'src/modules/indexer/telegram/services/telegram-indexer.service';
import { AppConfigService } from 'src/modules/core/modules/config/app-config.service';

@Injectable()
export class TelegramCron {
    private readonly logger = new Logger(TelegramCron.name);

    constructor(private readonly telegramIndexer: TelegramIndexerService, private readonly appConfig: AppConfigService) { }

    @Cron('*/15 * * * *')
    async handleCron() {
        if (this.appConfig.getSkipIndexers) {
            this.logger.log('Skipping Telegram indexing');
            return;
        }
        
        try {
            const result = await this.telegramIndexer.runIndexer();
            this.logger.log(
                `Telegram indexing completed: ${result.processed} processed, ${result.errors.length} errors`,
            );
        } catch (error) {
            this.logger.error(`Telegram indexing failed: ${error.message}`);
        }
    }
}
