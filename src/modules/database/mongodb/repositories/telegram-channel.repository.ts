import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TelegramChannelDocument } from '../schemas/telegram-channel.schema';
import { TelegramChannel } from '../models/telegram-channel.model';

/**
 * Telegram Channel Repository
 *
 * Handles all MongoDB operations for Telegram channel history/metadata.
 * Following DEVELOPMENT_RULES.md: Clean, maintainable, well-commented.
 */
@Injectable()
export class TelegramChannelRepository {
  private readonly logger = new Logger(TelegramChannelRepository.name);

  constructor(
    @InjectModel(TelegramChannelDocument.name)
    private readonly channelModel: Model<TelegramChannelDocument>,
  ) {}

  /**
   * Get channel history by ID (channelName_topicId)
   */
  async getChannelById(id: string): Promise<TelegramChannel | null> {
    const doc = await this.channelModel.findOne({ id }).lean().exec();

    if (!doc) {
      return null;
    }

    return this.mapDocumentToModel(doc);
  }

  /**
   * Get or create channel history
   */
  async getOrCreateChannel(
    channelName: string,
    channelId: string,
    topicId: number | null,
    channelTitle?: string,
    topicTitle?: string,
  ): Promise<TelegramChannel> {
    const normalizedChannelName = channelName.toLowerCase().replace('@', '');
    const historyId = this.generateHistoryId(normalizedChannelName, topicId);

    // Try to get existing
    const existing = await this.getChannelById(historyId);
    if (existing) {
      return existing;
    }

    // Create new
    const now = new Date();
    const newChannel: TelegramChannel = {
      id: historyId,
      channelName: normalizedChannelName,
      channelId,
      channelTitle: channelTitle || null,
      topicId,
      topicTitle: topicTitle || null,
      messagesIndexed: 0,
      latestMessageDate: new Date(0), // Epoch
      latestMessageId: 0,
      earliestMessageDate: null,
      earliestMessageId: null,
      isComplete: false,
      lastIndexedAt: now,
      indexingErrors: [],
      consecutiveErrors: 0,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.channelModel.create(newChannel);
    this.logger.log(
      `Created new channel history for ${normalizedChannelName}:${topicId || 'main'}`,
    );

    return this.mapDocumentToModel(created.toObject());
  }

  /**
   * Update channel history
   */
  async updateChannel(
    channelName: string,
    topicId: number | null,
    updates: Partial<TelegramChannel>,
  ): Promise<void> {
    const normalizedChannelName = channelName.toLowerCase().replace('@', '');
    const historyId = this.generateHistoryId(normalizedChannelName, topicId);

    const now = new Date();
    await this.channelModel
      .updateOne(
        { id: historyId },
        {
          $set: {
            ...updates,
            updatedAt: now,
          },
        },
      )
      .exec();

    this.logger.debug(
      `Updated channel history for ${normalizedChannelName}:${topicId || 'main'}`,
    );
  }

  /**
   * Query channels with filters
   */
  async queryChannels(options: {
    channelName?: string;
    topicId?: number | null;
    isComplete?: boolean;
  }): Promise<TelegramChannel[]> {
    const query: any = {};

    if (options.channelName) {
      query.channelName = options.channelName.toLowerCase().replace('@', '');
    }

    if (options.topicId !== undefined) {
      query.topicId = options.topicId;
    }

    if (options.isComplete !== undefined) {
      query.isComplete = options.isComplete;
    }

    const docs = await this.channelModel.find(query).lean().exec();

    return docs.map((doc) => this.mapDocumentToModel(doc));
  }

  /**
   * Get all incomplete channels
   */
  async getIncompleteChannels(): Promise<TelegramChannel[]> {
    return this.queryChannels({ isComplete: false });
  }

  /**
   * Check if a channel needs indexing
   */
  async needsIndexing(
    channelName: string,
    topicId: number | null,
  ): Promise<boolean> {
    const normalizedChannelName = channelName.toLowerCase().replace('@', '');
    const historyId = this.generateHistoryId(normalizedChannelName, topicId);

    const channel = await this.getChannelById(historyId);

    if (!channel) {
      return true; // No history = needs initial indexing
    }

    if (channel.consecutiveErrors > 0) {
      return false; // Has errors = skip for now (circuit breaker)
    }

    // Always allow indexing runs to fetch new messages
    return true;
  }

  /**
   * Generate history ID (channelName_topicId)
   */
  private generateHistoryId(channelName: string, topicId: number | null): string {
    const normalized = channelName.toLowerCase().replace('@', '');
    return `${normalized}_${topicId ?? 'main'}`;
  }

  /**
   * Map MongoDB document to model interface
   */
  private mapDocumentToModel(doc: any): TelegramChannel {
    return {
      id: doc.id,
      channelName: doc.channelName,
      channelId: doc.channelId,
      channelTitle: doc.channelTitle,
      topicId: doc.topicId,
      topicTitle: doc.topicTitle,
      messagesIndexed: doc.messagesIndexed,
      latestMessageDate: doc.latestMessageDate,
      latestMessageId: doc.latestMessageId,
      earliestMessageDate: doc.earliestMessageDate,
      earliestMessageId: doc.earliestMessageId,
      isComplete: doc.isComplete,
      lastIndexedAt: doc.lastIndexedAt,
      indexingErrors: doc.indexingErrors,
      consecutiveErrors: doc.consecutiveErrors,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

