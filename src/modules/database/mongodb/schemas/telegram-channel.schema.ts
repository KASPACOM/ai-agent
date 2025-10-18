import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Telegram Channel Schema
 *
 * MongoDB schema for tracking Telegram channel indexing history.
 * Following DEVELOPMENT_RULES.md: Single source of truth for channel metadata.
 *
 * Indexes:
 * - id: unique lookup (channelName_topicId)
 * - channelName + topicId: compound lookup
 * - isComplete: filter incomplete channels
 */
@Schema({ collection: 'telegram_channels', timestamps: false })
export class TelegramChannelDocument extends Document {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  channelName: string;

  @Prop({ required: true })
  channelId: string;

  @Prop({ required: false, type: String, default: null })
  channelTitle: string | null;

  @Prop({ required: false, type: Number, default: null, index: true })
  topicId: number | null;

  @Prop({ required: false, type: String, default: null })
  topicTitle: string | null;

  @Prop({ required: true, default: 0 })
  messagesIndexed: number;

  @Prop({ required: true, type: Date })
  latestMessageDate: Date;

  @Prop({ required: true, default: 0 })
  latestMessageId: number;

  @Prop({ required: false, type: Date, default: null })
  earliestMessageDate: Date | null;

  @Prop({ required: false, type: Number, default: null })
  earliestMessageId: number | null;

  @Prop({ required: true, default: false, index: true })
  isComplete: boolean;

  @Prop({ required: true, type: Date })
  lastIndexedAt: Date;

  @Prop({ required: true, type: [String], default: [] })
  indexingErrors: string[];

  @Prop({ required: true, default: 0 })
  consecutiveErrors: number;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: true, type: Date })
  updatedAt: Date;
}

export const TelegramChannelSchema = SchemaFactory.createForClass(TelegramChannelDocument);

// Create compound index
TelegramChannelSchema.index({ channelName: 1, topicId: 1 });

