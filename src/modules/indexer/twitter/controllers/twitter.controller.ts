import {
  Controller,
  Post,
  Logger,
  Get,
  Query,
  Param,
  Body,
} from '@nestjs/common';
import { TwitterIndexerService } from '../services/twitter-indexer.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { TwitterService } from '../services/twitter.service';
import { TwitterRawAuditService } from '../services/twitter-raw-audit.service';
import { AppConfigService } from 'src/modules/core/modules/config/app-config.service';
import { TwitterDocGenerationService } from '../services/twitter-doc-generation.service';
import { AgentFactory } from 'src/modules/multiagent/agents/agent-factory.service';
import { OrchestratorService } from 'src/modules/orchestrator/orchestrator.service';
import { TwitterApiService } from 'src/modules/integrations/twitter/twitter-api.service';

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
    private readonly agentFactory: AgentFactory,
    private readonly orchestrator: OrchestratorService,
    private readonly twitterApi: TwitterApiService,
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
  async runWeeklySummary(@Query('days') days?: string): Promise<any> {
    const agent = this.agentFactory.createQdrantAgent();
    const result = await agent.executeCapability(
      'qdrant_create_weekly_summary',
      {
        days: days ? parseInt(days, 10) : 7,
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
    const prompt = body?.prompt;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return { success: false, message: 'prompt is required' };
    }

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
}
