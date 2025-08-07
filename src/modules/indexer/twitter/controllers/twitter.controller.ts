import { Controller, Post, Logger, Param } from '@nestjs/common';
import { TwitterIndexerService } from '../services/twitter-indexer.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { TwitterService } from '../services/twitter.service';

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
