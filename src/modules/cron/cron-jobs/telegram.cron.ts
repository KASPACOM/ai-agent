import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TelegramController } from '../../indexer/telegram/controllers/telegram.controller';
import { TelegramIndexerService } from 'src/modules/indexer/telegram/services/telegram-indexer.service';

@Injectable()
export class TelegramCron {
    private readonly logger = new Logger(TelegramCron.name);

    constructor(private readonly telegramIndexer: TelegramIndexerService) { }

    @Cron('*/15 * * * *')
    async handleCron() {
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
