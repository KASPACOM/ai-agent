/**
 * Twitter API timeline request parameters
 */
export interface TwitterTimelineParams {
  max_results: number;
  'tweet.fields': string | string[];
  expansions: string | string[];
  'user.fields': string | string[];
  'media.fields': string | string[];
  'place.fields': string | string[];
  'poll.fields': string | string[];
  pagination_token?: string;
  since_id?: string;
  start_time?: string;
  until_id?: string;
  end_time?: string;
}

