import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Telegram Message Schema
 *
 * MongoDB schema for storing raw messages from Telegram API.
 * Following DEVELOPMENT_RULES.md: Single transformation principle - store raw data as-is.
 *
 * Indexes:
 * - channelUsername + topicId + messageId: unique lookup
 * - channelUsername + date: time-range queries per channel
 * - vectorGeneratedAt: find unprocessed messages
 */
@Schema({ collection: 'telegram_messages', timestamps: false })
export class TelegramMessageDocument extends Document {
  @Prop({ required: true })
  messageId: number;

  @Prop({ required: true, index: true })
  channelId: string;

  @Prop({ required: true, index: true })
  channelUsername: string;

  @Prop({ required: false, type: Number, default: null, index: true })
  topicId: number | null;

  @Prop({ required: true, type: Date, index: true })
  date: Date;

  @Prop({ required: true, type: Object })
  payload: Record<string, unknown>;

  @Prop({ required: true, type: Date })
  fetchedAt: Date;

  @Prop({ required: false, type: Date, default: null, index: true })
  vectorGeneratedAt?: Date;
}

export const TelegramMessageSchema = SchemaFactory.createForClass(TelegramMessageDocument);

// Create compound indexes
TelegramMessageSchema.index({ channelUsername: 1, topicId: 1, messageId: 1 }, { unique: true });
TelegramMessageSchema.index({ channelUsername: 1, date: -1 });
TelegramMessageSchema.index({ vectorGeneratedAt: 1 });

