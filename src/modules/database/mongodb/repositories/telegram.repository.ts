import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TelegramMessageDocument } from '../schemas/telegram.schema';
import { TelegramMessage } from '../models/telegram-message.model';

/**
 * Storage result interface
 */
export interface TelegramStorageResult {
  stored: number;
}

/**
 * Telegram Repository
 *
 * Handles all MongoDB operations for Telegram messages.
 * Following DEVELOPMENT_RULES.md: Clean, maintainable, well-commented.
 */
@Injectable()
export class TelegramRepository {
  private readonly logger = new Logger(TelegramRepository.name);

  constructor(
    @InjectModel(TelegramMessageDocument.name)
    private readonly messageModel: Model<TelegramMessageDocument>,
  ) {}

  /**
   * Store a batch of messages
   * Handles duplicates gracefully
   */
  async storeBatch(messages: TelegramMessage[]): Promise<TelegramStorageResult> {
    if (messages.length === 0) {
      return { stored: 0 };
    }

    let stored = 0;

    for (const message of messages) {
      try {
        await this.messageModel.create(message);
        stored++;
      } catch (error) {
        // Duplicate key error (code 11000)
        if (error.code === 11000) {
          this.logger.debug(
            `Duplicate message skipped: ${message.channelUsername}/${message.messageId}`,
          );
        } else {
          this.logger.error(
            `Failed to store message ${message.messageId}: ${error.message}`,
          );
          throw error;
        }
      }
    }

    this.logger.log(`Stored ${stored} messages`);
    return { stored };
  }

  /**
   * Get messages since a specific date for a channel/topic
   */
  async getMessagesSince(
    channelUsername: string,
    topicId: number | null,
    sinceDate: Date,
  ): Promise<TelegramMessage[]> {
    const query: any = {
      channelUsername: channelUsername.toLowerCase(),
      date: { $gt: sinceDate },
    };

    // Handle topicId - null means main channel
    if (topicId === null) {
      query.topicId = null;
    } else {
      query.topicId = topicId;
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ date: 1 })
      .lean()
      .exec();

    return messages.map((msg) => this.mapDocumentToModel(msg));
  }

  /**
   * Get all messages for a channel/topic (optional filters)
   */
  async getAllMessages(
    channelUsername?: string,
    topicId?: number | null,
  ): Promise<TelegramMessage[]> {
    const query: any = {};

    if (channelUsername) {
      query.channelUsername = channelUsername.toLowerCase();
    }

    if (topicId !== undefined) {
      query.topicId = topicId;
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ date: 1 })
      .lean()
      .exec();

    return messages.map((msg) => this.mapDocumentToModel(msg));
  }

  /**
   * Get unprocessed messages (where vectorGeneratedAt is null)
   */
  async getUnprocessed(limit: number = 1000): Promise<TelegramMessage[]> {
    const messages = await this.messageModel
      .find({ vectorGeneratedAt: null })
      .sort({ date: 1 })
      .limit(limit)
      .lean()
      .exec();

    return messages.map((msg) => this.mapDocumentToModel(msg));
  }

  /**
   * Mark messages as processed by setting vectorGeneratedAt
   */
  async markAsProcessed(
    messageIdentifiers: Array<{ channelUsername: string; messageId: number }>,
  ): Promise<void> {
    if (messageIdentifiers.length === 0) {
      return;
    }

    // Build OR query for all message identifiers
    const orConditions = messageIdentifiers.map((id) => ({
      channelUsername: id.channelUsername.toLowerCase(),
      messageId: id.messageId,
    }));

    const result = await this.messageModel
      .updateMany(
        { $or: orConditions },
        { $set: { vectorGeneratedAt: new Date() } },
      )
      .exec();

    this.logger.log(
      `Marked ${result.modifiedCount} messages as processed (vector generated)`,
    );
  }

  /**
   * Get count of unprocessed messages
   */
  async getUnprocessedCount(): Promise<number> {
    return this.messageModel.countDocuments({ vectorGeneratedAt: null }).exec();
  }

  /**
   * Map MongoDB document to model interface
   */
  private mapDocumentToModel(doc: any): TelegramMessage {
    return {
      messageId: doc.messageId,
      channelId: doc.channelId,
      channelUsername: doc.channelUsername,
      topicId: doc.topicId,
      date: doc.date,
      payload: doc.payload,
      fetchedAt: doc.fetchedAt,
      vectorGeneratedAt: doc.vectorGeneratedAt,
    };
  }
}

