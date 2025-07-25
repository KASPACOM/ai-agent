import { Injectable } from '@nestjs/common';
import { BaseIndexerService } from './base-indexer.service';
import { QdrantRepository } from '../../database/qdrant/services/qdrant.repository';
import { QdrantClientService } from '../../database/qdrant/services/qdrant-client.service';
import { EmbeddingService } from '../../embedding/embedding.service';
import { EtlConfigService } from '../config/etl.config';
import {
  BaseMessage,
  HistoricalFetchParams,
  IndexingResult,
  MessageProcessingResult,
} from '../models/base-indexer.model';
import { TelegramMessage, TelegramMessageType } from '../models/telegram.model';
import { TweetProcessingStatus, EmbeddingModel } from '../models/etl.enums';
import { TelegramMessageTransformer } from '../transformers/telegram-message.transformer';
import { TelegramApiService, TelegramChannel } from './telegram-api.service';
import {
  TelegramMTProtoService,
  TelegramMTProtoMessage,
} from './telegram-mtproto.service';

/**
 * Telegram Indexer Service
 *
 * Specialized indexer for Telegram messages
 * Inherits common functionality from BaseIndexerService
 * TODO: Implement Telegram API integration
 */
@Injectable()
export class TelegramIndexerService extends BaseIndexerService {
  constructor(
    qdrantRepository: QdrantRepository,
    embeddingService: EmbeddingService,
    etlConfig: EtlConfigService,
    private readonly telegramApi: TelegramApiService,
    private readonly telegramMTProto: TelegramMTProtoService,
    private readonly qdrantClient: QdrantClientService,
  ) {
    super(
      qdrantRepository,
      embeddingService,
      etlConfig,
      'Telegram',
      'kaspa_telegram_messages', // Collection name for Telegram messages
    );
  }

  /**
   * Get Telegram channels from configuration
   */
  protected getServiceAccounts(): string[] {
    const channels = this.etlConfig.getTelegramChannelsConfig();
    return channels.map((channel) => channel.username || channel.id.toString());
  }

  /**
   * Telegram-specific indexing implementation
   * Processes all configured Telegram channels and forum topics
   */
  async runIndexer(): Promise<IndexingResult> {
    return this.executeIndexingProcess(async () => {
      return this.processAllTelegramChannels();
    });
  }

  /**
   * Process all configured Telegram channels
   * Handles incremental updates by checking latest message dates in Qdrant
   */
  private async processAllTelegramChannels(): Promise<MessageProcessingResult> {
    const allErrors: string[] = [];
    let totalProcessed = 0;
    let totalEmbedded = 0;
    let totalStored = 0;
    const allMessages: BaseMessage[] = [];

    // Ensure Telegram collection exists before processing
    try {
      await this.ensureTelegramCollectionExists();
    } catch (error) {
      const errorMsg = `Failed to ensure Telegram collection exists: ${error.message}`;
      this.logger.error(errorMsg);
      return {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors: [errorMsg],
        messages: [],
      };
    }

    const channels = this.etlConfig.getTelegramChannelsConfig();
    this.logger.log(`Processing ${channels.length} Telegram channels`);

    if (channels.length === 0) {
      this.logger.warn('No Telegram channels configured - skipping processing');
      return {
        success: true,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors: [],
        messages: [],
      };
    }

    for (const channelConfig of channels) {
      try {
        // Ensure channelIdentifier is always a string for processAccount
        const channelIdentifier = String(
          channelConfig.username || channelConfig.id || '',
        );
        this.logger.log(`Processing Telegram channel: ${channelIdentifier}`);

        // Use the base class processAccount method for incremental processing
        // This will automatically check latest message date in Qdrant and fetch only new messages
        const result = await this.processAccount(channelIdentifier);

        totalProcessed += result.processed;
        totalEmbedded += result.embedded;
        totalStored += result.stored;
        allMessages.push(...result.messages);

        if (result.errors.length > 0) {
          allErrors.push(...result.errors);
        }

        this.logger.log(
          `Completed processing ${channelIdentifier}: ${result.processed} processed, ${result.embedded} embedded, ${result.stored} stored`,
        );
      } catch (error) {
        const errorMsg = `Failed to process Telegram channel ${channelConfig.username || channelConfig.id}: ${error.message}`;
        this.logger.error(errorMsg);
        allErrors.push(errorMsg);
      }
    }

    const success = allErrors.length === 0;
    this.logger.log(
      `Telegram indexing completed: ${totalProcessed} processed, ${totalEmbedded} embedded, ${totalStored} stored, ${allErrors.length} errors`,
    );

    return {
      success,
      processed: totalProcessed,
      embedded: totalEmbedded,
      stored: totalStored,
      errors: allErrors,
      messages: allMessages,
    };
  }

