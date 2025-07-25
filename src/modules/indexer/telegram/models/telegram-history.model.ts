/**
 * Telegram History Order By Enum
 */
export enum TelegramHistoryOrderBy {
  UPDATED_AT = 'updatedAt',
  LATEST_MESSAGE_DATE = 'latestMessageDate',
  MESSAGES_INDEXED = 'messagesIndexed',
}

/**
 * Order Direction Enum
 */
export enum OrderDirection {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Telegram Indexing History Model
 *
 * Tracks indexing progress for telegram channels and forum topics.
 * Similar to account_status for Twitter, but handles telegram's channel + topic structure.
 *
 * Key features:
 * - Tracks both main channel messages and individual forum topics
 * - Stores pagination information for proper incremental updates
 * - Handles topic-specific progress tracking
 */
export interface TelegramIndexingHistory {
  id: string; // Generated: `${channelName}_${topicId || 'main'}`

  // Channel Information
  channelName: string; // Channel username (without @)
  channelId: string; // Numeric channel ID
  channelTitle?: string; // Display name of channel

  // Topic Information (null for main channel)
  topicId?: number; // Forum topic ID (null for main channel messages)
  topicTitle?: string; // Topic title (null for main channel)

  // Indexing Progress
  messagesIndexed: number; // Total messages indexed from this channel/topic
  latestMessageDate: string; // ISO string of most recent message indexed
  latestMessageId: number; // Telegram message ID of most recent message
  earliestMessageDate?: string; // ISO string of oldest message indexed (for historical processing)
  earliestMessageId?: number; // Telegram message ID of oldest message

  // Processing Status
  isComplete: boolean; // Whether this channel/topic is fully synced
  lastIndexedAt: string; // ISO string of last indexing run
  indexingErrors: string[]; // Recent errors for this channel/topic
  consecutiveErrors: number; // Count of consecutive errors (for circuit breaking)

  // Metadata
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

/**
 * Telegram History Update Options
 *
 * Options for updating telegram indexing history after processing
 */
export interface TelegramHistoryUpdate {
  messagesIndexed?: number; // Increment by this amount
  latestMessageDate?: string;
  latestMessageId?: number;
  earliestMessageDate?: string;
  earliestMessageId?: number;
  isComplete?: boolean;
  errors?: string[]; // New errors to add
  clearErrors?: boolean; // Clear existing errors
}

/**
 * Telegram Channel Configuration
 *
 * Configuration for telegram channels to be indexed
 */
export interface TelegramChannelConfig {
  username: string; // Channel username (without @)
  id?: string; // Optional numeric ID
  title?: string; // Optional display name
  includeTopics: boolean; // Whether to index forum topics
  maxTopics?: number; // Max number of topics to index (0 = all)
  excludeTopicIds?: number[]; // Topic IDs to exclude
}

/**
 * Telegram History Query Options
 *
 * Options for querying telegram indexing history
 */
export interface TelegramHistoryQueryOptions {
  channelName?: string;
  topicId?: number;
  isComplete?: boolean;
  hasErrors?: boolean;
  orderBy?: TelegramHistoryOrderBy; // ✅ Now using enum
  orderDirection?: OrderDirection; // ✅ Now using enum
  limit?: number;
  offset?: number;
}

/**
 * Telegram History Summary
 *
 * Summary statistics for telegram indexing
 */
export interface TelegramHistorySummary {
  totalChannels: number;
  totalTopics: number;
  totalMessages: number;
  completedChannels: number;
  completedTopics: number;
  channelsWithErrors: number;
  topicsWithErrors: number;
  lastUpdate: string; // ISO string
}
