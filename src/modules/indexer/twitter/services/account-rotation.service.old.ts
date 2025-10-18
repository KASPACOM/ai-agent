import { Injectable, Logger } from '@nestjs/common';
import { QdrantRepository } from '../../../database/qdrant/services/qdrant.repository';
import { QdrantClientService } from '../../../database/qdrant/services/qdrant-client.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { AppConfigService } from '../../../core/modules/config/app-config.service';
import { AccountStatus } from '../models/account-status.model';

export enum RotationMode {
  CLASSIC = 'CLASSIC',
  RAW = 'RAW',
}

/**
 * Account Rotation Service (Indexer Module)
 *
 * Intelligently rotates through Twitter accounts to ensure all accounts get processed
 * despite rate limits that prevent processing all accounts in a single run.
 *
 * ✅ Copied from ETL module for independence - can be deleted when ETL is removed
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

  // Collection names for status tracking
  private readonly TWITTER_HISTORY_COLLECTION: string;
  private readonly TWITTER_RAW_HISTORY_COLLECTION: string;

  // In-memory RAW queue for current session
  // Simple in-memory queue for RAW mode selection (repopulated as needed)
  private rawQueue: string[] = [];

  constructor(
    private readonly qdrantRepository: QdrantRepository,
    private readonly qdrantClient: QdrantClientService,
    private readonly indexerConfig: IndexerConfigService,
    private readonly appConfig: AppConfigService,
  ) {
    // Initialize collection name from configuration
    this.TWITTER_HISTORY_COLLECTION =
      this.indexerConfig.getTwitterHistoryCollectionName();
    this.TWITTER_RAW_HISTORY_COLLECTION =
      this.indexerConfig.getTwitterRawHistoryCollectionName();
  }

  /**
   * Initialize the Twitter history collection on module startup
   */
  async onModuleInit() {
    await this.ensureRawCollection();
  }

  /**
   * Ensure Twitter history collection exists (lazy creation)
   * Handles race conditions where multiple processes try to create the same collection
   */
  private async ensureCollection(): Promise<void> {
    try {
      const collection = this.getCollectionName();
      const exists = await this.qdrantClient.collectionExists(collection);

      if (exists) {
        return; // Collection already exists
      }

      // Create minimal collection for storing account metadata
      const config = {
        vectors: {
          size: 1, // Minimal vector size since we only care about payload
          distance: 'Cosine',
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      };

      await this.qdrantClient.createCollection(collection, config);
      this.logger.log(`✅ Created Twitter history collection: ${collection}`);
    } catch (error) {
      // Handle race condition: if another process created the collection, that's actually success
      if (
        error.message?.includes('Conflict') ||
        error.message?.includes('already exists')
      ) {
        this.logger.debug(
          `Collection ${this.getCollectionName()} already exists (created by another process)`,
        );
        return; // This is actually success - another process created it
      }

      // For other errors, log and throw
      this.logger.error(
        `Failed to ensure Twitter history collection: ${error.message}`,
      );
      throw error;
    }
  }

  // Classic mode deprecated: only RAW collection is used

  private async ensureRawCollection(): Promise<void> {
    await this.ensureCollection();
  }

  private getCollectionName(): string {
    return this.TWITTER_RAW_HISTORY_COLLECTION;
  }

  /**
   * Select accounts to process in current run based on intelligent rotation
   * @param availableRequests - Total API requests available for this run
   * @returns Array of accounts to process with allocated request budgets
   */
  async selectAccountsForProcessing(
    availableRequests: number,
    maxAccounts?: number,
  ): Promise<
    Array<{
      account: string;
      requestBudget: number;
      priority: number;
      reason: string;
    }>
  > {
    this.logger.log(
      `🎯 Selecting accounts for processing (${availableRequests} requests available)`,
    );

    // Only RAW mode supported: use queue
    return this.selectAccountsForProcessingRaw(availableRequests, maxAccounts);
  }

  /**
   * Simplified RAW selection using a queue ordered by last synced ascending
   */
  private async selectAccountsForProcessingRaw(
    availableRequests: number,
    maxAccounts?: number,
  ): Promise<
    Array<{
      account: string;
      requestBudget: number;
      priority: number;
      reason: string;
    }>
  > {
    // Rebuild the queue if empty
    if (this.rawQueue.length === 0) {
      await this.buildRawQueue();
    }

    if (this.rawQueue.length === 0) {
      return [];
    }

    // Ensure we can allocate at least 1 request per selected account
    const effectiveRequests = Math.max(1, availableRequests);
    const maxPick =
      typeof maxAccounts === 'number' && maxAccounts > 0
        ? maxAccounts
        : this.rawQueue.length;
    const pickCount = Math.min(
      this.rawQueue.length,
      maxPick,
      effectiveRequests,
    );

    const picked = this.rawQueue.splice(0, pickCount);

    // Evenly distribute the available requests among picked accounts
    const base = Math.max(1, Math.floor(effectiveRequests / pickCount));
    let remainder = Math.max(0, effectiveRequests - base * pickCount);

    const selection = picked.map((account) => ({
      account,
      requestBudget: base + (remainder-- > 0 ? 1 : 0),
      priority: 0,
      reason: 'RAW-queue',
    }));

    this.logger.log(
      `📋 Selected ${selection.length} RAW accounts from queue (requests=${effectiveRequests})`,
    );

    return selection;
  }

  /**
   * Build the RAW mode queue from configured accounts and history
   * Missing account docs are lazily created.
   */
  private async buildRawQueue(): Promise<void> {
    try {
      await this.ensureRawCollection();
      const accounts = this.getTwitterAccounts();
      const items = await Promise.all(
        accounts.map(async (acc) => {
          const normalized = acc.toLowerCase();
          let status = await this.getAccountStatus(normalized);
          if (!status) {
            await this.upsertAccountStatus(normalized, {});
            status = await this.getAccountStatus(normalized);
          }
          return {
            account: normalized,
            lastSyncedAt: this.getLastSyncedAt(status),
          };
        }),
      );

      items.sort((a, b) => {
        const diff = a.lastSyncedAt.getTime() - b.lastSyncedAt.getTime();
        return diff !== 0 ? diff : a.account.localeCompare(b.account);
      });

      this.rawQueue = items.map((i) => i.account);
      this.logger.log(
        `🔄 RAW queue rebuilt with ${this.rawQueue.length} accounts`,
      );
    } catch (error) {
      this.logger.error(`Failed to build RAW queue: ${error.message}`);
      this.rawQueue = [];
    }
  }

  /**
   * Determine the last synced timestamp for ordering
   */
  private getLastSyncedAt(status: AccountStatus | null): Date {
    if (!status) return new Date(0);
    return (
      status.lastPartialSync ||
      status.lastFullSync ||
      status.createdAt ||
      new Date(0)
    );
  }

  /**
   * Update account status after processing attempt
   */
  async updateAccountStatus(
    account: string,
    result: {
      lastSync?: Date;
      messagesIndexed?: number;
      hasMoreData?: boolean;
      errors?: string[];
      // optional offsets for RAW flow
      latestTweetDate?: string;
      latestTweetId?: string;
      earliestTweetDate?: string;
      earliestTweetId?: string;
      requestsUsed?: number;
      // backfill tracking
      backfillComplete?: boolean;
      backfillLastId?: string;
      backfillLastDate?: string;
    },
  ): Promise<void> {
    const existing = await this.getAccountStatus(account);
    const now = new Date();

    const updated: Partial<AccountStatus> = {
      syncedTweets:
        (existing?.syncedTweets || 0) + (result.messagesIndexed || 0),
      // Only update lastPartialSync if we actually processed messages
      ...(result.messagesIndexed &&
        result.messagesIndexed > 0 && { lastPartialSync: now }),
      updatedAt: now,
      latestTweetDate: result.latestTweetDate,
      latestTweetId: result.latestTweetId,
      earliestTweetDate: result.earliestTweetDate,
      earliestTweetId: result.earliestTweetId,
      requestsUsed: result.requestsUsed ?? existing?.requestsUsed ?? 0,
      backfillComplete:
        result.backfillComplete ?? existing?.backfillComplete ?? false,
      backfillLastId: result.backfillLastId ?? existing?.backfillLastId,
      backfillLastDate: result.backfillLastDate ?? existing?.backfillLastDate,
    };

    // Update completion status
    if (
      result.messagesIndexed &&
      result.messagesIndexed > 0 &&
      !result.hasMoreData
    ) {
      updated.isComplete = true;
      updated.lastFullSync = now;
      // no-op for consecutiveRuns in simplified mode
      this.logger.log(`✅ Account @${account} marked as fully synced`);
    } else if (result.hasMoreData) {
      updated.isComplete = false;
    }

    await this.upsertAccountStatus(account, updated);
  }

  /**
   * Get account rotation summary for monitoring
   */
  // Classic rotation summary deprecated

  /**
   * Get comprehensive status for all configured accounts
   */
  // Classic status enrichment deprecated

  /**
   * Get Twitter accounts configuration
   */
  private getTwitterAccounts(): string[] {
    try {
      return this.appConfig.getTwitterAccountsConfig;
    } catch (error) {
      this.logger.warn(
        `Failed to get Twitter accounts config: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Get enriched account status with calculated fields
   */
  // Classic status enrichment deprecated

  /**
   * Calculate sync status based on account state
   */
  // Classic scoring deprecated

  /**
   * Calculate how stale an account is (hours since last sync)
   */
  // Classic scoring deprecated

  /**
   * Estimate requests needed to complete account sync
   */
  // Classic scoring deprecated

  /**
   * Calculate comprehensive score for account selection priority
   */
  // Classic scoring deprecated

  /**
   * Allocate available requests among selected accounts using weighted fair queuing
   */
  // Classic allocation deprecated

  /**
   * Generate human-readable reason for account selection
   */
  // Classic selection rationale deprecated

  /**
   * Log selection rationale for debugging
   */
  // Classic selection rationale deprecated

  /**
   * Database operations for account status
   */
  private async getAccountStatus(
    account: string,
  ): Promise<AccountStatus | null> {
    try {
      // Ensure RAW collection exists before querying
      await this.ensureRawCollection();

      const results = await this.qdrantRepository.searchVectors(
        this.TWITTER_RAW_HISTORY_COLLECTION,
        [0], // dummy vector since we only care about payload
        1,
        {
          must: [
            {
              key: 'account',
              match: { value: account.toLowerCase() },
            },
          ],
        },
      );

      if (results.length === 0) {
        return null;
      }

      // Deserialize ISO date strings back to Date objects
      const payload = results[0].payload as any;
      const accountStatus: AccountStatus = {
        ...payload,
        createdAt: new Date(payload.createdAt),
        updatedAt: new Date(payload.updatedAt),
        lastFullSync: payload.lastFullSync
          ? new Date(payload.lastFullSync)
          : null,
        lastPartialSync: payload.lastPartialSync
          ? new Date(payload.lastPartialSync)
          : null,
      };

      return accountStatus;
    } catch (error) {
      this.logger.warn(
        `Failed to get account status for @${account}: ${error.message}`,
      );
      return null;
    }
  }

  // Public facade for audit/consumers
  async getStatus(account: string): Promise<AccountStatus | null> {
    return this.getAccountStatus(account);
  }

  private async upsertAccountStatus(
    account: string,
    updates: Partial<AccountStatus>,
  ): Promise<void> {
    try {
      const normalizedAccount = account.toLowerCase();

      // Ensure RAW collection exists before upserting
      await this.ensureRawCollection();

      // Get existing status or create new one
      const existingStatus = await this.getAccountStatus(normalizedAccount);
      const now = new Date();

      // Merge updates with existing status using correct field names
      const fullStatus: AccountStatus = {
        account: normalizedAccount,
        createdAt: existingStatus?.createdAt || now,
        updatedAt: now,
        lastFullSync:
          updates.lastFullSync || existingStatus?.lastFullSync || null,
        lastPartialSync:
          updates.lastPartialSync || existingStatus?.lastPartialSync || null,
        requestsUsed: updates.requestsUsed || 0, // Current session requests
        isComplete: updates.isComplete ?? existingStatus?.isComplete ?? false,
        priority: updates.priority ?? existingStatus?.priority ?? 1,
        consecutiveRuns:
          updates.consecutiveRuns ?? existingStatus?.consecutiveRuns ?? 0,
        totalTweets: updates.totalTweets ?? existingStatus?.totalTweets ?? 0,
        syncedTweets: updates.syncedTweets ?? existingStatus?.syncedTweets ?? 0,
        ...updates, // Apply any other updates
      };

      // Create point for Qdrant with simplified structure
      // Use a simple hash of the account name for the point ID (Qdrant prefers numeric IDs)
      const pointId = this.hashAccountName(normalizedAccount);
      this.logger.debug(
        `Generated point ID ${pointId} for account @${normalizedAccount}`,
      );

      // Keep only essential fields and ensure all data is JSON-serializable
      const cleanPayload = {
        account: normalizedAccount,
        createdAt: fullStatus.createdAt.toISOString(),
        updatedAt: fullStatus.updatedAt.toISOString(),
        lastFullSync: fullStatus.lastFullSync
          ? fullStatus.lastFullSync.toISOString()
          : null,
        lastPartialSync: fullStatus.lastPartialSync
          ? fullStatus.lastPartialSync.toISOString()
          : null,
        requestsUsed: fullStatus.requestsUsed || 0,
        isComplete: fullStatus.isComplete || false,
        priority: fullStatus.priority || 1,
        consecutiveRuns: fullStatus.consecutiveRuns || 0,
        totalTweets: fullStatus.totalTweets || 0,
        syncedTweets: fullStatus.syncedTweets || 0,
        latestTweetDate: fullStatus.latestTweetDate,
        latestTweetId: fullStatus.latestTweetId,
        earliestTweetDate: fullStatus.earliestTweetDate,
        earliestTweetId: fullStatus.earliestTweetId,
        backfillComplete: !!fullStatus.backfillComplete,
        backfillLastId: fullStatus.backfillLastId || null,
        backfillLastDate: fullStatus.backfillLastDate || null,
      };

      const point = {
        id: pointId,
        vector: [0.0], // Ensure it's a float array
        payload: cleanPayload,
      };

      // Debug logging to see exactly what we're sending to Qdrant
      this.logger.debug(
        `🔍 Attempting to upsert account status for @${normalizedAccount}:`,
      );
      this.logger.debug(`Point ID: ${pointId}`);
      this.logger.debug(`Vector: [${point.vector.join(', ')}]`);
      this.logger.debug(
        `Payload keys: [${Object.keys(cleanPayload).join(', ')}]`,
      );

      // Upsert the point
      await this.qdrantClient.upsertPoints(
        this.TWITTER_RAW_HISTORY_COLLECTION,
        [point],
      );

      this.logger.debug(
        `✅ Updated status for @${normalizedAccount}: ${updates.syncedTweets || 0} tweets`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update account status for @${account}: ${error.message}`,
      );

      // Enhanced error logging with context
      this.logger.error('Account status update error details:', {
        account: account.toLowerCase(),
        errorName: error.name,
        errorMessage: error.message,
        updatesReceived: JSON.stringify(updates, null, 2),
      });

      throw error;
    }
  }

  private hashAccountName(accountName: string): number {
    let hash = 0;
    for (let i = 0; i < accountName.length; i++) {
      hash = accountName.charCodeAt(i) + ((hash << 5) - hash);
      // Ensure hash stays within 32-bit signed integer range
      hash = hash | 0; // Convert to 32-bit signed integer
    }
    // Ensure we always return a positive number within Qdrant's acceptable range
    return Math.abs(hash) || 1; // Use 1 if hash is 0
  }

  // Public reconcile helpers
  async setSyncedTweets(account: string, count: number): Promise<void> {
    await this.upsertAccountStatus(account, { syncedTweets: count });
  }
}
