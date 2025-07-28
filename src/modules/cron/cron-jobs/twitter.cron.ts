import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TwitterIndexerService } from 'src/modules/indexer/twitter/services/twitter-indexer.service';
import { AppConfigService } from 'src/modules/core/modules/config/app-config.service';
    
@Injectable()
export class TwitterCron {
    private readonly logger = new Logger(TwitterCron.name);

    constructor(private readonly twitterIndexer: TwitterIndexerService, private readonly appConfig: AppConfigService) { }

    @Cron('*/15 * * * *')
    async handleCron() {
        if (this.appConfig.getSkipIndexers) {
            this.logger.log('Skipping Twitter indexing');
            return;
        }
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
