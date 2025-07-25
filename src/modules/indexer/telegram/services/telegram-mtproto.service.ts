import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { AppConfigService } from '../../../core/modules/config/app-config.service';
import * as fs from 'fs';
import * as path from 'path';
import {
  TelegramMessageFetchParameters,
  TelegramMTProtoMessage,
  TelegramForumTopicInfo,
  TelegramChannelMessageOptions,
} from '../../../etl/models/telegram.model';

/**
 * Telegram MTProto Service (Indexer Module)
 *
 * Uses Telegram's native MTProto protocol (GramJS) to access full chat history
 * Authenticates as a user account instead of a bot for complete access
 *
 * ✅ Copied from ETL module for independence - can be deleted when ETL is removed
 */
@Injectable()
export class TelegramMTProtoService implements OnModuleInit {
  private readonly logger = new Logger(TelegramMTProtoService.name);
  private client: TelegramClient;
  private isInitialized = false;
  private isAuthenticated = false;
  private readonly apiId: string;
  private readonly apiHash: string;
  private readonly sessionFilePath: string;
  private sessionString: string = '';

  constructor(
    private readonly config: IndexerConfigService,
    private readonly appConfig: AppConfigService,
  ) {
    // ✅ Use AppConfigService for external API credentials
    this.apiId = this.appConfig.getTelegramApiId;
    this.apiHash = this.appConfig.getTelegramApiHash;
    // Session file path - store in project root or data directory
    this.sessionFilePath = path.join(process.cwd(), 'telegram-session.txt');

    // Load existing session if available
    this.loadSession();
  }

  /**
   * Get Telegram channels configuration for indexing
   */
  get accounts(): any[] {
    return this.appConfig.getTelegramChannelsConfig;
  }

  async onModuleInit() {
    // Initialize client but don't connect yet (connection happens on first use)
    this.initializeClient();
  }

  /**
   * Load session from file or environment variable
   */
  private loadSession(): void {
    try {
      // Try environment variable first
      const envSession = process.env.TELEGRAM_SESSION_STRING;
      if (envSession && envSession.trim()) {
        this.sessionString = envSession.trim();
        this.logger.log('✅ Loaded Telegram session from environment variable');
        return;
      }

      // Try session file
      if (fs.existsSync(this.sessionFilePath)) {
        const fileSession = fs
          .readFileSync(this.sessionFilePath, 'utf8')
          .trim();
        if (fileSession) {
          this.sessionString = fileSession;
          this.logger.log('✅ Loaded Telegram session from file');
          return;
        }
      }

      this.logger.warn('⚠️ No Telegram session found (file or environment)');
      this.sessionString = '';
    } catch (error) {
      this.logger.error(`Failed to load Telegram session: ${error.message}`);
      this.sessionString = '';
    }
  }

  /**
   * Save session to file
   */
  private saveSession(sessionString: string): void {
    try {
      fs.writeFileSync(this.sessionFilePath, sessionString, 'utf8');
      this.sessionString = sessionString;
      this.logger.log('Saved Telegram session to file');
    } catch (error) {
      this.logger.error(`Failed to save session file: ${error.message}`);
    }
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
    this.isInitialized = true;
  }

