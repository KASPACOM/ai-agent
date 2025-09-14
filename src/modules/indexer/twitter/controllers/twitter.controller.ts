import {
  Controller,
  Post,
  Logger,
  Get,
  Query,
  Param,
  Body,
} from '@nestjs/common';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { TwitterService } from '../services/twitter.service';
import { TwitterRawAuditService } from '../services/twitter-raw-audit.service';
import { AppConfigService } from 'src/modules/core/modules/config/app-config.service';
import { TwitterDocGenerationService } from '../services/twitter-doc-generation.service';
import { AgentFactory } from 'src/modules/multiagent/agents/agent-factory.service';
import { OrchestratorService } from 'src/modules/orchestrator/orchestrator.service';
import { TwitterApiService } from 'src/modules/integrations/twitter/twitter-api.service';
import { TwitterRawIndexerService } from '../services/twitter-raw-indexer.service';
import { CREATE_TELEGRAM_PROMPT } from 'src/modules/prompt-builder/prompts/orchestrator/weekly-digest.prompt';

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
    private readonly twitterService: TwitterService,
    private readonly rawAudit: TwitterRawAuditService,
    private readonly appConfig: AppConfigService,
    private readonly twitterDocGen: TwitterDocGenerationService,
    private readonly agentFactory: AgentFactory,
    private readonly orchestrator: OrchestratorService,
    private readonly twitterApi: TwitterApiService,
    private readonly rawIndexer: TwitterRawIndexerService,
  ) {}

  // Removed deprecated /twitter/run endpoint and TwitterIndexerService injection

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
      };
    }

    const tweet = await this.twitterService.getTweetById(tweetId);

    if (!tweet) {
      return {
        success: false,
        message: 'Tweet not found',
      };
    }

    const result = await this.twitterService.respondToTweet(tweet);

    return {
      success: result.is_responded,
      message: result.twit_text,
      tweetId: result.twit_id,
    };
  }

  @Post('summary/weekly')
  async runWeeklySummary(
    @Query('days') days?: string,
    @Query('source') source?: string | string[],
  ): Promise<any> {
    const agent = this.agentFactory.createQdrantAgent();
    const result = await agent.executeCapability(
      'qdrant_create_weekly_summary',
      {
        days: days ? parseInt(days, 10) : 7,
        sources: Array.isArray(source)
          ? source
          : source
            ? [source]
            : ['TWITTER', 'TELEGRAM'],
      },
    );
    return result;
  }

  /**
   * Backfill postedAt in unified collection from raw tweets
   * POST /twitter/backfill/posted-at
   */
  @Post('backfill/posted-at')
  async backfillPostedAt(
    @Query('account') account?: string,
  ): Promise<{ updated: number }> {
    return this.twitterDocGen.backfillPostedAt({ username: account });
  }

  /**
   * Generate a synthesized result via orchestrator and post to Twitter
   * POST /twitter/publish
   * Body: { prompt: string; thread?: boolean; dryRun?: boolean }
   */
  @Post('publish')
  async publishSynthesis(
    @Body()
    body: {
      prompt: string;
      thread?: boolean;
      dryRun?: boolean;
    },
  ): Promise<{ success: boolean; tweetId?: string; message?: string }> {
    let prompt = body?.prompt;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return { success: false, message: 'prompt is required' };
    }

    prompt = CREATE_TELEGRAM_PROMPT;
    // Run through orchestrator to get synthesized response
    const response = await this.orchestrator.processMessage(
      'twitter-publish-manual',
      prompt,
      { platform: 'twitter' },
    );

    const text = response?.response || '';
    if (!text) return { success: false, message: 'Empty synthesized result' };

    if (body?.dryRun) {
      return { success: true, message: '[DRY RUN] ' + text.slice(0, 2000) };
    }

    if (body?.thread) {
      const first = await this.twitterApi.postThread(text);
      return { success: true, tweetId: first?.id, message: 'Thread posted' };
    } else {
      const tw = await this.twitterApi.postTweet(text);
      return { success: true, tweetId: tw?.id, message: 'Tweet posted' };
    }
  }

  /**
   * Trigger RAW backfill indexing across configured accounts
   * POST /twitter/raw/backfill
   */
  @Post('raw/backfill')
  async triggerRawBackfill(): Promise<IndexingResult> {
    this.logger.log('Manual twitter RAW backfill triggered via API');
    return this.rawIndexer.runBackfillIndexing();
  }
}
