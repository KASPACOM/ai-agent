/**
 * Telegram API Models for Indexer
 *
 * Local copy of telegram models to eliminate ETL dependency.
 * Contains only the models needed for telegram indexing operations.
 */

/**
 * Parameters for fetching messages from Telegram channels
 * Used with client.getMessages() API call
 */
export interface TelegramMessageFetchParameters {
  limit?: number;
  offsetId?: number;
  offsetDate?: number; // Unix timestamp
  addOffset?: number;
  maxId?: number;
  minId?: number;
  reverse?: boolean;
  replyTo?: number; // For forum topics only
}

/**
 * Telegram MTProto Message Interface
 *
 * Represents a message retrieved via MTProto API
 */
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

/**
 * Telegram Forum Topic Information
 */
export interface TelegramForumTopicInfo {
  id: number;
  title: string;
  iconColor?: number;
  iconEmojiId?: string;
  closed?: boolean;
  hidden?: boolean;
}

/**
 * Options for fetching channel messages
 */
export interface TelegramChannelMessageOptions {
  topicId?: number;
  limit?: number;
  offsetId?: number;
  offsetDate?: Date;
  addOffset?: number;
  maxId?: number;
  minId?: number;
  reverse?: boolean;
}

/**
 * Options for fetching forum messages
 */
export interface TelegramForumMessageOptions {
  limit?: number;
  offsetDate?: Date;
  reverse?: boolean;
}
