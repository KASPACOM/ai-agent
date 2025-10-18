/**
 * Twitter Tweet Model
 *
 * Represents a raw tweet fetched from Twitter API.
 * Following DEVELOPMENT_RULES.md: Predefined interfaces, no any types.
 */
export interface TwitterTweet {
  tweetId: string;
  username: string;
  createdAt: Date;
  payload: Record<string, unknown>;
  fetchedAt: Date;
  vectorGeneratedAt?: Date;
}

