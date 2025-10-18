import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Twitter Account Schema
 *
 * MongoDB schema for tracking Twitter account sync status.
 * Following DEVELOPMENT_RULES.md: Single source of truth for account metadata.
 *
 * Indexes:
 * - account: unique lookup
 * - isComplete: filter incomplete accounts
 * - priority: sorting for account rotation
 */
@Schema({ collection: 'twitter_accounts', timestamps: false })
export class TwitterAccountDocument extends Document {
  @Prop({ required: true, unique: true, index: true })
  account: string;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: true, type: Date })
  updatedAt: Date;

  @Prop({ required: false, type: Date, default: null })
  lastFullSync: Date | null;

  @Prop({ required: false, type: Date, default: null })
  lastPartialSync: Date | null;

  @Prop({ required: true, default: 0 })
  requestsUsed: number;

  @Prop({ required: true, default: false, index: true })
  isComplete: boolean;

  @Prop({ required: true, default: 1, index: true })
  priority: number;

  @Prop({ required: true, default: 0 })
  consecutiveRuns: number;

  @Prop({ required: true, default: 0 })
  totalTweets: number;

  @Prop({ required: true, default: 0 })
  syncedTweets: number;

  @Prop({ required: false, type: String, default: null })
  latestTweetDate: string | null;

  @Prop({ required: false, type: String, default: null })
  latestTweetId: string | null;

  @Prop({ required: false, type: String, default: null })
  earliestTweetDate: string | null;

  @Prop({ required: false, type: String, default: null })
  earliestTweetId: string | null;

  @Prop({ required: true, default: false })
  backfillComplete: boolean;

  @Prop({ required: false, type: String, default: null })
  backfillLastId: string | null;

  @Prop({ required: false, type: String, default: null })
  backfillLastDate: string | null;
}

export const TwitterAccountSchema = SchemaFactory.createForClass(TwitterAccountDocument);

