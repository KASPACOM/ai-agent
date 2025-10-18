/**
 * Result from first-run backfill operation
 */
export interface FirstRunBackfillResult {
  stored: number;
  requestsUsed: number;
  completed: boolean;
  latestTweetId?: string;
  latestTweetDate?: string;
  earliestTweetId?: string;
  earliestTweetDate?: string;
}

/**
 * Result from fetching new tweets operation
 */
export interface FetchNewTweetsResult {
  stored: number;
  requestsUsed: number;
  latestTweetId?: string;
  latestTweetDate?: string;
}

/**
 * Result from continue backfill operation
 */
export interface ContinueBackfillResult {
  stored: number;
  requestsUsed: number;
  completed: boolean;
  earliestTweetId?: string;
  earliestTweetDate?: string;
}

/**
 * Account status update data
 */
export interface AccountStatusUpdate {
  lastSync: Date;
  messagesIndexed?: number;
  backfillComplete?: boolean;
  latestTweetId?: string;
  latestTweetDate?: string;
  earliestTweetId?: string;
  earliestTweetDate?: string;
}

