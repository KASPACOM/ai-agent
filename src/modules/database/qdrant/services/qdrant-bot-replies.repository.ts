import { Injectable, Logger } from '@nestjs/common';
import { QdrantClientService } from '../services/qdrant-client.service';
import { QdrantConfigService } from '../config/qdrant.config';
import { generateUuidFromTwitterId } from './qdrant.repository';

export interface BotReply {
  twit_id?: string;
  twit_text?: string;
  is_responded: boolean;
  is_from_mentions: boolean;
  date: string; // ISO string format
  in_respond_to: string;
  vector?: number[]; // Optional vector for similarity search
}

@Injectable()
export class QdrantBotRepliesRepository {
  private readonly collectionName = 'bot_replies';
  private readonly logger = new Logger(QdrantBotRepliesRepository.name);

  constructor(
    private readonly qdrantClient: QdrantClientService,
    private readonly qdrantConfig: QdrantConfigService,
  ) { }

  /**
   * Store a bot reply in the collection
   */
  async storeReply(reply: BotReply): Promise<boolean> {
    try {
      await this.ensureCollectionExists();

      const point = {
        id: generateUuidFromTwitterId(reply.in_respond_to),
        vector: reply.vector || [0.0], // If no vector is provided, store empty array
        payload: {
          ...reply,
          // Ensure date is stored in ISO string format
          date: reply.date ? new Date(reply.date).toISOString() : new Date().toISOString(),
        },
      };

      console.log('point', point);

      const result = await this.qdrantClient.upsertPoints(this.collectionName, [point]);
      return result;
    } catch (error) {
      this.logger.error(`Failed to store bot reply: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a bot reply by its Twitter ID
   */
  async getReplyById(twitId: string): Promise<BotReply | null> {
    try {
      const result = await this.qdrantClient.getPoint(this.collectionName, twitId);
      if (!result) return null;

      return result;
    } catch (error) {
      this.logger.error(`Failed to get bot reply ${twitId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Find bot replies by the tweet they're responding to
   */
  async findRepliesByInResponseTo(inRespondTo: string | string[]): Promise<BotReply[]> {
    const inRespondToList = Array.isArray(inRespondTo) ? inRespondTo : [inRespondTo];

    const searchParams = {
      filter: {
        should: inRespondToList.map(value => ({
          key: 'in_respond_to',
          match: { value },
        })),  
      },
      limit: 100, // Adjust limit as needed
      with_payload: true,
      with_vector: false,
    };

    const results = await this.qdrantClient.scrollPoints(this.collectionName, searchParams);

    return results.points.map(p => p.payload);
  }

  /**
   * Find bot replies by date range
   */
  async findRepliesByDateRange(
    startDate: Date,
    endDate: Date,
    limit = 100,
  ): Promise<BotReply[]> {
    try {
      const searchParams = {
        filter: {
          must: [
            {
              key: 'date',
              range: {
                gte: startDate.toISOString(),
                lte: endDate.toISOString(),
              },
            },
          ],
        },
        limit,
        with_payload: true,
        with_vector: false,
      };

      const results = await this.qdrantClient.searchPoints(this.collectionName, searchParams);
      return results;
    } catch (error) {
      this.logger.error(
        `Failed to find replies between ${startDate} and ${endDate}: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Find similar bot replies using vector similarity
   */
  async findSimilarReplies(
    vector: number[],
    limit = 5,
    scoreThreshold = 0.7,
  ): Promise<Array<{ reply: BotReply; score: number }>> {
    try {
      const searchParams = {
        vector,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true,
        with_vector: false,
      };

      const results = await this.qdrantClient.searchPoints(this.collectionName, searchParams);

      return results;
    } catch (error) {
      this.logger.error(`Failed to find similar replies: ${error.message}`);
      return [];
    }
  }

  /**
   * Delete a bot reply by its Twitter ID
   */
  async deleteReply(twitId: string): Promise<boolean> {
    try {
      const result = await this.qdrantClient.deletePoints(this.collectionName, [twitId]);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete bot reply ${twitId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Ensure the collection exists with the correct schema
   */
  private async ensureCollectionExists(): Promise<void> {
    try {
      const exists = await this.qdrantClient.collectionExists(this.collectionName);

      if (!exists) {
        await this.qdrantClient.createCollection(this.collectionName, {
          vectors: {
            size: this.qdrantConfig.getCollectionConfig().vectors.size, // Use the same vector size as configured
            distance: 'Cosine', // Or another distance metric that fits your use case
          },
        });

        this.logger.log(`Created collection: ${this.collectionName}`);
      }
    } catch (error) {
      this.logger.error(`Failed to ensure collection exists: ${error.message}`);
      throw error;
    }
  }


  /**
   * Find the last reply date for given is_from_mentions
   */
  async findLastReplyDate(is_from_mentions: boolean): Promise<string | null> {
    try {
      const result = await this.qdrantClient.searchPoints(this.collectionName, {
        query: {
          must: {
            term: { is_from_mentions },
          },
        },
        sort: { date: 'desc' },
        limit: 1,
      });

      if (result.length === 0) {
        return null;
      }

      return result[0].payload?.date || null;
    } catch (error) {
      this.logger.error(`Failed to find last reply date: ${error.message}`);
      throw error;
    }
  }

}
