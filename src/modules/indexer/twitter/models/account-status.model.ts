/**
 * Account Status Models for Twitter Indexer
 *
 * Local copy of account status models to eliminate ETL dependency.
 * Used for Twitter account rotation and status tracking.
 */

export interface AccountStatus {
  account: string;
  lastFullSync: Date | null; // When account was fully processed
  lastPartialSync: Date | null; // When account was partially processed
  requestsUsed: number; // Requests used in last session
  isComplete: boolean; // Whether account is fully caught up
  priority: number; // Processing priority (1=highest)
  consecutiveRuns: number; // How many times processed consecutively
  totalTweets: number; // Estimated total tweets for this account
  syncedTweets: number; // How many tweets we've indexed
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountRotationConfig {
  maxConsecutiveRuns: number; // Max times to process same account consecutively
  cooldownHours: number; // Hours to wait before re-processing complete account
  priorityBoostHours: number; // Hours after which to boost account priority
  maxRequestsPerAccount: number; // Max requests to spend on one account per run
}

export enum AccountSyncStatus {
  NEVER_SYNCED = 'NEVER_SYNCED',
  PARTIAL_SYNC = 'PARTIAL_SYNC',
  FULL_SYNC = 'FULL_SYNC',
  STALE = 'STALE', // Hasn't been synced recently
  COOLING_DOWN = 'COOLING_DOWN', // Recently completed, waiting
}

export interface AccountWithStatus extends AccountStatus {
  syncStatus: AccountSyncStatus;
  staleness: number; // Hours since last sync
  estimatedRequestsNeeded: number; // Estimated requests to complete
}
