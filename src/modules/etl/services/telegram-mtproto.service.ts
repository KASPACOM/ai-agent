import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { EtlConfigService } from '../config/etl.config';

export interface TelegramMTProtoMessage {
  id: number;
  message: string;
  fromId?: any;
  toId: any;
  date: number; // Unix timestamp (epoch seconds)
  out: boolean;
  mentioned: boolean;
  mediaUnread: boolean;
  silent: boolean;
  post: boolean;
  fromScheduled: boolean;
  legacy: boolean;
  editHide: boolean;
  pinned: boolean;
  noforwards: boolean;
  replyTo?: any;
  media?: any;
  replyMarkup?: any;
  entities?: any[];
  views?: number;
  forwards?: number;
  replies?: any;
  editDate?: number; // Unix timestamp (epoch seconds)
  postAuthor?: string;
  groupedId?: any;
  restrictionReason?: any[];
  ttlPeriod?: number;
}

export interface TelegramForumTopicInfo {
  id: number;
  title: string;
  iconColor?: number;
  iconEmojiId?: string;
  closed: boolean;
  hidden: boolean;
}

/**
 * Telegram MTProto Service
 *
 * Uses Telegram's native MTProto protocol (GramJS) to access full chat history
 * Authenticates as a user account instead of a bot for complete access
 */
@Injectable()
export class TelegramMTProtoService implements OnModuleInit {
  private readonly logger = new Logger(TelegramMTProtoService.name);
  private client: TelegramClient;
  private isInitialized = false;
  private readonly apiId: string;
  private readonly apiHash: string;
  private readonly sessionString: string;

  constructor(private readonly etlConfig: EtlConfigService) {
    this.apiId = this.etlConfig.getTelegramApiId();
    this.apiHash = this.etlConfig.getTelegramApiHash();
    // For now, use empty session - in production you'd store this
    this.sessionString = '';
  }

  async onModuleInit() {
    // Initialize client but don't connect yet (connection happens on first use)
    this.initializeClient();
  }

  /**
   * Initialize the Telegram client
   */
  private initializeClient(): void {
    if (!this.apiId || !this.apiHash) {
      this.logger.warn(
        'Telegram API_ID or API_HASH not configured. MTProto service will be disabled.',
      );
      return;
    }

    const session = new StringSession(this.sessionString);
    this.client = new TelegramClient(
      session,
      parseInt(this.apiId),
      this.apiHash,
      {
        connectionRetries: 5,
      },
    );

    this.logger.log('Telegram MTProto client initialized');
  }

  /**
   * Ensure client is connected (handles authentication)
   */
  private async ensureConnected(): Promise<boolean> {
    if (!this.client) {
      this.logger.error('Telegram client not initialized');
      return false;
    }

    if (this.isInitialized) {
      return true;
    }

    try {
      this.logger.log('Connecting to Telegram...');

      // Start the client (this will prompt for phone/code in development)
      await this.client.start({
        phoneNumber: async () => {
          this.logger.warn(
            'Phone number required for Telegram authentication. Set up session string for production.',
          );
          return ''; // In production, use a stored session
        },
        password: async () => {
          this.logger.warn('Password required for 2FA');
          return '';
        },
        phoneCode: async () => {
          this.logger.warn('Phone code required');
          return '';
        },
        onError: (err) => this.logger.error('Telegram auth error:', err),
      });

      this.isInitialized = true;
      this.logger.log('Successfully connected to Telegram');

      // Log session string for future use
      const sessionString = this.client.session.save();
      this.logger.log(
        'Session string (save this for production):',
        sessionString,
      );

      return true;
    } catch (error) {
      this.logger.error('Failed to connect to Telegram:', error.message);
      return false;
    }
  }

