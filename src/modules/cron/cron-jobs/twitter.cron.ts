import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TwitterService } from 'src/modules/indexer/twitter/services/twitter.service';
import { OrchestratorService } from 'src/modules/orchestrator/orchestrator.service';
import { WEEKLY_DIGEST_PROMPT } from 'src/modules/prompt-builder/prompts/orchestrator/weekly-digest.prompt';

@Injectable()
export class TwitterCron {
  private readonly logger = new Logger(TwitterCron.name);

  constructor(
    private readonly twitterService: TwitterService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  // @Cron(CronExpression.EVERY_5_MINUTES)
  // async handleCron() {
  //   this.logger.debug('Checking for bot mentions and respondingIfNeeded');
  //   await this.twitterService.checkForBotMentionsAndRespondIfNeeded();
  // }

  // Weekly digest every Sunday 00:00
  @Cron('19 12 * * *')
  async weeklyDigest() {
    try {
      await this.orchestrator.processMessage(
        'weekly-digest-cron',
        WEEKLY_DIGEST_PROMPT,
        {
          platform: 'system',
          isChannel: false,
        },
      );
      this.logger.log('Weekly digest task triggered');
    } catch (error) {
      this.logger.error(`Weekly digest failed: ${error.message}`);
    }
  }
}