  /**
   * Ensure client is connected and authenticated
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('MTProto client not initialized');
    }

    if (this.isAuthenticated) {
      return; // Already authenticated
    }

    try {
      this.logger.log('Connecting to Telegram...');
      await this.client.connect();

      if (await this.client.checkAuthorization()) {
        this.logger.log('Already authenticated with existing session');
        this.isAuthenticated = true;
        return;
      }

      // Need to authenticate
      await this.performAuthentication();
      this.isAuthenticated = true;
    } catch (error) {
      this.logger.error(`Authentication failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Perform authentication using session file or environment session string
   */
  private async performAuthentication(): Promise<void> {
    this.logger.log('Attempting Telegram authentication...');

    try {
      // Try to connect with existing session first
      await this.client.connect();

      if (await this.client.checkAuthorization()) {
        this.logger.log('✅ Already authenticated with existing session');
        return;
      }

      // No valid session - authentication required
      this.logger.error('❌ No valid Telegram session found');
      this.logger.error('🔧 To authenticate Telegram MTProto:');
      this.logger.error('');
      this.logger.error('1️⃣ Run the session generator script:');
      this.logger.error('   npm run generate-telegram-session');
      this.logger.error('');
      this.logger.error('2️⃣ Or manually create a session:');
      this.logger.error('   - Use a separate script with interactive prompts');
      this.logger.error('   - Save the session string to telegram-session.txt');
      this.logger.error(
        '   - Or set TELEGRAM_SESSION_STRING environment variable',
      );
      this.logger.error('');
      this.logger.error('3️⃣ Required environment variables:');
      this.logger.error('   - TELEGRAM_API_ID (from https://my.telegram.org)');
      this.logger.error(
        '   - TELEGRAM_API_HASH (from https://my.telegram.org)',
      );
      this.logger.error('');

      throw new Error(
        'Telegram authentication required. Session file not found or invalid. ' +
          'Run session generator or provide valid session string.',
      );
    } catch (error) {
      this.logger.error(`Telegram authentication failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Prompt for user input - simplified version for production
   */
  private async promptForInput(question: string): Promise<string> {
    // This method is kept for backward compatibility but simplified for production
    this.logger.warn(
      `Interactive input required: ${question.trim()}. Configure environment variables for production.`,
    );
    return '';
  }

  /**
   * Get authenticated client (connects and authenticates if needed)
   */
  async getClient(): Promise<TelegramClient> {
    await this.ensureAuthenticated();
    return this.client;
  }

  /**
   * Check if client is ready to use
   */
  async isReady(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }

    try {
      await this.ensureAuthenticated();
      return this.isAuthenticated;
    } catch (error) {
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
    if (!(await this.isReady())) {
      throw new Error('Failed to connect to Telegram');
    }

    try {
      const channel = await this.getChannelEntity(channelIdentifier);

      this.logger.debug(`Getting forum topics for: ${channelIdentifier}`);

      const result = await this.client.invoke(
        new Api.channels.GetForumTopics({
          channel: channel,
          limit: 100, // Keep reasonable limit for topics
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
   * Fetch messages from a channel or forum topic with proper pagination
   * Supports both incremental (newest first) and historical (oldest first) processing
   */
  async fetchChannelMessages(
    channelIdentifier: string | number,
    options: TelegramChannelMessageOptions = {},
  ): Promise<TelegramMTProtoMessage[]> {
    if (!(await this.isReady())) {
      throw new Error('Failed to connect to Telegram');
    }

    try {
      const channel = await this.getChannelEntity(channelIdentifier);
      const allMessages: TelegramMTProtoMessage[] = [];

      const batchSize = this.config.getTelegramBatchSize(); // 1000 per batch
      const maxMessages =
        options.limit || this.config.getTelegramMaxMessagesPerRun(); // Max total messages
      let offsetId = 0; // Start from newest (or oldest if reverse)
      let fetchedCount = 0;

      const isHistorical = options.reverse === true;
      const direction = isHistorical
        ? 'chronological (oldest first)'
        : 'newest first';

      this.logger.log(
        `Fetching messages from ${channelIdentifier}${options.topicId ? ` topic ${options.topicId}` : ''} (batch size: ${batchSize}, max: ${maxMessages}, direction: ${direction})`,
      );

      // Keep fetching until we have enough messages or reach the date limit
      while (fetchedCount < maxMessages) {
        const messageParams: TelegramMessageFetchParameters = {
          limit: Math.min(batchSize, maxMessages - fetchedCount),
          offsetId: offsetId,
        };

        // Only add replyTo for forum topics
        if (options.topicId) {
          messageParams.replyTo = options.topicId;
        }

        this.logger.debug(
          `Fetching batch: offsetId=${offsetId}, limit=${messageParams.limit}`,
        );

        const result = await this.client.getMessages(channel, messageParams);

        if (!result || result.length === 0) {
          this.logger.log(`No more messages available - stopping fetch`);
          break;
        }

        // Convert messages to our format
        const batchMessages = result.map((msg) => ({
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

        // Apply date filtering if specified
        let filteredMessages = batchMessages;
        if (options.offsetDate) {
          // ✅ HISTORICAL ETL: Always get messages NEWER than offsetDate
          // This allows us to start from bottom of chat and work UP chronologically
          filteredMessages = batchMessages.filter(
            (msg) => new Date(msg.date * 1000) > options.offsetDate!,
          );

          // Log filtering results
          if (filteredMessages.length < batchMessages.length) {
            const dateLimit = options.offsetDate.toISOString();
            this.logger.log(
              `Filtered to ${filteredMessages.length}/${batchMessages.length} messages newer than ${dateLimit}`,
            );
          }
        }

        allMessages.push(...filteredMessages);
        fetchedCount += result.length;

        // Update offsetId for next batch (use the oldest message ID from this batch)
        if (result.length > 0) {
          offsetId = result[result.length - 1].id;
        }

        // If we filtered out messages due to date, and we got fewer than requested, we may have hit our limit
        if (options.offsetDate && filteredMessages.length < result.length) {
          const dateLimit = options.offsetDate.toISOString();
          this.logger.log(
            `Reached date limit (newer than ${dateLimit}) - stopping fetch`,
          );
          break;
        }

        // If we got fewer messages than requested, we've reached the end
        if (result.length < messageParams.limit) {
          this.logger.log(`Reached end of messages - stopping fetch`);
          break;
        }

        // Small delay between batches to avoid rate limiting
        await this.delay(100);
      }

      // Sort messages based on direction preference
      if (isHistorical) {
        // For historical processing, sort chronologically (oldest first)
        allMessages.sort((a, b) => a.date - b.date);
      } else {
        // For incremental processing, sort newest first
        allMessages.sort((a, b) => b.date - a.date);
      }

      this.logger.log(
        `Fetched ${allMessages.length} messages from ${channelIdentifier} (processed ${fetchedCount} total, direction: ${direction})`,
      );

      return allMessages;
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
   * Disconnect client
   */
  async disconnect(): Promise<void> {
    if (this.client && this.client.connected) {
      await this.client.disconnect();
      this.isAuthenticated = false;
      this.logger.log('Disconnected from Telegram');
    }
  }

  /**
   * Fetch messages from a forum topic with anti-spam delays
   */
  private async fetchMessagesFromTopic(
    entity: any,
    topicId: number,
    limit = this.config.getTelegramBatchSize(),
  ): Promise<any[]> {
    try {
      // Add delay between requests to avoid rate limiting
      await this.delay(2000); // 2-second delay

      const messages = await this.client.getMessages(entity, {
        limit: Math.min(limit, 20), // Reduce batch size to be less aggressive
        offsetId: 0,
        replyTo: topicId,
      });

      this.logger.log(
        `Fetched ${messages.length} messages from topic ${topicId} with rate limiting`,
      );

      return messages;
    } catch (error) {
      this.logger.error(
        `Error fetching messages from topic ${topicId}: ${error.message}`,
      );

      // If we get rate limited, wait longer before retrying
      if (error.message.includes('FLOOD_WAIT')) {
        const waitTime = this.extractFloodWaitTime(error.message);
        this.logger.warn(
          `Rate limited - waiting ${waitTime} seconds before retry`,
        );
        await this.delay(waitTime * 1000);
      }

      throw error;
    }
  }

  /**
   * Extract flood wait time from error message
   */
  private extractFloodWaitTime(errorMessage: string): number {
    const match = errorMessage.match(/FLOOD_WAIT_(\d+)/);
    return match ? parseInt(match[1]) : 60; // Default to 60 seconds
  }

  /**
   * Add delay utility to prevent aggressive API usage
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetch forum topics with rate limiting
   */
  async fetchForumTopics(channelId: string, limit = 50): Promise<any[]> {
    try {
      await this.ensureAuthenticated(); // Changed from ensureAuthentication to ensureConnected

      // Add delay before forum topic requests
      await this.delay(3000); // 3-second delay for sensitive operations

      const entity = await this.client.getEntity(channelId);

      // Use smaller batch sizes to be less aggressive
      const topics = await this.client.invoke(
        new Api.channels.GetForumTopics({
          channel: entity,
          limit: Math.min(limit, 10), // Reduce from 50 to 10
        }),
      );

      this.logger.log(
        `Fetched ${topics.topics?.length || 0} forum topics with rate limiting`,
      );

      return topics.topics || [];
    } catch (error) {
      this.logger.error(`Error fetching forum topics: ${error.message}`);

      // Handle rate limiting gracefully
      if (error.message.includes('FLOOD_WAIT')) {
        const waitTime = this.extractFloodWaitTime(error.message);
        this.logger.warn(
          `Rate limited on forum topics - waiting ${waitTime} seconds`,
        );
        await this.delay(waitTime * 1000);
      }

      throw error;
    }
  }
}

export { TelegramMTProtoMessage };