  /**
   * Get channel/chat entity by username or ID
   */
  private async getChannelEntity(
    channelIdentifier: string | number,
  ): Promise<any> {
    try {
      if (typeof channelIdentifier === 'string') {
        // Remove @ if present
        const username = channelIdentifier.replace('@', '');
        return await this.client.getEntity(username);
      } else {
        return await this.client.getEntity(channelIdentifier);
      }
    } catch (error) {
      this.logger.error(
        `Failed to get channel entity for ${channelIdentifier}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get forum topics for a forum-type channel
   */
  async getForumTopics(
    channelIdentifier: string | number,
  ): Promise<TelegramForumTopicInfo[]> {
    if (!(await this.ensureConnected())) {
      throw new Error('Failed to connect to Telegram');
    }

    try {
      const channel = await this.getChannelEntity(channelIdentifier);

      this.logger.debug(`Getting forum topics for: ${channelIdentifier}`);

      const result = await this.client.invoke(
        new Api.channels.GetForumTopics({
          channel: channel,
          limit: 100,
        }),
      );

      const topics: TelegramForumTopicInfo[] = [];

      if (result.topics) {
        for (const topic of result.topics) {
          if (topic instanceof Api.ForumTopic) {
            topics.push({
              id: Number(topic.id), // Convert BigInteger to number
              title: topic.title,
              iconColor: topic.iconColor,
              iconEmojiId: topic.iconEmojiId?.toString(),
              closed: topic.closed,
              hidden: topic.hidden,
            });
          }
        }
      }

      this.logger.log(
        `Found ${topics.length} forum topics in ${channelIdentifier}`,
      );
      return topics;
    } catch (error) {
      this.logger.error(`Failed to get forum topics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch messages from a channel or forum topic
   */
  async fetchChannelMessages(
    channelIdentifier: string | number,
    options: {
      topicId?: number;
      limit?: number;
      offsetId?: number;
      offsetDate?: Date;
      addOffset?: number;
      maxId?: number;
      minId?: number;
      reverse?: boolean;
    } = {},
  ): Promise<TelegramMTProtoMessage[]> {
    if (!(await this.ensureConnected())) {
      throw new Error('Failed to connect to Telegram');
    }

    try {
      const channel = await this.getChannelEntity(channelIdentifier);

      this.logger.debug(
        `Fetching messages from ${channelIdentifier}${options.topicId ? ` topic ${options.topicId}` : ''}`,
      );

      const messages = await this.client.getMessages(channel, {
        limit: options.limit || 100,
        offsetId: options.offsetId,
        offsetDate: options.offsetDate
          ? Math.floor(options.offsetDate.getTime() / 1000)
          : undefined, // Convert Date to Unix timestamp
        addOffset: options.addOffset,
        maxId: options.maxId,
        minId: options.minId,
        reverse: options.reverse || false,
        replyTo: options.topicId, // For forum topics
      });

      this.logger.log(
        `Fetched ${messages.length} messages from ${channelIdentifier}${options.topicId ? ` topic ${options.topicId}` : ''}`,
      );

      // Convert to our interface
      return messages.map((msg) => ({
        id: msg.id,
        message: msg.message || '',
        fromId: msg.fromId,
        toId: msg.peerId,
        date: msg.date,
        out: msg.out || false,
        mentioned: msg.mentioned || false,
        mediaUnread: msg.mediaUnread || false,
        silent: msg.silent || false,
        post: msg.post || false,
        fromScheduled: msg.fromScheduled || false,
        legacy: msg.legacy || false,
        editHide: msg.editHide || false,
        pinned: msg.pinned || false,
        noforwards: msg.noforwards || false,
        replyTo: msg.replyTo,
        media: msg.media,
        replyMarkup: msg.replyMarkup,
        entities: msg.entities,
        views: msg.views,
        forwards: msg.forwards,
        replies: msg.replies,
        editDate: msg.editDate,
        postAuthor: msg.postAuthor,
        groupedId: msg.groupedId,
        restrictionReason: msg.restrictionReason,
        ttlPeriod: msg.ttlPeriod,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to fetch messages from ${channelIdentifier}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Fetch all messages from all forum topics in a channel
   */
  async fetchAllForumMessages(
    channelIdentifier: string | number,
    options: {
      limit?: number;
      offsetDate?: Date;
      reverse?: boolean;
    } = {},
  ): Promise<{ [topicId: number]: TelegramMTProtoMessage[] }> {
    const messagesByTopic: { [topicId: number]: TelegramMTProtoMessage[] } = {};

    try {
      // Get all forum topics first
      const topics = await this.getForumTopics(channelIdentifier);

      this.logger.log(
        `Processing ${topics.length} forum topics in ${channelIdentifier}`,
      );

      // Fetch messages from each topic
      for (const topic of topics) {
        try {
          this.logger.debug(
            `Fetching messages from topic: "${topic.title}" (${topic.id})`,
          );

          const messages = await this.fetchChannelMessages(channelIdentifier, {
            topicId: topic.id,
            limit: options.limit,
            offsetDate: options.offsetDate,
            reverse: options.reverse,
          });

          messagesByTopic[topic.id] = messages;

          this.logger.log(
            `Fetched ${messages.length} messages from topic "${topic.title}"`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to fetch messages from topic "${topic.title}": ${error.message}`,
          );
          messagesByTopic[topic.id] = [];
        }
      }

      return messagesByTopic;
    } catch (error) {
      this.logger.error(
        `Failed to fetch forum messages from ${channelIdentifier}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Check if the client is connected and working
   */
  async checkConnection(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        return false;
      }

      // Try to get the current user (simple connectivity test)
      await this.client.getMe();
      return true;
    } catch (error) {
      this.logger.error('Telegram connection check failed:', error.message);
      return false;
    }
  }

  /**
   * Get service statistics
   */
  getServiceStats(): any {
    return {
      service: 'Telegram MTProto',
      isInitialized: this.isInitialized,
      hasApiCredentials: !!(this.apiId && this.apiHash),
      connectionStatus: this.isInitialized ? 'Connected' : 'Not connected',
      clientType: 'User Account (MTProto)',
      capabilities: [
        'Full chat history access',
        'Forum topic support',
        'Public channel access',
        'User-level permissions',
      ],
    };
  }

  /**
   * Disconnect the client
   */
  async disconnect(): Promise<void> {
    if (this.client && this.isInitialized) {
      await this.client.disconnect();
      this.isInitialized = false;
      this.logger.log('Disconnected from Telegram');
    }
  }
}
