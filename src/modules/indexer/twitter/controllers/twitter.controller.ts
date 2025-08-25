import { Controller, Post, Logger, Get, Query } from '@nestjs/common';
import { TwitterIndexerService } from '../services/twitter-indexer.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { TwitterService } from '../services/twitter.service';
import { TwitterRawAuditService } from '../services/twitter-raw-audit.service';
import { AppConfigService } from 'src/modules/core/modules/config/app-config.service';

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
}
