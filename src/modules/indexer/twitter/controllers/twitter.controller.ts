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

  /**
   * Search tweets with conversation enrichment
   * GET /twitter/search-with-conversations
   */
  @Get('search-with-conversations')
  async searchWithConversations(
    @Query('query') query: string,
    @Query('limit') limit: number = 10,
    @Query('enrich_conversations') enrichConversations: string = 'true',
  ): Promise<EnrichedConversationResult[]> {
    try {
      this.logger.log(`Searching tweets with conversations: ${query}`);

      // Convert query to embedding vector if provided
      let queryVector: number[] | undefined;
      if (query && query.trim()) {
        queryVector = await this.embeddingService.generateEmbedding(query);
      }

      // Perform regular search
      const searchResults = await this.qdrantRepository.searchTweets({
        queryVector,
        limit: Math.min(limit, 50), // Cap at 50 for performance
      });

      const shouldEnrichConversations =
        enrichConversations.toLowerCase() === 'true';

      if (!shouldEnrichConversations) {
        // Return simple format without conversation enrichment
        return searchResults.map((result) => ({
          originalResult: result,
          conversation: {
            conversationId: result.payload.conversationId || result.payload.id,
            originalTweet: null,
            replies: [],
            totalTweets: 1,
          },
        }));
      }

      // Enrich with conversation data
      return await this.qdrantRepository.enrichWithConversations(searchResults);
    } catch (error) {
      this.logger.error(
        `Failed to search with conversations: ${error.message}`,
      );
      throw error;
    }
  }
}
