import { UserV2 } from 'twitter-api-v2';

/**
 * Interface for single tweet API response with author data
 */
export interface SingleTweetResponse {
  tweet: any;
  author: UserV2 | null;
}