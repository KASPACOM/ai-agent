import { Injectable, Logger } from '@nestjs/common';
import { TwitterRepository } from '../../../database/mongodb/repositories/twitter.repository';
import { TwitterTweet } from '../../../database/mongodb/models/twitter-tweet.model';

/**
 * Result interface for storage operations
 */
export interface RawTweetRecord {
  id: string; // tweet id
  username: string;
  createdAt: string;
  payload: Record<string, unknown>;
  fetchedAt: string;
}

/**
 * Twitter Storage Service
 *
 * Handles storage of raw tweets in MongoDB.
 * Following DEVELOPMENT_RULES.md: Single transformation principle.
 */
@Injectable()
export class TwitterRawStorageService {
  private readonly logger = new Logger(TwitterRawStorageService.name);

  constructor(private readonly twitterRepo: TwitterRepository) {}

  async storeBatch(
    tweets: RawTweetRecord[],
  ): Promise<{ stored: number; duplicates: number }> {
    if (tweets.length === 0) {
      return { stored: 0, duplicates: 0 };
    }

    // Transform to MongoDB model format
    const mongoTweets: TwitterTweet[] = tweets.map((t) => ({
      tweetId: t.id,
      username: t.username.toLowerCase(),
      createdAt: new Date(t.createdAt),
      payload: t.payload,
      fetchedAt: new Date(t.fetchedAt),
      vectorGeneratedAt: undefined,
    }));

    return this.twitterRepo.storeBatch(mongoTweets);
  }

  async querySince(
    username: string,
    sinceIso: string,
  ): Promise<RawTweetRecord[]> {
    const tweets = await this.twitterRepo.querySince(
      username,
      new Date(sinceIso),
    );

    // Transform back to RawTweetRecord format for compatibility
    return tweets.map((t) => ({
      id: t.tweetId,
      username: t.username,
      createdAt: t.createdAt.toISOString(),
      payload: t.payload,
      fetchedAt: t.fetchedAt.toISOString(),
    }));
  }

  async getLatestForAccount(
    username: string,
  ): Promise<{ id: string; createdAt: string } | undefined> {
    const result = await this.twitterRepo.getLatestForAccount(username);

    if (!result) {
      return undefined;
    }

    return {
      id: result.tweetId,
      createdAt: result.createdAt.toISOString(),
    };
  }

  async getLatestForAccountWithoutVector(
    username: string,
  ): Promise<{ id: string; createdAt: string } | undefined> {
    // Same as getLatestForAccount in MongoDB (no vector concept)
    return this.getLatestForAccount(username);
  }

  async getEarliestForAccountWithoutVector(
    username: string,
  ): Promise<{ id: string; createdAt: string } | undefined> {
    const result = await this.twitterRepo.getEarliestForAccount(username);

    if (!result) {
      return undefined;
    }

    return {
      id: result.tweetId,
      createdAt: result.createdAt.toISOString(),
    };
  }

  /**
   * Get all raw tweets. Optionally filter by username.
   */
  async getAllRawTweets(username?: string): Promise<RawTweetRecord[]> {
    const tweets = await this.twitterRepo.getAllTweets(username);

    // Transform back to RawTweetRecord format for compatibility
    return tweets.map((t) => ({
      id: t.tweetId,
      username: t.username,
      createdAt: t.createdAt.toISOString(),
      payload: t.payload,
      fetchedAt: t.fetchedAt.toISOString(),
    }));
  }
}
