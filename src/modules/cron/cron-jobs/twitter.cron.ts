import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TwitterService } from 'src/modules/indexer/twitter/services/twitter.service';

@Injectable()
export class TwitterCron {
    private readonly logger = new Logger(TwitterCron.name);

    constructor(private readonly twitterService: TwitterService) { }

    // @Cron(CronExpression.EVERY_5_MINUTES)
    // async handleCron() {
    //     this.logger.debug('Checking for bot mentions and respondingIfNeeded');
    //     await this.twitterService.checkForBotMentionsAndRespondIfNeeded();
    // }
}
