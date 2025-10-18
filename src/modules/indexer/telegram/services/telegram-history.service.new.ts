import { Injectable, Logger } from '@nestjs/common';
import { TelegramChannelRepository } from '../../../database/mongodb/repositories/telegram-channel.repository';
import {
  TelegramIndexingHistory,
  TelegramHistoryUpdate,
} from '../models/telegram-history.model';

/**
 * Telegram History Service (MongoDB version)
 *
 * Manages Telegram channel indexing history using MongoDB.
 * Following DEVELOPMENT_RULES.md: Clean separation of concerns.
 */
@Injectable()
export class TelegramHistoryService {
  private readonly logger = new Logger(TelegramHistoryService.name);

  constructor(private readonly channelRepo: TelegramChannelRepository) {}

  /**
   * Get or create indexing history for a channel/topic
   */
  async getOrCreateHistory(
    channelName: string,
    channelId: string,
    topicId?: number,
    channelTitle?: string,
    topicTitle?: string,
  ): Promise<TelegramIndexingHistory> {
    const channel = await this.channelRepo.getOrCreateChannel(
      channelName,
      channelId,
      topicId ?? null,
      channelTitle,
      topicTitle,
    );

    // Transform to TelegramIndexingHistory format for compatibility
    return this.mapChannelToHistory(channel);
  }

  /**
   * Update indexing history after processing messages
   */
  async updateHistory(
    channelName: string,
    topicId: number | undefined,
    updates: TelegramHistoryUpdate,
  ): Promise<void> {
    const normalizedChannelName = channelName.toLowerCase().replace('@', '');

    // Get existing history
    const historyId = this.generateHistoryId(normalizedChannelName, topicId ?? null);
    const existingChannel = await this.channelRepo.getChannelById(historyId);

    if (!existingChannel) {
      this.logger.warn(
        `No history found for ${normalizedChannelName}:${topicId} - cannot update`,
      );
      return;
    }

    // Build update object
    const updateObj: any = {};

    // Increment message count if provided
    if (updates.messagesIndexed) {
      updateObj.messagesIndexed =
        existingChannel.messagesIndexed + updates.messagesIndexed;
    }

    // Update latest message info if provided
    if (updates.latestMessageDate) {
      updateObj.latestMessageDate = new Date(updates.latestMessageDate);
    }
    if (updates.latestMessageId) {
      updateObj.latestMessageId = updates.latestMessageId;
    }

    // Update earliest message info if provided
    if (updates.earliestMessageDate) {
      updateObj.earliestMessageDate = new Date(updates.earliestMessageDate);
    }
    if (updates.earliestMessageId) {
      updateObj.earliestMessageId = updates.earliestMessageId;
    }

    // Update completion status
    if (updates.isComplete !== undefined) {
      updateObj.isComplete = updates.isComplete;
    }

    // Handle errors
    if (updates.clearErrors) {
      updateObj.indexingErrors = updates.errors || [];
      updateObj.consecutiveErrors = 0;
    } else if (updates.errors && updates.errors.length > 0) {
      updateObj.indexingErrors = [
        ...existingChannel.indexingErrors,
        ...updates.errors,
      ].slice(-10); // Keep only last 10
      updateObj.consecutiveErrors =
        existingChannel.consecutiveErrors + updates.errors.length;
    }

    // Update timestamps
    updateObj.lastIndexedAt = new Date();

    await this.channelRepo.updateChannel(
      normalizedChannelName,
      topicId ?? null,
      updateObj,
    );

    this.logger.debug(
      `Updated history for ${normalizedChannelName}:${topicId || 'main'}: +${updates.messagesIndexed || 0} messages`,
    );
  }

  /**
   * Get indexing history for a specific channel/topic
   */
  async getHistory(historyId: string): Promise<TelegramIndexingHistory | undefined> {
    const channel = await this.channelRepo.getChannelById(historyId);

    if (!channel) {
      return undefined;
    }

    return this.mapChannelToHistory(channel);
  }

  /**
   * Check if a channel/topic needs indexing
   */
  async needsIndexing(channelName: string, topicId?: number): Promise<boolean> {
    return this.channelRepo.needsIndexing(channelName, topicId ?? null);
  }

  /**
   * Reset completion status for a channel/topic
   */
  async resetCompletion(channelName: string, topicId?: number): Promise<void> {
    const normalizedChannelName = channelName.toLowerCase().replace('@', '');

    await this.channelRepo.updateChannel(normalizedChannelName, topicId ?? null, {
      isComplete: false,
      consecutiveErrors: 0,
      indexingErrors: [],
    });

    this.logger.log(
      `Reset completion status for ${normalizedChannelName}:${topicId || 'main'}`,
    );
  }

  /**
   * Generate history ID (channelName_topicId)
   */
  private generateHistoryId(channelName: string, topicId: number | null): string {
    const normalized = channelName.toLowerCase().replace('@', '');
    return `${normalized}_${topicId ?? 'main'}`;
  }

  /**
   * Map TelegramChannel to TelegramIndexingHistory for compatibility
   */
  private mapChannelToHistory(channel: any): TelegramIndexingHistory {
    return {
      id: channel.id,
      channelName: channel.channelName,
      channelId: channel.channelId,
      channelTitle: channel.channelTitle,
      topicId: channel.topicId,
      topicTitle: channel.topicTitle,
      messagesIndexed: channel.messagesIndexed,
      latestMessageDate: channel.latestMessageDate.toISOString(),
      latestMessageId: channel.latestMessageId,
      earliestMessageDate: channel.earliestMessageDate
        ? channel.earliestMessageDate.toISOString()
        : undefined,
      earliestMessageId: channel.earliestMessageId ?? undefined,
      isComplete: channel.isComplete,
      lastIndexedAt: channel.lastIndexedAt.toISOString(),
      indexingErrors: channel.indexingErrors,
      consecutiveErrors: channel.consecutiveErrors,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
    };
  }
}

