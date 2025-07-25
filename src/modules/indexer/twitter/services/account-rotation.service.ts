import { Injectable, Logger } from '@nestjs/common';
import { QdrantRepository } from '../../../database/qdrant/services/qdrant.repository';
import { QdrantClientService } from '../../../database/qdrant/services/qdrant-client.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import {
  AccountStatus,
  AccountWithStatus,
  AccountRotationConfig,
  AccountSyncStatus,
} from '../../../etl/models/account-status.model';

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

  // Collection name for account status tracking
  private readonly ACCOUNT_STATUS_COLLECTION = 'account_status';

  // Default configuration - can be overridden via environment
  private readonly config: AccountRotationConfig = {
    maxConsecutiveRuns: 3, // Max times same account can be processed in a row
    cooldownHours: 24, // Hours to wait before re-processing complete accounts
    priorityBoostHours: 48, // Hours after which to boost account priority
    maxRequestsPerAccount: 5, // Max requests to spend per account per run
  };

  // In-memory tracking for current session
  private processingSession: Map<string, number> = new Map(); // account -> consecutive runs

  constructor(
    private readonly qdrantRepository: QdrantRepository,
    private readonly qdrantClient: QdrantClientService,
    private readonly indexerConfig: IndexerConfigService,
  ) {}

  /**
   * Initialize the account status collection on module startup
   */
  async onModuleInit() {
    await this.ensureAccountStatusCollection();
  }

  /**
   * Ensure account status collection exists (lazy creation)
   */
  private async ensureAccountStatusCollection(): Promise<void> {
    try {
      const exists = await this.qdrantClient.collectionExists(
        this.ACCOUNT_STATUS_COLLECTION,
      );

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

      await this.qdrantClient.createCollection(
        this.ACCOUNT_STATUS_COLLECTION,
        config,
      );
      this.logger.log(
        `✅ Created account status collection: ${this.ACCOUNT_STATUS_COLLECTION}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to ensure account status collection: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Select accounts to process in current run based on intelligent rotation
   * @param availableRequests - Total API requests available for this run
   * @returns Array of accounts to process with allocated request budgets
   */
  async selectAccountsForProcessing(availableRequests: number): Promise<
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

    // Get current status of all configured accounts
    const accountStatuses = await this.getAllAccountStatuses();

    // Calculate selection scores and priorities
    const scoredAccounts = accountStatuses
      .map((account) => this.calculateAccountScore(account))
      .sort((a, b) => b.totalScore - a.totalScore);

    // Allocate requests using weighted fair queuing
    const selectedAccounts = this.allocateRequests(
      scoredAccounts,
      availableRequests,
    );

    // Log selection rationale
    this.logSelectionRationale(selectedAccounts);

    return selectedAccounts;
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
    },
  ): Promise<void> {
    const existing = await this.getAccountStatus(account);
    const now = new Date();

    const updated: Partial<AccountStatus> = {
      syncedTweets: (existing?.syncedTweets || 0) + (result.messagesIndexed || 0),
      // Only update lastPartialSync if we actually processed messages
      ...(result.messagesIndexed && result.messagesIndexed > 0 && { lastPartialSync: now }),
      updatedAt: now,
      consecutiveRuns: (this.processingSession.get(account) || 0) + 1,
    };

    // Update completion status
    if (result.messagesIndexed && result.messagesIndexed > 0 && !result.hasMoreData) {
      updated.isComplete = true;
      updated.lastFullSync = now;
      updated.consecutiveRuns = 0; // Reset counter on completion
      this.processingSession.delete(account);
      this.logger.log(`✅ Account @${account} marked as fully synced`);
    } else if (result.hasMoreData) {
      updated.isComplete = false;
      this.processingSession.set(account, updated.consecutiveRuns!);
    }

    await this.upsertAccountStatus(account, updated);
  }

  /**
   * Get account rotation summary for monitoring
   */
  async getAccountRotationSummary(): Promise<{
    totalAccounts: number;
    accountsNeedingSync: number;
    completedAccounts: number;
    accountsWithErrors: number;
  }> {
    const allStatuses = await this.getAllAccountStatuses();
    
    return {
      totalAccounts: allStatuses.length,
      accountsNeedingSync: allStatuses.filter(a => !a.isComplete).length,
      completedAccounts: allStatuses.filter(a => a.isComplete).length,
      accountsWithErrors: allStatuses.filter(a => a.syncStatus === AccountSyncStatus.COOLING_DOWN).length,
    };
  }

  /**
   * Get comprehensive status for all configured accounts
   */
  private async getAllAccountStatuses(): Promise<AccountWithStatus[]> {
    // ✅ Get Twitter accounts from environment variables (config fallback)
    const configuredAccounts = this.getTwitterAccounts();
    const statuses = await Promise.all(
      configuredAccounts.map((account) =>
        this.getEnrichedAccountStatus(account),
      ),
    );

    return statuses;
  }

  /**
   * Get Twitter accounts configuration
   */
  private getTwitterAccounts(): string[] {
    const accounts = process.env.TWITTER_ACCOUNTS;
    if (!accounts) {
      this.logger.warn('TWITTER_ACCOUNTS environment variable not set');
      return [];
    }
    return accounts.split(',').map(account => account.trim());
  }

  /**
   * Get enriched account status with calculated fields
   */
  private async getEnrichedAccountStatus(
    account: string,
  ): Promise<AccountWithStatus> {
    const status = await this.getAccountStatus(account);
    const now = new Date();

    // Default values for new accounts
    const enriched: AccountWithStatus = {
      account,
      lastFullSync: status?.lastFullSync || null,
      lastPartialSync: status?.lastPartialSync || null,
      requestsUsed: status?.requestsUsed || 0,
      isComplete: status?.isComplete || false,
      priority: status?.priority || 5,
      consecutiveRuns:
        this.processingSession.get(account) || status?.consecutiveRuns || 0,
      totalTweets: status?.totalTweets || 0,
      syncedTweets: status?.syncedTweets || 0,
      createdAt: status?.createdAt || now,
      updatedAt: status?.updatedAt || now,
      syncStatus: AccountSyncStatus.NEVER_SYNCED,
      staleness: 0,
      estimatedRequestsNeeded: 1,
    };

    // Calculate derived fields
    enriched.syncStatus = this.calculateSyncStatus(enriched);
    enriched.staleness = this.calculateStaleness(enriched, now);
    enriched.estimatedRequestsNeeded = this.estimateRequestsNeeded(enriched);

    return enriched;
  }

  /**
   * Calculate sync status based on account state
   */
  private calculateSyncStatus(account: AccountWithStatus): AccountSyncStatus {
    const now = new Date();

    if (!account.lastPartialSync) {
      return AccountSyncStatus.NEVER_SYNCED;
    }

    if (account.isComplete) {
      const hoursSinceComplete = account.lastFullSync
        ? (now.getTime() - account.lastFullSync.getTime()) / (1000 * 60 * 60)
        : 999;

      if (hoursSinceComplete < this.config.cooldownHours) {
        return AccountSyncStatus.COOLING_DOWN;
      } else {
        return AccountSyncStatus.STALE;
      }
    }

    const hoursSincePartial =
      (now.getTime() - account.lastPartialSync.getTime()) / (1000 * 60 * 60);

    if (hoursSincePartial > this.config.priorityBoostHours) {
      return AccountSyncStatus.STALE;
    }

    return AccountSyncStatus.PARTIAL_SYNC;
  }

  /**
   * Calculate how stale an account is (hours since last sync)
   */
  private calculateStaleness(account: AccountWithStatus, now: Date): number {
    if (!account.lastPartialSync) return 999; // Never synced = maximum staleness

    return Math.floor(
      (now.getTime() - account.lastPartialSync.getTime()) / (1000 * 60 * 60),
    );
  }

  /**
   * Estimate requests needed to complete account sync
   */
  private estimateRequestsNeeded(account: AccountWithStatus): number {
    if (account.syncStatus === AccountSyncStatus.NEVER_SYNCED) {
      return Math.min(this.config.maxRequestsPerAccount, 5); // Conservative start
    }

    if (account.syncStatus === AccountSyncStatus.STALE && account.isComplete) {
      return 1; // Just checking for new tweets
    }

    if (account.syncStatus === AccountSyncStatus.PARTIAL_SYNC) {
      return Math.min(this.config.maxRequestsPerAccount, 3); // Continue where left off
    }

    return 1; // Default conservative estimate
  }

  /**
   * Calculate comprehensive score for account selection priority
   */
  private calculateAccountScore(
    account: AccountWithStatus,
  ): AccountWithStatus & { totalScore: number } {
    let score = 0;

    // 🎯 Priority multipliers (higher = more urgent)
    const priorityWeights = {
      [AccountSyncStatus.NEVER_SYNCED]: 1000, // Highest priority
      [AccountSyncStatus.STALE]: 500, // High priority
      [AccountSyncStatus.PARTIAL_SYNC]: 200, // Medium priority
      [AccountSyncStatus.FULL_SYNC]: 50, // Low priority
      [AccountSyncStatus.COOLING_DOWN]: 1, // Lowest priority
    };

    score += priorityWeights[account.syncStatus];

    // ⏱️ Staleness bonus (older = higher priority)
    score += Math.min(account.staleness * 10, 500); // Cap at 500 points

    // 🔄 Consecutive runs penalty (prevent hogging)
    score -= account.consecutiveRuns * 100;

    // 📊 Completion percentage bonus (closer to done = higher priority for partial syncs)
    if (account.totalTweets > 0) {
      const completionRate = account.syncedTweets / account.totalTweets;
      if (
        account.syncStatus === AccountSyncStatus.PARTIAL_SYNC &&
        completionRate > 0.8
      ) {
        score += 200; // Bonus for nearly complete accounts
      }
    }

    // 🚫 Skip if cooling down
    if (account.syncStatus === AccountSyncStatus.COOLING_DOWN) {
      score = -999; // Negative priority
    }

    return { ...account, totalScore: Math.max(0, score) };
  }

  /**
   * Allocate available requests among selected accounts using weighted fair queuing
   */
  private allocateRequests(
    scoredAccounts: Array<AccountWithStatus & { totalScore: number }>,
    availableRequests: number,
  ): Array<{
    account: string;
    requestBudget: number;
    priority: number;
    reason: string;
  }> {
    const result = [];
    let remainingRequests = availableRequests;

    for (const account of scoredAccounts) {
      if (remainingRequests <= 0) break;
      if (account.totalScore <= 0) continue; // Skip cooling down accounts

      const requestBudget = Math.min(
        remainingRequests,
        account.estimatedRequestsNeeded,
        this.config.maxRequestsPerAccount,
      );

      if (requestBudget > 0) {
        result.push({
          account: account.account,
          requestBudget,
          priority: account.totalScore,
          reason: this.getSelectionReason(account),
        });

        remainingRequests -= requestBudget;
      }
    }

    return result;
  }

  /**
   * Generate human-readable reason for account selection
   */
  private getSelectionReason(
    account: AccountWithStatus & { totalScore: number },
  ): string {
    switch (account.syncStatus) {
      case AccountSyncStatus.NEVER_SYNCED:
        return 'Never indexed before';
      case AccountSyncStatus.STALE:
        return `Stale (${account.staleness}h since last sync)`;
      case AccountSyncStatus.PARTIAL_SYNC:
        return `Partial sync (${account.consecutiveRuns} consecutive runs)`;
      case AccountSyncStatus.FULL_SYNC:
        return 'Checking for new tweets';
      case AccountSyncStatus.COOLING_DOWN:
        return 'Recently completed (cooling down)';
      default:
        return 'Unknown';
    }
  }

  /**
   * Log selection rationale for debugging
   */
  private logSelectionRationale(
    selected: Array<{
      account: string;
      requestBudget: number;
      priority: number;
      reason: string;
    }>,
  ): void {
    this.logger.log(`📋 Selected ${selected.length} accounts for processing:`);
    selected.forEach((selection, index) => {
      this.logger.log(
        `  ${index + 1}. @${selection.account} (${selection.requestBudget} requests) - ${selection.reason}`,
      );
    });
  }

  /**
   * Database operations for account status
   */
  private async getAccountStatus(
    account: string,
  ): Promise<AccountStatus | null> {
    try {
      // Ensure collection exists before querying
      await this.ensureAccountStatusCollection();

      const results = await this.qdrantRepository.searchVectors(
        this.ACCOUNT_STATUS_COLLECTION,
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

  private async upsertAccountStatus(
    account: string,
    updates: Partial<AccountStatus>,
  ): Promise<void> {
    try {
      const normalizedAccount = account.toLowerCase();

      // Ensure collection exists before upserting
      await this.ensureAccountStatusCollection();

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
      await this.qdrantClient.upsertPoints(this.ACCOUNT_STATUS_COLLECTION, [
        point,
      ]);

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
} 