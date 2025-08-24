export interface TwitterRawHistory {
  id: string; // username
  username: string;
  latestTweetDate?: string;
  latestTweetId?: string;
  earliestTweetDate?: string;
  earliestTweetId?: string;
  messagesIndexed: number;
  errors: string[];
  consecutiveErrors: number;
  updatedAt: string;
  createdAt: string;
}

export interface TwitterRawTweet {
  id: string;
  username: string;
  createdAt: string;
  // Store complete Twitter v2 tweet payload shape (all fields we can fetch)
  // We keep it as opaque object to preserve provider structure
  payload: any;
  fetchedAt: string;
}
