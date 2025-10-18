import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Twitter Tweet Schema
 *
 * MongoDB schema for storing raw tweets from Twitter API.
 * Following DEVELOPMENT_RULES.md: Single transformation principle - store raw data as-is.
 *
 * Indexes:
 * - tweetId: unique lookup
 * - username: filter by account
 * - username + createdAt: time-range queries per account
 * - vectorGeneratedAt: find unprocessed tweets
 */
@Schema({ collection: 'twitter_tweets', timestamps: false })
export class TwitterTweetDocument extends Document {
  @Prop({ required: true, unique: true, index: true })
  tweetId: string;

  @Prop({ required: true, index: true })
  username: string;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: true, type: Object })
  payload: Record<string, unknown>;

  @Prop({ required: true, type: Date })
  fetchedAt: Date;

  @Prop({ required: false, type: Date, default: null, index: true })
  vectorGeneratedAt?: Date;
}

export const TwitterTweetSchema = SchemaFactory.createForClass(TwitterTweetDocument);

// Create compound indexes
TwitterTweetSchema.index({ username: 1, createdAt: -1 });
TwitterTweetSchema.index({ vectorGeneratedAt: 1 });

