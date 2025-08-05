import { UserV2 } from 'twitter-api-v2';
import { Tweet, TweetSource, TweetProcessingStatus } from '../models/twitter.model';

/**
 * Twitter API Transformer
 * 
 * Local transformer to eliminate ETL dependency.
 */
export class TwitterTransformer {
  /**
   * Transform API tweet to Tweet interface
   */
  static transformApiTweet(tweet: any, users?: {[userId: string]: UserV2}): Tweet {
    const user = users?.[tweet.author_id];
    return {
      id: tweet.id_str || tweet.id || `tweet_${Date.now()}`,
      text: tweet?.note_tweet?.text || tweet.text || tweet.full_text || '',
      author: user?.username || 'Unknown',
      authorName: user?.name || 'Unknown',
      createdAt: new Date(tweet.created_at || Date.now()),
      url: tweet.url || `https://twitter.com/user/status/${tweet.id}`,
      source: TweetSource.API,
      status: TweetProcessingStatus.PENDING,
      conversationId: tweet.conversation_id || '',
      metadata: {
        retweet_count: tweet.retweet_count || 0,
        favorite_count: tweet.favorite_count || 0,
        reply_count: tweet.reply_count || 0,
        user: users?.[tweet.author_id]?.username || tweet.user,
        raw_tweet: tweet,
      },
    };
  }
} 