  /**
   * Process a single Telegram account/channel
   * Override base implementation to use custom batch processing with text validation
   */
  protected async processAccount(
    account: string,
  ): Promise<MessageProcessingResult> {
    const errors: string[] = [];

    try {
      // Get latest message date from our Qdrant collection for historical continuation
      let startFromDate: Date | undefined;
      try {
        const boundaries =
          await this.qdrantRepository.getTweetBoundariesForAccount(
            account,
            this.config.collectionName,
          );
        startFromDate = boundaries.latest;
        if (startFromDate) {
          this.logger.log(
            `Latest stored message for ${account}: ${startFromDate.toISOString()}`,
          );
        } else {
          this.logger.log(
            `No existing messages found for ${account} - starting fresh`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Could not check latest message date for ${account}: ${error.message}`,
        );
      }

      // Determine processing mode based on existing data
      let messages: TelegramMessage[];
      if (startFromDate) {
        // We have existing data - do incremental processing (get newer messages)
        this.logger.log(
          `Starting incremental processing for ${account} (newer than ${startFromDate.toISOString()})`,
        );
        messages = await this.processMessagesInChunks({
          account,
          sinceDate: startFromDate,
          isIncremental: true,
        });
      } else {
        // No existing data - do historical processing (get older messages)
        this.logger.log(
          `Starting historical processing for ${account} (initial backfill)`,
        );
        messages = await this.processMessagesInChunks({
          account,
          isIncremental: false,
        });
      }

      if (messages.length === 0) {
        this.logger.log(`No new messages found for account: ${account}`);
        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          messages: [], // Return empty array for TelegramMessage[]
        };
      }

      this.logger.log(`Found ${messages.length} new messages for ${account}`);

      // Use our custom message processing with text validation (not base indexer's batch processing)
      return await this.processMessages(messages); // Now passes TelegramMessage[] correctly
    } catch (error) {
      const errorMsg = `Failed to process account ${account}: ${error.message}`;
      this.logger.error(errorMsg);
      errors.push(errorMsg);

      return {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors,
        messages: [],
      };
    }
  }

  /**
   * Ensure Telegram collection exists in Qdrant
   */
  private async ensureTelegramCollectionExists(): Promise<void> {
    try {
      const collectionName = this.config.collectionName;
      this.logger.log(`Ensuring Telegram collection exists: ${collectionName}`);

      // Check if collection already exists
      const exists = await this.qdrantClient.collectionExists(collectionName);

      if (exists) {
        this.logger.log(
          `Telegram collection already exists: ${collectionName}`,
        );
        return;
      }

      // Create collection with proper configuration for embeddings
      const collectionConfig = {
        vectors: {
          size: this.etlConfig.getEmbeddingConfig().dimensions || 1536, // OpenAI embedding dimensions
          distance: 'Cosine',
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      };

      await this.qdrantClient.createCollection(
        collectionName,
        collectionConfig,
      );
      this.logger.log(`Created Telegram collection: ${collectionName}`);

      // Verify collection creation
      const collectionInfo =
        await this.qdrantClient.getCollectionInfo(collectionName);
      this.logger.log(`Collection verification:`, {
        status: collectionInfo?.status || 'unknown',
        pointsCount: collectionInfo?.points_count || 0,
      });
    } catch (error) {
      this.logger.error(
        `Failed to ensure Telegram collection exists: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Process messages in chunks to avoid memory issues
   * Fetches 10k messages, processes completely, then continues from where it left off
   */
  protected async processMessagesInChunks(params: {
    account: string;
    sinceDate?: Date;
    isIncremental: boolean;
  }): Promise<TelegramMessage[]> {
    const CHUNK_SIZE = 10000; // Process 10k messages at a time
    const allProcessedMessages: TelegramMessage[] = [];
    const totalProcessed = 0;
    const hasMoreData = true;
    const offsetId = 0; // For pagination

    try {
      // Check if MTProto is ready
      if (!(await this.telegramMTProto.isReady())) {
        throw new Error(
          'MTProto client not ready. Check TELEGRAM_API_ID, TELEGRAM_API_HASH, and authentication.',
        );
      }

      // Determine channel identifier
      const channelConfig = { username: params.account };
      let channelIdentifier = channelConfig.username;
      if (!channelIdentifier.startsWith('@')) {
        channelIdentifier = '@' + channelIdentifier;
      }

      const processingType = params.isIncremental
        ? 'incremental'
        : 'historical';
      this.logger.log(
        `Starting ${processingType} processing for ${channelIdentifier} in chunks of ${CHUNK_SIZE}`,
      );

      // Process messages incrementally per topic + main channel
      // Topic messages and main channel messages need different pagination approaches

      const allNewMessages: Array<{ msg: any; topicId?: number }> = [];

      // 1. Process main channel messages incrementally
      this.logger.log(`Processing main channel messages incrementally...`);

      // Get latest date for main channel (using base account name)
      const baseAccountName = channelIdentifier.replace('@', '');
      let mainChannelLatestDate: Date | undefined;

      try {
        const mainChannelBoundaries =
          await this.qdrantRepository.getTweetBoundariesForAccount(
            baseAccountName,
            this.config.collectionName,
          );
        mainChannelLatestDate = mainChannelBoundaries.latest;

        if (mainChannelLatestDate) {
          this.logger.log(
            `Latest main channel message: ${mainChannelLatestDate.toISOString()}`,
          );
        } else {
          this.logger.log(`No existing main channel messages found`);
        }
      } catch (error) {
        this.logger.warn(
          `Could not check main channel latest date: ${error.message}`,
        );
      }

      // Fetch main channel messages incrementally
      const channelOffsetId = 0;
      const hasMoreChannelMessages = true;
      const mainChannelMessages: any[] = [];

      while (
        hasMoreChannelMessages &&
        mainChannelMessages.length < CHUNK_SIZE
      ) {
        const remainingChannelMessages =
          CHUNK_SIZE - mainChannelMessages.length;
        const channelBatchSize = Math.min(1000, remainingChannelMessages);

        const channelBatch = await this.telegramMTProto.fetchChannelMessages(
          channelIdentifier,
          {
            limit: channelBatchSize,
            offsetId: channelOffsetId,
            reverse: !params.isIncremental,
          },
        );

        if (channelBatch.length === 0) {
          break;
        }

        // Filter for messages newer than our latest (if incremental)
        let filteredChannelBatch = channelBatch;
        if (params.isIncremental && mainChannelLatestDate) {
          filteredChannelBatch = channelBatch.filter(
            (msg) => new Date(msg.date * 1000) > mainChannelLatestDate!,
          );
        }

        mainChannelMessages.push(...filteredChannelBatch);

        // If no new messages in this batch, stop
        if (params.isIncremental && filteredChannelBatch.length === 0) {
          this.logger.log(`No new main channel messages found`);
          break;
        }
      }

      this.logger.log(
        `Found ${mainChannelMessages.length} new main channel messages`,
      );

      // Add main channel messages with no topicId
      mainChannelMessages.forEach((msg) => {
        allNewMessages.push({ msg, topicId: undefined });
      });

      // 2. Process each forum topic incrementally
      this.logger.log(`Processing forum topics incrementally...`);

      // Get all forum topics
      const topics =
        await this.telegramMTProto.getForumTopics(channelIdentifier);
      this.logger.log(`Found ${topics.length} forum topics to process`);

      for (const topic of topics) {
        try {
          // Get latest date for this specific topic
          const topicAccountName = `${baseAccountName}:topic:${topic.id}`;
          let topicLatestDate: Date | undefined;

          try {
            const topicBoundaries =
              await this.qdrantRepository.getTweetBoundariesForAccount(
                topicAccountName,
                this.config.collectionName,
              );
            topicLatestDate = topicBoundaries.latest;

            if (topicLatestDate) {
              this.logger.log(
                `Topic "${topic.title}" latest message: ${topicLatestDate.toISOString()}`,
              );
            } else {
              this.logger.log(
                `Topic "${topic.title}" has no existing messages`,
              );
            }
          } catch (error) {
            this.logger.warn(
              `Could not check topic "${topic.title}" latest date: ${error.message}`,
            );
          }

          // Fetch messages from this topic incrementally
          const topicMessages = await this.telegramMTProto.fetchChannelMessages(
            channelIdentifier,
            {
              topicId: topic.id,
              limit: CHUNK_SIZE, // Get up to chunk size per topic
              reverse: !params.isIncremental,
            },
          );

          // Filter for messages newer than our latest (if incremental)
          let filteredTopicMessages = topicMessages;
          if (params.isIncremental && topicLatestDate) {
            filteredTopicMessages = topicMessages.filter(
              (msg) => new Date(msg.date * 1000) > topicLatestDate!,
            );
          }

          this.logger.log(
            `Topic "${topic.title}": found ${filteredTopicMessages.length} new messages`,
          );

          // Add topic messages with their topicId
          filteredTopicMessages.forEach((msg) => {
            allNewMessages.push({ msg, topicId: topic.id });
          });
        } catch (error) {
          this.logger.error(
            `Failed to process topic "${topic.title}": ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Total new messages across all sources: ${allNewMessages.length}`,
      );

      if (allNewMessages.length === 0) {
        this.logger.log(`No new messages found - stopping`);
        return allProcessedMessages;
      }

      // Convert to TelegramMessage format with proper topic information
      const telegramMessages = allNewMessages.map(({ msg, topicId }) => {
        return this.convertMTProtoMessageToBase(
          msg,
          channelConfig,
          channelIdentifier,
          topicId, // This ensures proper authorHandle generation
        );
      });

      this.logger.log(
        `Converted ${telegramMessages.length} messages to TelegramMessage format`,
      );

      // Process all new messages
      await this.processMessageBatch(telegramMessages);
      allProcessedMessages.push(...telegramMessages);

      this.logger.log(
        `${processingType} processing completed: ${telegramMessages.length} messages processed`,
      );

      return allProcessedMessages;
    } catch (error) {
      this.logger.error(
        `Failed to process messages in chunks for ${params.account}: ${error.message}`,
      );
      return allProcessedMessages; // Return what we processed so far
    }
  }

  /**
   * Process a batch of messages (embed + store)
   */
  private async processMessageBatch(
    messages: TelegramMessage[],
  ): Promise<void> {
    if (messages.length === 0) return;

    try {
      // Process in smaller batches for embedding/storage (100 messages per batch)
      const PROCESSING_BATCH_SIZE = 100;

      for (let i = 0; i < messages.length; i += PROCESSING_BATCH_SIZE) {
        const batch = messages.slice(i, i + PROCESSING_BATCH_SIZE);

        // Fix messages with empty/invalid text and ensure proper boolean fields
        const processableMessages = batch.map((msg) => {
          const text = msg.text?.trim();

          if (!text || text.length === 0) {
            // Set consistent text for empty messages
            return {
              ...msg,
              text: 'empty text',
              // Ensure boolean fields are properly set for querying
              telegramHasMedia: msg.telegramHasMedia || false,
              telegramIsForwarded: msg.telegramIsForwarded || false,
              telegramReplyToMessageId: msg.telegramReplyToMessageId || null,
              hasLinks: (msg.links && msg.links.length > 0) || false,
            };
          }

          // For messages with text, still ensure boolean fields are set
          return {
            ...msg,
            telegramHasMedia: msg.telegramHasMedia || false,
            telegramIsForwarded: msg.telegramIsForwarded || false,
            hasLinks: (msg.links && msg.links.length > 0) || false,
          };
        });

        if (processableMessages.length === 0) {
          this.logger.debug(
            `Skipping batch ${Math.floor(i / PROCESSING_BATCH_SIZE) + 1} - no messages to process`,
          );
          continue;
        }

        this.logger.debug(
          `Processing batch ${Math.floor(i / PROCESSING_BATCH_SIZE) + 1}/${Math.ceil(messages.length / PROCESSING_BATCH_SIZE)} (${processableMessages.length} messages)`,
        );

        // Try batch processing first (more efficient)
        let batchProcessed = false;

        try {
          // Generate embeddings for processable messages
          const embeddingResponse =
            await this.embeddingService.generateEmbeddings({
              texts: processableMessages.map((msg) => msg.text.trim()),
              model: EmbeddingModel.TEXT_EMBEDDING_3_LARGE,
            });

          // Check if embeddings were generated successfully
          if (
            embeddingResponse.success &&
            embeddingResponse.embeddings.length === processableMessages.length
          ) {
            // Create vector batch for storage
            const vectorBatch = processableMessages.map((message, index) => ({
              tweetId: message.id,
              vector: embeddingResponse.embeddings[index].vector,
              metadata: message,
            }));

            // Store this batch in Qdrant
            const result =
              await this.qdrantRepository.storeTelegramVectorsBatch(
                vectorBatch,
                this.config.collectionName,
              );

            if (result.success) {
              this.logger.debug(
                `Successfully stored ${result.stored} messages via batch processing`,
              );
              batchProcessed = true;
            } else {
              this.logger.warn(
                `Batch storage failed: ${result.errors.join(', ')} - will try individual processing`,
              );
            }
          } else {
            this.logger.warn(
              `Batch embedding failed (success: ${embeddingResponse.success}, count: ${embeddingResponse.embeddings?.length}/${processableMessages.length}) - will try individual processing`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Batch processing failed: ${error.message} - will try individual processing`,
          );
        }

        // If batch processing failed, process messages individually to avoid data loss
        if (!batchProcessed) {
          this.logger.log(
            `Falling back to individual processing for batch ${Math.floor(i / PROCESSING_BATCH_SIZE) + 1} (${processableMessages.length} messages)`,
          );

          let individualSuccesses = 0;
          let individualFailures = 0;

          for (const message of processableMessages) {
            try {
              // Generate embedding for single message
              const singleEmbeddingResponse =
                await this.embeddingService.generateEmbeddings({
                  texts: [message.text.trim()],
                  model: EmbeddingModel.TEXT_EMBEDDING_3_LARGE,
                });

              if (
                singleEmbeddingResponse.success &&
                singleEmbeddingResponse.embeddings.length === 1
              ) {
                // Store single message
                const singleVectorBatch = [
                  {
                    tweetId: message.id,
                    vector: singleEmbeddingResponse.embeddings[0].vector,
                    metadata: message,
                  },
                ];

                const singleResult =
                  await this.qdrantRepository.storeTelegramVectorsBatch(
                    singleVectorBatch,
                    this.config.collectionName,
                  );

                if (singleResult.success) {
                  individualSuccesses++;
                } else {
                  this.logger.error(
                    `Failed to store individual message ${message.id}: ${singleResult.errors.join(', ')}`,
                  );
                  individualFailures++;
                }
              } else {
                this.logger.error(
                  `Failed to generate embedding for message ${message.id}: ${singleEmbeddingResponse.errors?.join(', ') || 'Unknown error'}`,
                );
                individualFailures++;
              }
            } catch (error) {
              this.logger.error(
                `Failed to process individual message ${message.id}: ${error.message}`,
              );
              individualFailures++;
            }
          }

          this.logger.log(
            `Individual processing completed: ${individualSuccesses} success, ${individualFailures} failures`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process message batch: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch historical messages from Telegram channels
   * Implements chronological historical processing (oldest to newest)
   * Different from incremental processing - this fetches ALL history in order
   */
  protected async fetchHistoricalMessages(
    params: HistoricalFetchParams,
  ): Promise<TelegramMessage[]> {
    // Changed return type to TelegramMessage[]
    try {
      this.logger.log(
        `Fetching historical Telegram messages for ${params.account} (chronological historical processing)`,
      );

      // Check if MTProto is ready
      if (!(await this.telegramMTProto.isReady())) {
        throw new Error(
          'MTProto client not ready. Check TELEGRAM_API_ID, TELEGRAM_API_HASH, and authentication.',
        );
      }

      // Get channel identifier (ensure it has @ prefix if it's a username)
      let channelIdentifier = params.account;
      if (
        !channelIdentifier.startsWith('@') &&
        !channelIdentifier.match(/^-?\d+$/)
      ) {
        channelIdentifier = '@' + channelIdentifier;
      }

      // For historical processing, we want to fetch ALL messages in chronological order
      // NOT incremental processing based on latest date

      // First, check what's our earliest stored message (for continuing where we left off)
      let startAfterDate: Date | undefined;
      try {
        const boundaries =
          await this.qdrantRepository.getTweetBoundariesForAccount(
            params.account,
            this.config.collectionName,
          );

        if (boundaries.hasData && boundaries.earliest) {
          // We have data - continue from where we left off (get messages older than our earliest)
          startAfterDate = boundaries.earliest;
          this.logger.log(
            `Found existing data - will fetch messages older than ${startAfterDate.toISOString()}`,
          );
        } else {
          this.logger.log('No existing data - starting fresh historical fetch');
        }
      } catch (error) {
        this.logger.warn(
          `Could not check existing data boundaries: ${error.message}`,
        );
      }

      // Fetch messages using MTProto with proper historical processing
      const messages = await this.telegramMTProto.fetchChannelMessages(
        channelIdentifier,
        {
          limit: 1000, // Use a large batch size for historical processing
          // For historical processing: if we have data, get older messages than our earliest
          // If no data, get all available messages
          offsetDate: startAfterDate,
          reverse: true, // IMPORTANT: Get chronological order (oldest first)
        },
      );

      this.logger.log(
        `Found ${messages.length} historical messages from ${channelIdentifier}`,
      );

      // Convert MTProto messages to TelegramMessage format (NOT BaseMessage)
      const telegramMessages = messages.map((msg) =>
        this.convertMTProtoMessageToBase(
          msg,
          { username: params.account },
          channelIdentifier,
        ),
      );

      // For historical processing, we want messages OLDER than our earliest stored message
      // This is the opposite of incremental processing
      const filteredMessages = startAfterDate
        ? telegramMessages.filter((msg) => msg.createdAt < startAfterDate!)
        : telegramMessages;

      this.logger.log(
        `Found ${filteredMessages.length} new historical messages for ${params.account} after filtering`,
      );

      // Sort chronologically (oldest first) for consistent processing
      filteredMessages.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );

      return filteredMessages; // Return TelegramMessage[] with all fields intact
    } catch (error) {
      this.logger.error(
        `Failed to fetch historical Telegram messages for ${params.account}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Transform Telegram message for Qdrant storage
   */
  protected transformMessageForStorage(message: BaseMessage): any {
    // Cast to TelegramMessage to access telegram-specific fields
    const telegramMessage = message as TelegramMessage;
    return TelegramMessageTransformer.transformMessageForStorage(
      telegramMessage,
    );
  }

  /**
   * Test connection to Telegram API
   * TODO: Implement when Telegram API is integrated
   */
  async testConnection(): Promise<boolean> {
    this.logger.warn('Telegram API connection test not yet implemented');
    // TODO: Implement Telegram bot/API connection test
    return true; // Return true for now to avoid breaking health checks
  }

  /**
   * Get recent messages from Telegram channel
   * TODO: Implement when Telegram API is integrated
   */
  async getRecentMessages(
    channelName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _maxResults?: number,
  ): Promise<BaseMessage[]> {
    this.logger.log(
      `Getting recent messages from ${channelName} (not implemented)`,
    );

    // TODO: Implement Telegram channel message fetching
    // This should:
    // 1. Connect to Telegram channel
    // 2. Fetch recent messages
    // 3. Filter for Kaspa-related content
    // 4. Convert to BaseMessage format

    this.logger.warn(
      'Telegram message fetching not yet implemented - returning empty array',
    );
    return [];
  }

  /**
   * Search Telegram messages by query
   * TODO: Implement when Telegram API is integrated
   */
  async searchMessages(
    channelName: string,
    query: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _maxResults?: number,
  ): Promise<BaseMessage[]> {
    this.logger.log(
      `Searching messages in ${channelName} with query: ${query} (not implemented)`,
    );

    // TODO: Implement Telegram message search
    // This might be limited by Telegram API capabilities

    this.logger.warn(
      'Telegram message search not yet implemented - returning empty array',
    );
    return [];
  }

  /**
   * Get service status with implementation notes
   */
  async getImplementationStatus(): Promise<{
    isImplemented: boolean;
    features: Record<string, boolean>;
    notes: string[];
  }> {
    return {
      isImplemented: false,
      features: {
        messageRetrieval: false,
        channelConnection: false,
        historicalFetch: false,
        realTimeMonitoring: false,
        messageSearch: false,
      },
      notes: [
        'Telegram indexer service is a stub implementation',
        'Message fetching not yet implemented',
        'Channel configuration not yet implemented',
        'Telegram API integration required',
        'Need to add Telegram-specific message transformations',
      ],
    };
  }

  /**
   * Process any Telegram channel using MTProto (works for all channel types)
   */
  private async processChannelWithMTProto(
    channelConfig: any,
  ): Promise<MessageProcessingResult> {
    const allErrors: string[] = [];
    let totalProcessed = 0;
    const totalEmbedded = 0;
    const totalStored = 0;
    const allMessages: BaseMessage[] = [];

    try {
      this.logger.log(
        `Processing channel ${channelConfig.username || channelConfig.id} with MTProto`,
      );

      // Check if MTProto is ready
      if (!(await this.telegramMTProto.isReady())) {
        throw new Error(
          'MTProto client not ready. Check TELEGRAM_API_ID, TELEGRAM_API_HASH, and authentication.',
        );
      }

      // Try to get channel information first
      let channelIdentifier = channelConfig.username || channelConfig.id;
      if (channelConfig.username && !channelConfig.username.startsWith('@')) {
        channelIdentifier = '@' + channelConfig.username;
      }

      this.logger.log(`Fetching messages from ${channelIdentifier}...`);

      // Fetch main channel messages (not in any topic)
      const mainChannelMessages =
        await this.telegramMTProto.fetchChannelMessages(channelIdentifier, {
          limit: 1000, // Fetch up to 1000 main channel messages
          reverse: true, // Get chronologically (oldest first)
        });

      // Fetch messages from ALL forum topics
      const messagesByTopic = await this.telegramMTProto.fetchAllForumMessages(
        channelIdentifier,
        {
          limit: 1000, // Fetch up to 1000 messages per topic
          reverse: true, // Get chronologically (oldest first)
        },
      );

      // Combine main channel messages + all topic messages
      const topicMessages = Object.values(messagesByTopic).flat();
      const messages = [...mainChannelMessages, ...topicMessages];

      this.logger.log(
        `Found ${messages.length} total messages: ${mainChannelMessages.length} from main channel + ${topicMessages.length} from ${Object.keys(messagesByTopic).length} topics in ${channelIdentifier}`,
      );

      // Convert MTProto messages to BaseMessage format
      const baseMessages = messages.map((msg) =>
        this.convertMTProtoMessageToBase(msg, channelConfig, channelIdentifier),
      );

      if (baseMessages.length > 0) {
        this.logger.log(
          `🔄 Processing ${baseMessages.length} messages from ${channelIdentifier} with embeddings and storage...`,
        );

        // Process messages using the base indexer pipeline (embeddings + Qdrant storage)
        // Set status to SCRAPED so they get processed
        baseMessages.forEach((msg) => {
          msg.processingStatus = TweetProcessingStatus.SCRAPED;
        });

        // Use the protected processAccount method pattern
        const result = await this.processMessages(baseMessages);

        totalProcessed += result.processed;

        if (result.errors.length > 0) {
          allErrors.push(...result.errors);
          this.logger.warn(
            `⚠️ ${result.errors.length} errors during processing of ${channelIdentifier}:`,
            result.errors,
          );
        }

        this.logger.log(
          `✅ Completed processing ${channelIdentifier}: ${result.processed} processed, ${result.embedded} embedded, ${result.stored} stored`,
        );
      } else {
        this.logger.log(`No messages to process from ${channelIdentifier}`);
      }

      allMessages.push(...baseMessages);
    } catch (error) {
      const errorMsg = `Failed to process channel ${channelConfig.username || channelConfig.id} with MTProto: ${error.message}`;
      this.logger.error(errorMsg);
      allErrors.push(errorMsg);
    }

    return {
      success: allErrors.length === 0,
      processed: totalProcessed,
      embedded: totalEmbedded,
      stored: totalStored,
      errors: allErrors,
      messages: allMessages,
    };
  }

  /**
   * Process a forum-type Telegram channel with multiple topics using MTProto
   */
  private async processForumChannel(
    channelId: number,
    channelInfo: TelegramChannel,
  ): Promise<MessageProcessingResult> {
    const allErrors: string[] = [];
    let totalProcessed = 0;
    const totalEmbedded = 0;
    const totalStored = 0;
    const allMessages: BaseMessage[] = [];

    try {
      this.logger.log(
        `Processing forum channel: ${channelInfo.title} using MTProto`,
      );

      // Use MTProto to get all forum messages (much more powerful!)
      const messagesByTopic = await this.telegramMTProto.fetchAllForumMessages(
        channelInfo.username || channelId,
        {
          limit: 1000, // Get up to 1000 messages per topic
          reverse: true, // Get chronologically (oldest first)
        },
      );

      const topicIds = Object.keys(messagesByTopic).map((k) => parseInt(k));
      this.logger.log(
        `Found messages from ${topicIds.length} forum topics in ${channelInfo.title}`,
      );

      // Process messages from each topic
      for (const topicIdStr of Object.keys(messagesByTopic)) {
        const topicId = parseInt(topicIdStr);
        const messages = messagesByTopic[topicId];

        try {
          this.logger.log(
            `Processing ${messages.length} messages from topic ID: ${topicId}`,
          );

          // Convert MTProto messages to TelegramMessage format with proper channel identifier
          const channelIdentifier = channelInfo.username || String(channelId);
          const baseMessages = messages.map((msg) =>
            this.convertMTProtoMessageToBase(
              msg,
              channelInfo,
              channelIdentifier,
              topicId,
            ),
          );

          totalProcessed += baseMessages.length;
          allMessages.push(...baseMessages);

          // TODO: Process and store messages with embeddings
          // For now, we just count them as processed
          this.logger.log(
            `Processed ${baseMessages.length} messages from topic ${topicId}`,
          );
        } catch (error) {
          const errorMsg = `Failed to process forum topic ${topicId}: ${error.message}`;
          this.logger.error(errorMsg);
          allErrors.push(errorMsg);
        }
      }
    } catch (error) {
      const errorMsg = `Failed to process forum channel ${channelInfo.title}: ${error.message}`;
      this.logger.error(errorMsg);
      allErrors.push(errorMsg);
    }

    return {
      success: allErrors.length === 0,
      processed: totalProcessed,
      embedded: totalEmbedded,
      stored: totalStored,
      errors: allErrors,
      messages: allMessages,
    };
  }

  /**
   * Process a regular (non-forum) Telegram channel
   */
  private async processRegularChannel(
    channelId: number,
    channelInfo: TelegramChannel,
  ): Promise<MessageProcessingResult> {
    const allErrors: string[] = [];
    const totalProcessed = 0;
    const totalEmbedded = 0;
    const totalStored = 0;
    const allMessages: BaseMessage[] = [];

    try {
      this.logger.log(`Processing regular channel: ${channelInfo.title}`);

      // Fetch messages from the channel
      const messages = await this.telegramApi.fetchChatMessages(channelId);

      // Note: This method is not used in current implementation
      // We use MTProto for all channel processing now

      this.logger.log(
        `Processed ${messages.length} messages from channel ${channelInfo.title}`,
      );
    } catch (error) {
      const errorMsg = `Failed to process regular channel ${channelInfo.title}: ${error.message}`;
      this.logger.error(errorMsg);
      allErrors.push(errorMsg);
    }

    return {
      success: allErrors.length === 0,
      processed: totalProcessed,
      embedded: totalEmbedded,
      stored: totalStored,
      errors: allErrors,
      messages: allMessages,
    };
  }

  /**
   * Process messages using available methods with Telegram-specific handling
   * Processes in batches of 100 to avoid overwhelming Qdrant with large bulk inserts
   */
  private async processMessages(
    messages: TelegramMessage[], // Changed to TelegramMessage[] to preserve rich metadata
  ): Promise<MessageProcessingResult> {
    const errors: string[] = [];
    let totalEmbedded = 0;
    let totalStored = 0;

    try {
      // Filter messages that need processing
      const messagesToProcess = messages.filter(
        (message) => message.processingStatus === TweetProcessingStatus.SCRAPED,
      );

      if (messagesToProcess.length === 0) {
        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          messages: [],
        };
      }

      // Filter out messages with empty or invalid text for embedding
      const validMessagesForEmbedding = messagesToProcess.filter((message) => {
        const text = message.text?.trim();
        if (!text || text.length === 0) {
          this.logger.warn(`Skipping message ${message.id} - empty text`);
          return false;
        }
        if (text.length > 8000) {
          // OpenAI token limit consideration
          this.logger.warn(
            `Skipping message ${message.id} - text too long (${text.length} chars)`,
          );
          return false;
        }
        return true;
      });

      this.logger.log(
        `Processing ${validMessagesForEmbedding.length}/${messagesToProcess.length} messages with valid text`,
      );

      if (validMessagesForEmbedding.length === 0) {
        this.logger.warn(
          'No messages with valid text for embedding generation',
        );
        return {
          success: true,
          processed: messagesToProcess.length,
          embedded: 0,
          stored: 0,
          errors: ['No messages with valid text for embedding'],
          messages: messagesToProcess,
        };
      }

      // Process messages in batches of 100 to avoid overwhelming Qdrant
      const BATCH_SIZE = 100;
      const batches = this.createMessageBatches(
        validMessagesForEmbedding,
        BATCH_SIZE,
      );

      this.logger.log(
        `Processing ${batches.length} batches of ${BATCH_SIZE} messages each`,
      );

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];

        try {
          this.logger.log(
            `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} messages)`,
          );

          // Generate embeddings for this batch
          const texts = batch.map((message) => message.text);

          // Log first few texts for debugging (only for first batch)
          if (batchIndex === 0) {
            this.logger.debug(
              'Sample texts for embedding:',
              texts.slice(0, 3).map((t) => `"${t.substring(0, 100)}..."`),
            );
          }

          const embeddingResponse =
            await this.embeddingService.generateEmbeddings({
              texts,
              model: this.etlConfig.getEmbeddingConfig().model,
              batchId: `telegram_batch_${batchIndex}_${Date.now()}`,
            });

          if (!embeddingResponse.success || !embeddingResponse.embeddings) {
            throw new Error(
              `Embedding generation failed for batch ${batchIndex + 1}: ${embeddingResponse.errors?.join(', ')}`,
            );
          }

          const batchEmbedded = embeddingResponse.embeddings.length;
          totalEmbedded += batchEmbedded;

          // Prepare vectors for storage with full TelegramMessage metadata
          const vectorBatch = batch.map((message, index) => {
            const embedding = embeddingResponse.embeddings[index];
            if (!embedding) {
              throw new Error(`No embedding found for message ${message.id}`);
            }

            // Debug: Log the first message's actual fields to see what we have
            if (batchIndex === 0 && index === 0) {
              this.logger.debug(
                'Raw TelegramMessage fields:',
                Object.keys(message),
              );
              this.logger.debug('Sample Telegram field values:', {
                telegramChannelTitle: message.telegramChannelTitle,
                telegramChannelUsername: message.telegramChannelUsername,
                telegramChannelId: message.telegramChannelId,
                telegramMessageType: message.telegramMessageType,
                telegramViews: message.telegramViews,
                telegramIsForwarded: message.telegramIsForwarded,
                telegramAuthorName: message.telegramAuthorName,
              });
            }

            // Use the TelegramMessage directly (following Single Transformation Principle)
            const telegramMetadata = message;

            // Log the first message's metadata to verify rich fields are included (only for first batch)
            if (batchIndex === 0 && index === 0) {
              this.logger.debug(
                'Sample Telegram metadata fields:',
                Object.keys(telegramMetadata),
              );
              this.logger.debug('Sample metadata values:', {
                telegramChannelTitle: telegramMetadata.telegramChannelTitle,
                telegramChannelUsername:
                  telegramMetadata.telegramChannelUsername,
                telegramChannelId: telegramMetadata.telegramChannelId,
                telegramMessageType: telegramMetadata.telegramMessageType,
                telegramViews: telegramMetadata.telegramViews,
                telegramIsForwarded: telegramMetadata.telegramIsForwarded,
                telegramAuthorName: telegramMetadata.telegramAuthorName,
              });
            }

            return {
              tweetId: message.id,
              vector: embedding.vector,
              metadata: telegramMetadata, // This should now include all Telegram fields
            };
          });

          // Store this batch in Qdrant using the Telegram-specific method
          const result = await this.qdrantRepository.storeTelegramVectorsBatch(
            vectorBatch,
            this.config.collectionName,
          );

          const batchStored = result.stored;
          totalStored += batchStored;

          if (result.errors.length > 0) {
            errors.push(
              ...result.errors.map(
                (error) => `Batch ${batchIndex + 1}: ${error}`,
              ),
            );
          }

          this.logger.log(
            `Batch ${batchIndex + 1}/${batches.length} completed: ${batchEmbedded} embedded, ${batchStored} stored`,
          );
        } catch (error) {
          const errorMsg = `Batch ${batchIndex + 1} processing failed: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logger.log(
        `All batches completed: ${totalEmbedded} total embedded, ${totalStored} total stored`,
      );

      return {
        success: errors.length === 0,
        processed: messagesToProcess.length,
        embedded: totalEmbedded,
        stored: totalStored,
        errors,
        messages: messagesToProcess,
      };
    } catch (error) {
      const errorMsg = `Failed to process messages: ${error.message}`;
      this.logger.error(errorMsg);
      errors.push(errorMsg);

      return {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors,
        messages: [],
      };
    }
  }

  /**
   * Create message batches for processing
   */
  private createMessageBatches<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Convert MTProto message to TelegramMessage format with pure data only
   */
  private convertMTProtoMessageToBase(
    mtprotoMessage: TelegramMTProtoMessage,
    channelConfig: any,
    channelIdentifier: string,
    topicId?: number,
  ): TelegramMessage {
    const messageText = mtprotoMessage.message || '';

    // Extract pure channel information (only what exists)
    const channelTitle = channelConfig.title;
    const channelUsername = channelConfig.username;
    const channelId = channelConfig.id;

    // Extract pure message author information (only what exists)
    const messageAuthorName = mtprotoMessage.postAuthor;
    const messageAuthorId = mtprotoMessage.fromId;

    // For BaseMessage compatibility - use what's available
    const baseAuthor = messageAuthorName || channelTitle || channelIdentifier;
    const baseAuthorHandle = channelUsername || channelIdentifier;

    // Create topic-aware authorHandle for proper incremental processing
    // Main channel: "kasparnd", Topic messages: "kasparnd:topic:123"
    const topicAwareAuthorHandle = topicId
      ? `${baseAuthorHandle}:topic:${topicId}`
      : baseAuthorHandle;

    // Build message URL
    const url = channelUsername
      ? `https://t.me/${channelUsername.replace('@', '')}/${mtprotoMessage.id}`
      : channelId
        ? `https://t.me/c/${Math.abs(Number(channelId))}/${mtprotoMessage.id}`
        : `https://t.me/${channelIdentifier}/${mtprotoMessage.id}`;

    // Create TelegramMessage with pure data only
    return {
      // BaseMessage fields (required)
      id: `tg_mtproto_${channelId || channelIdentifier}_${mtprotoMessage.id}`,
      text: messageText,
      author: baseAuthor,
      authorHandle: topicAwareAuthorHandle,
      createdAt: new Date(mtprotoMessage.date * 1000),
      url: url,
      source: channelTitle || channelIdentifier,
      processingStatus: TweetProcessingStatus.SCRAPED,
      processedAt: new Date(),
      kaspaRelated: false,
      kaspaTopics: [],
      hashtags: [],
      mentions: [],
      links: [],
      language: 'unknown', // TODO: Detect from message
      errors: [],
      retryCount: 0,

      // Channel/Group Information (pure data only)
      telegramChannelTitle: channelTitle,
      telegramChannelUsername: channelUsername,
      telegramChannelId: channelId,

      // Topic Information (pure data only)
      telegramTopicId: topicId,
      telegramTopicTitle: undefined, // We don't have topic titles from MTProto

      // Message Author Information (pure data only)
      telegramAuthorName: messageAuthorName,
      telegramAuthorUsername: undefined, // MTProto doesn't provide this
      telegramAuthorId: messageAuthorId,
      telegramIsAuthorChannel: !messageAuthorName, // Channel post if no author

      // Message Metadata (pure data only)
      telegramMessageType: this.determineTelegramMessageType(messageText),
      telegramMessageId: mtprotoMessage.id,
      telegramIsForwarded: this.isForwardedMessage(messageText),
      telegramForwardedFrom: this.extractForwardedFrom(messageText),
      telegramHasMedia: this.hasMediaContent(messageText),
      telegramViews: mtprotoMessage.views,
      telegramEditDate: mtprotoMessage.editDate
        ? new Date(mtprotoMessage.editDate * 1000)
        : undefined,
      telegramReplyToMessageId: mtprotoMessage.replyTo?.replyToMsgId,
    };
  }

  /**
   * Determine Telegram message type from content
   */
  private determineTelegramMessageType(text: string): TelegramMessageType {
    if (this.isForwardedMessage(text)) return TelegramMessageType.FORWARDED;
    if (this.hasMediaContent(text)) return TelegramMessageType.MEDIA;
    if (this.isReplyMessage(text)) return TelegramMessageType.REPLY;
    if (this.isChannelPost(text)) return TelegramMessageType.CHANNEL_POST;
    return TelegramMessageType.TEXT;
  }

  /**
   * Check if message is forwarded
   */
  private isForwardedMessage(text: string): boolean {
    return text.includes('Forwarded from') || text.includes('Forwarded');
  }

  /**
   * Check if message has media content
   */
  private hasMediaContent(text: string): boolean {
    const mediaIndicators = [
      '[Photo]',
      '[Video]',
      '[Document]',
      '[Audio]',
      '[Sticker]',
    ];
    return mediaIndicators.some((indicator) => text.includes(indicator));
  }

  /**
   * Check if message is a reply
   */
  private isReplyMessage(text: string): boolean {
    return text.includes('Reply to') || text.startsWith('>');
  }

  /**
   * Check if message is a channel post
   */
  private isChannelPost(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _text: string,
  ): boolean {
    // Channel posts typically don't have specific indicators in text
    // This would need to be determined from Telegram API metadata
    return false; // TODO: Implement when API is available
  }

  /**
   * Extract forwarded from information
   */
  private extractForwardedFrom(text: string): string | undefined {
    const forwardMatch = text.match(/Forwarded from (.+)/);
    return forwardMatch ? forwardMatch[1].trim() : undefined;
  }
}
