import { Controller, Post, Logger, Get, Query, Param } from '@nestjs/common';
import { TwitterIndexerService } from '../services/twitter-indexer.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { TwitterService } from '../services/twitter.service';
import { TwitterRawAuditService } from '../services/twitter-raw-audit.service';
import { AppConfigService } from 'src/modules/core/modules/config/app-config.service';
import { TwitterDocGenerationService } from '../services/twitter-doc-generation.service';

/**
 * Twitter Controller
 *
 * Simple controller for Twitter indexing operations.
 * Following user's suggestion: Each module has a controller that uses shared CronManager.
 */
@Controller('twitter')
export class TwitterController {
  private readonly logger = new Logger(TwitterController.name);

  constructor(
    private readonly twitterIndexer: TwitterIndexerService,
    private readonly twitterService: TwitterService,
    private readonly rawAudit: TwitterRawAuditService,
    private readonly appConfig: AppConfigService,
    private readonly twitterDocGen: TwitterDocGenerationService,
  ) {}

  /**
   * Manual trigger endpoint
   * POST /twitter/run
   */
  @Post('run')
  async triggerManualRun(): Promise<IndexingResult> {
    this.logger.log('Manual twitter indexing triggered via API');
    return this.twitterIndexer.runIndexer();
  }

  @Post('mentions')
  async triggerManualRunMentions(): Promise<IndexingResult> {
    this.logger.log('Manual twitter mentions indexing triggered via API');
    return await this.twitterService.checkForBotMentionsAndRespondIfNeeded();
  }

  @Get('raw/audit')
  async auditRaw(@Query('account') account?: string): Promise<any> {
    if (account) return this.rawAudit.auditAccount(account);
    const accounts = this.appConfig.getTwitterAccountsConfig || [];
    return this.rawAudit.auditAll(accounts);
  }

  @Post('raw/reconcile-counts')
  async reconcileCounts(@Query('account') account?: string): Promise<any> {
    const accounts = account
      ? [account]
      : this.appConfig.getTwitterAccountsConfig || [];
    return this.rawAudit.reconcileCounts(accounts);
  }

  /**
   * Trigger full migration: create missing docs and update existing from raw
   * POST /twitter/migrate/full?account=:username
   */
  @Post('migrate/full')
  async runFullMigration(@Query('account') account?: string): Promise<any> {
    return this.twitterDocGen.runFullMigration({ username: account });
  }

  @Post('manual-comment/:tweetId')
  async triggerManualComment(@Param('tweetId') tweetId: string): Promise<{
    success: boolean;
    message: string;
    tweetId?: string;
  }> {
    if (!tweetId) {
      return {
        success: false,
        message: 'Tweet ID is required',
      }
    }

    const tweet = await this.twitterService.getTweetById(tweetId);

    if (!tweet) {
      return {
        success: false,
        message: 'Tweet not found',
      }
    }

    const result = await this.twitterService.respondToTweet(tweet);

    return {
      success: result.is_responded,
      message: result.twit_text,
      tweetId: result.twit_id,
    };
  }
}
