import { Injectable, Logger } from '@nestjs/common';
import { TelegramRepository } from '../../../database/mongodb/repositories/telegram.repository';
import { TelegramMessage } from '../../../database/mongodb/models/telegram-message.model';

/**
 * Result interface for storage operations
 */
export interface TelegramMessageRecord {
  messageId: number;
  channelId: string;
  channelUsername: string;
  topicId: number | null;
  date: Date;
  payload: Record<string, unknown>;
  fetchedAt: Date;
}

/**
 * Telegram Storage Service
 *
 * Handles storage of raw Telegram messages in MongoDB.
 * Following DEVELOPMENT_RULES.md: Single transformation principle.
 */
@Injectable()
export class TelegramStorageService {
  private readonly logger = new Logger(TelegramStorageService.name);

  constructor(private readonly telegramRepo: TelegramRepository) {}

  /**
   * Store a batch of messages
   */
  async storeBatch(
    messages: TelegramMessageRecord[],
  ): Promise<{ stored: number }> {
    if (messages.length === 0) {
      return { stored: 0 };
    }

    // Transform to MongoDB model format
    const mongoMessages: TelegramMessage[] = messages.map((m) => ({
      messageId: m.messageId,
      channelId: m.channelId,
      channelUsername: m.channelUsername.toLowerCase(),
      topicId: m.topicId,
      date: m.date,
      payload: m.payload,
      fetchedAt: m.fetchedAt,
      vectorGeneratedAt: undefined,
    }));

    return this.telegramRepo.storeBatch(mongoMessages);
  }

  /**
   * Get messages since a specific date for a channel/topic
   */
  async getMessagesSince(
    channelUsername: string,
    topicId: number | null,
    sinceDate: Date,
  ): Promise<TelegramMessageRecord[]> {
    const messages = await this.telegramRepo.getMessagesSince(
      channelUsername,
      topicId,
      sinceDate,
    );

    // Transform back to TelegramMessageRecord format for compatibility
    return messages.map((m) => ({
      messageId: m.messageId,
      channelId: m.channelId,
      channelUsername: m.channelUsername,
      topicId: m.topicId,
      date: m.date,
      payload: m.payload,
      fetchedAt: m.fetchedAt,
    }));
  }

  /**
   * Get all messages for a channel/topic (optional filters)
   */
  async getAllMessages(
    channelUsername?: string,
    topicId?: number | null,
  ): Promise<TelegramMessageRecord[]> {
    const messages = await this.telegramRepo.getAllMessages(
      channelUsername,
      topicId,
    );

    // Transform back to TelegramMessageRecord format for compatibility
    return messages.map((m) => ({
      messageId: m.messageId,
      channelId: m.channelId,
      channelUsername: m.channelUsername,
      topicId: m.topicId,
      date: m.date,
      payload: m.payload,
      fetchedAt: m.fetchedAt,
    }));
  }
}

