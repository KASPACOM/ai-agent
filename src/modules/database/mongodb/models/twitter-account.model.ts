/**
 * Twitter Account Model
 *
 * Represents Twitter account sync status and metadata.
 * Following DEVELOPMENT_RULES.md: Predefined interfaces, no any types.
 */
export interface TwitterAccount {
  account: string;
  createdAt: Date;
  updatedAt: Date;
  lastFullSync: Date | null;
  lastPartialSync: Date | null;
  requestsUsed: number;
  isComplete: boolean;
  priority: number;
  consecutiveRuns: number;
  totalTweets: number;
  syncedTweets: number;
  latestTweetDate: string | null;
  latestTweetId: string | null;
  earliestTweetDate: string | null;
  earliestTweetId: string | null;
  backfillComplete: boolean;
  backfillLastId: string | null;
  backfillLastDate: string | null;
}

