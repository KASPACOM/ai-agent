import { Injectable, Logger } from '@nestjs/common';
import { TwitterAccountRepository } from '../../../database/mongodb/repositories/twitter-account.repository';
import { AppConfigService } from '../../../core/modules/config/app-config.service';
import { AccountStatus } from '../models/account-status.model';

export enum RotationMode {
  CLASSIC = 'CLASSIC',
  RAW = 'RAW',
}

/**
 * Account Rotation Service (MongoDB version)
 *
 * Intelligently rotates through Twitter accounts using MongoDB for status tracking.
 * Following DEVELOPMENT_RULES.md: Clean separation of concerns.
 *
 * STRATEGY:
 * 1. 🎯 Priority-based selection (never synced > stale > partial > complete)
 * 2. ⏱️ Cooldown periods for recently completed accounts
 * 3. 🔄 Fair rotation to prevent account starvation
 * 4. 📊 Request budget allocation per account
 */
@Injectable()
export class AccountRotationService {
  private readonly logger = new Logger(AccountRotationService.name);

  // In-memory RAW queue for current session
  private rawQueue: string[] = [];

  constructor(
    private readonly accountRepo: TwitterAccountRepository,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Get list of configured Twitter accounts
   */
  getConfiguredAccounts(): string[] {
    return this.appConfig.getTwitterAccountsConfig;
  }

  /**
   * Get list of accounts configured for backfill
   */
  getBackfillAccounts(): string[] {
    return this.appConfig.getTwitterBackfillAccountsConfig;
  }

  /**
   * Select next accounts for processing
   * Returns accounts based on priority and completion status
   */
  async selectAccounts(
    maxAccounts: number,
    mode: RotationMode = RotationMode.RAW,
  ): Promise<string[]> {
    if (mode === RotationMode.RAW) {
      return this.selectRawAccounts(maxAccounts);
    }
    return this.selectClassicAccounts(maxAccounts);
  }

  /**
   * Select accounts for RAW mode (simple queue-based)
   */
  private async selectRawAccounts(maxAccounts: number): Promise<string[]> {
    // Repopulate queue if empty
    if (this.rawQueue.length === 0) {
      const allAccounts = this.getConfiguredAccounts();
      this.rawQueue = [...allAccounts];
      this.logger.log(`🔄 Repopulated RAW queue with ${this.rawQueue.length} accounts`);
    }

    // Take next accounts from queue
    const selected = this.rawQueue.splice(0, maxAccounts);
    this.logger.log(`Selected ${selected.length} accounts for processing: ${selected.join(', ')}`);

    return selected;
  }

  /**
   * Select accounts for CLASSIC mode (priority-based)
   */
  private async selectClassicAccounts(maxAccounts: number): Promise<string[]> {
    const allAccounts = this.getConfiguredAccounts();
    const accountStatuses: Array<{ account: string; status: AccountStatus | null }> = [];

    // Get status for all accounts
    for (const account of allAccounts) {
      const status = await this.getAccountStatus(account);
      accountStatuses.push({ account, status });
    }

    // Sort by priority: never synced > incomplete > complete
    accountStatuses.sort((a, b) => {
      // Never synced accounts first
      if (!a.status && b.status) return -1;
      if (a.status && !b.status) return 1;

      // Both have status - sort by completion and priority
      if (a.status && b.status) {
        if (a.status.isComplete !== b.status.isComplete) {
          return a.status.isComplete ? 1 : -1;
        }
        return (b.status.priority || 1) - (a.status.priority || 1);
      }

      return 0;
    });

    const selected = accountStatuses
      .slice(0, maxAccounts)
      .map((item) => item.account);

    this.logger.log(`Selected ${selected.length} accounts for processing: ${selected.join(', ')}`);

    return selected;
  }

  /**
   * Get account status from MongoDB
   */
  async getAccountStatus(account: string): Promise<AccountStatus | null> {
    try {
      return await this.accountRepo.getAccount(account);
    } catch (error) {
      this.logger.warn(
        `Failed to get account status for @${account}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Public facade for audit/consumers
   */
  async getStatus(account: string): Promise<AccountStatus | null> {
    return this.getAccountStatus(account);
  }

  /**
   * Update account status
   */
  async upsertAccountStatus(
    account: string,
    updates: Partial<AccountStatus>,
  ): Promise<void> {
    try {
      const normalizedAccount = account.toLowerCase();
      await this.accountRepo.upsertAccount(normalizedAccount, updates);

      this.logger.debug(
        `✅ Updated status for @${normalizedAccount}: ${updates.syncedTweets || 0} tweets`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update account status for @${account}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Set synced tweets count for an account
   */
  async setSyncedTweets(account: string, count: number): Promise<void> {
    await this.upsertAccountStatus(account, { syncedTweets: count });
  }

  /**
   * Mark account as complete
   */
  async markAccountComplete(account: string): Promise<void> {
    await this.upsertAccountStatus(account, {
      isComplete: true,
      lastFullSync: new Date(),
    });
  }

  /**
   * Update backfill progress for an account
   */
  async updateBackfillProgress(
    account: string,
    lastId: string,
    lastDate: string,
    isComplete: boolean,
  ): Promise<void> {
    await this.upsertAccountStatus(account, {
      backfillLastId: lastId,
      backfillLastDate: lastDate,
      backfillComplete: isComplete,
    });
  }

  /**
   * Update account sync metrics
   */
  async updateAccountMetrics(
    account: string,
    metrics: {
      totalTweets?: number;
      syncedTweets?: number;
      latestTweetId?: string;
      latestTweetDate?: string;
      earliestTweetId?: string;
      earliestTweetDate?: string;
      requestsUsed?: number;
    },
  ): Promise<void> {
    await this.upsertAccountStatus(account, metrics);
  }
}

