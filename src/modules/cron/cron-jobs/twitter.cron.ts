import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TwitterIndexerService } from 'src/modules/indexer/twitter/services/twitter-indexer.service';

@Injectable()
export class TwitterCron {
    private readonly logger = new Logger(TwitterCron.name);

    constructor(private readonly twitterIndexer: TwitterIndexerService) { }

    @Cron('*/15 * * * *')
    async handleCron() {
        try {
            const result = await this.twitterIndexer.runIndexer();
            this.logger.log(
                `Twitter indexing completed: ${result.processed} processed, ${result.errors.length} errors`,
            );
        } catch (error) {
            this.logger.error(`Twitter indexing failed: ${error.message}`);
        }
    }
}
