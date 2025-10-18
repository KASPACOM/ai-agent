import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TwitterAccountDocument } from '../schemas/twitter-account.schema';
import { TwitterAccount } from '../models/twitter-account.model';

/**
 * Twitter Account Repository
 *
 * Handles all MongoDB operations for Twitter account status/metadata.
 * Following DEVELOPMENT_RULES.md: Clean, maintainable, well-commented.
 */
@Injectable()
export class TwitterAccountRepository {
  private readonly logger = new Logger(TwitterAccountRepository.name);

  constructor(
    @InjectModel(TwitterAccountDocument.name)
    private readonly accountModel: Model<TwitterAccountDocument>,
  ) {}

  /**
   * Get account status
   */
  async getAccount(account: string): Promise<TwitterAccount | null> {
    const normalizedAccount = account.toLowerCase().replace('@', '');

    const doc = await this.accountModel
      .findOne({ account: normalizedAccount })
      .lean()
      .exec();

    if (!doc) {
      return null;
    }

    return this.mapDocumentToModel(doc);
  }

  /**
   * Upsert account status
   * Creates new account if doesn't exist, updates if exists
   */
  async upsertAccount(
    account: string,
    updates: Partial<TwitterAccount>,
  ): Promise<void> {
    const normalizedAccount = account.toLowerCase().replace('@', '');
    const now = new Date();

    const existingAccount = await this.getAccount(normalizedAccount);

    if (existingAccount) {
      // Update existing account
      await this.accountModel
        .updateOne(
          { account: normalizedAccount },
          {
            $set: {
              ...updates,
              updatedAt: now,
            },
          },
        )
        .exec();

      this.logger.debug(`Updated account status for @${normalizedAccount}`);
    } else {
      // Create new account with defaults
      const newAccount: TwitterAccount = {
        account: normalizedAccount,
        createdAt: now,
        updatedAt: now,
        lastFullSync: null,
        lastPartialSync: null,
        requestsUsed: 0,
        isComplete: false,
        priority: 1,
        consecutiveRuns: 0,
        totalTweets: 0,
        syncedTweets: 0,
        latestTweetDate: null,
        latestTweetId: null,
        earliestTweetDate: null,
        earliestTweetId: null,
        backfillComplete: false,
        backfillLastId: null,
        backfillLastDate: null,
        ...updates,
      };

      await this.accountModel.create(newAccount);
      this.logger.log(`Created new account status for @${normalizedAccount}`);
    }
  }

  /**
   * Get all accounts
   */
  async getAllAccounts(): Promise<string[]> {
    const accounts = await this.accountModel
      .find()
      .select('account')
      .lean()
      .exec();

    return accounts.map((acc) => acc.account);
  }

  /**
   * Get accounts that need indexing (not complete)
   */
  async getIncompleteAccounts(): Promise<TwitterAccount[]> {
    const docs = await this.accountModel
      .find({ isComplete: false })
      .sort({ priority: -1, updatedAt: 1 })
      .lean()
      .exec();

    return docs.map((doc) => this.mapDocumentToModel(doc));
  }

  /**
   * Map MongoDB document to model interface
   */
  private mapDocumentToModel(doc: any): TwitterAccount {
    return {
      account: doc.account,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      lastFullSync: doc.lastFullSync,
      lastPartialSync: doc.lastPartialSync,
      requestsUsed: doc.requestsUsed,
      isComplete: doc.isComplete,
      priority: doc.priority,
      consecutiveRuns: doc.consecutiveRuns,
      totalTweets: doc.totalTweets,
      syncedTweets: doc.syncedTweets,
      latestTweetDate: doc.latestTweetDate,
      latestTweetId: doc.latestTweetId,
      earliestTweetDate: doc.earliestTweetDate,
      earliestTweetId: doc.earliestTweetId,
      backfillComplete: doc.backfillComplete,
      backfillLastId: doc.backfillLastId,
      backfillLastDate: doc.backfillLastDate,
    };
  }
}

