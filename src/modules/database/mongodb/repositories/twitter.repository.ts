import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TwitterTweetDocument } from '../schemas/twitter.schema';
import { TwitterTweet } from '../models/twitter-tweet.model';

/**
 * Result interface for storage operations
 */
export interface StorageBatchResult {
  stored: number;
  duplicates: number;
}

/**
 * Tweet with ID result
 */
export interface TweetWithDate {
  tweetId: string;
  createdAt: Date;
}

/**
 * Twitter Repository
 *
 * Handles all MongoDB operations for Twitter tweets.
 * Following DEVELOPMENT_RULES.md: Clean, maintainable, well-commented.
 */
@Injectable()
export class TwitterRepository {
  private readonly logger = new Logger(TwitterRepository.name);

  constructor(
    @InjectModel(TwitterTweetDocument.name)
    private readonly tweetModel: Model<TwitterTweetDocument>,
  ) {}

  /**
   * Store a batch of tweets
   * Handles duplicates gracefully
   */
  async storeBatch(tweets: TwitterTweet[]): Promise<StorageBatchResult> {
    if (tweets.length === 0) {
      return { stored: 0, duplicates: 0 };
    }

    let stored = 0;
    let duplicates = 0;

    for (const tweet of tweets) {
      try {
        await this.tweetModel.create(tweet);
        stored++;
      } catch (error) {
        // Duplicate key error (code 11000)
        if (error.code === 11000) {
          duplicates++;
          this.logger.debug(`Duplicate tweet skipped: ${tweet.tweetId}`);
        } else {
          this.logger.error(
            `Failed to store tweet ${tweet.tweetId}: ${error.message}`,
          );
          throw error;
        }
      }
    }

    this.logger.log(
      `Stored ${stored} tweets, skipped ${duplicates} duplicates`,
    );
    return { stored, duplicates };
  }

  /**
   * Query tweets since a specific date for an account
   */
  async querySince(username: string, sinceDate: Date): Promise<TwitterTweet[]> {
    const tweets = await this.tweetModel
      .find({
        username: username.toLowerCase(),
        createdAt: { $gt: sinceDate },
      })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return tweets.map((tweet) => this.mapDocumentToModel(tweet));
  }

  /**
   * Get latest tweet for an account
   */
  async getLatestForAccount(username: string): Promise<TweetWithDate | null> {
    const tweet = await this.tweetModel
      .findOne({ username: username.toLowerCase() })
      .sort({ createdAt: -1 })
      .select('tweetId createdAt')
      .lean()
      .exec();

    if (!tweet) {
      return null;
    }

    return {
      tweetId: tweet.tweetId,
      createdAt: tweet.createdAt,
    };
  }

  /**
   * Get earliest tweet for an account
   */
  async getEarliestForAccount(username: string): Promise<TweetWithDate | null> {
    const tweet = await this.tweetModel
      .findOne({ username: username.toLowerCase() })
      .sort({ createdAt: 1 })
      .select('tweetId createdAt')
      .lean()
      .exec();

    if (!tweet) {
      return null;
    }

    return {
      tweetId: tweet.tweetId,
      createdAt: tweet.createdAt,
    };
  }

  /**
   * Get all tweets for an account (or all tweets if no username provided)
   */
  async getAllTweets(username?: string): Promise<TwitterTweet[]> {
    const query = username ? { username: username.toLowerCase() } : {};

    const tweets = await this.tweetModel
      .find(query)
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return tweets.map((tweet) => this.mapDocumentToModel(tweet));
  }

  /**
   * Get unprocessed tweets (where vectorGeneratedAt is null)
   */
  async getUnprocessed(limit: number = 1000): Promise<TwitterTweet[]> {
    const tweets = await this.tweetModel
      .find({ vectorGeneratedAt: null })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean()
      .exec();

    return tweets.map((tweet) => this.mapDocumentToModel(tweet));
  }

  /**
   * Mark tweets as processed by setting vectorGeneratedAt
   */
  async markAsProcessed(tweetIds: string[]): Promise<void> {
    if (tweetIds.length === 0) {
      return;
    }

    const result = await this.tweetModel
      .updateMany(
        { tweetId: { $in: tweetIds } },
        { $set: { vectorGeneratedAt: new Date() } },
      )
      .exec();

    this.logger.log(
      `Marked ${result.modifiedCount} tweets as processed (vector generated)`,
    );
  }

  /**
   * Get count of unprocessed tweets
   */
  async getUnprocessedCount(): Promise<number> {
    return this.tweetModel.countDocuments({ vectorGeneratedAt: null }).exec();
  }

  /**
   * Map MongoDB document to model interface
   */
  private mapDocumentToModel(doc: any): TwitterTweet {
    return {
      tweetId: doc.tweetId,
      username: doc.username,
      createdAt: doc.createdAt,
      payload: doc.payload,
      fetchedAt: doc.fetchedAt,
      vectorGeneratedAt: doc.vectorGeneratedAt,
    };
  }
}
