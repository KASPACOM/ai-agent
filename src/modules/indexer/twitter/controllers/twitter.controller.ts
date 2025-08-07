import { Controller, Post, Get, Query, Logger } from '@nestjs/common';
import { TwitterIndexerService } from '../services/twitter-indexer.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { TwitterService } from '../services/twitter.service';
import {
  QdrantRepository,
  EnrichedConversationResult,
} from '../../../database/qdrant/services/qdrant.repository';
import { EmbeddingService } from '../../../embedding/embedding.service';

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
    private readonly qdrantRepository: QdrantRepository,
    private readonly embeddingService: EmbeddingService,
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

  /**
   * Manual trigger for conversation completion
   * POST /twitter/complete-conversations
   */
  @Post('complete-conversations')
  async completeConversations(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      this.logger.log('Manual conversation completion triggered via API');
      await this.twitterIndexer.completeConversations();
      return {
        success: true,
        message: 'Conversation completion process started',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to start conversation completion: ${error.message}`,
      };
    }
  }
}
