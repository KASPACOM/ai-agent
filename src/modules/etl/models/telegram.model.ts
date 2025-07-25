import { BaseMessage } from './base-indexer.model';

/**
 * Telegram message types enum
 */
export enum TelegramMessageType {
  TEXT = 'text',
  MEDIA = 'media',
  FORWARDED = 'forwarded',
  REPLY = 'reply',
  CHANNEL_POST = 'channel_post',
}

/**
 * Telegram ETL Models
 *
 * Defines interfaces and types for Telegram message processing and ETL operations
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

/**
 * Telegram-specific message interface that extends BaseMessage
 * Includes telegram-specific metadata for type-safe access
 * Properly separates channel info from message author info
 */
export interface TelegramMessage extends BaseMessage {
  // Channel/Group Information
  telegramChannelTitle?: string; // Display name of channel/group
  telegramChannelUsername?: string; // @username of channel/group
  telegramChannelId?: string | number; // Numeric ID of channel/group

  // Topic Information (for forum-style groups)
  telegramTopicId?: number;
  telegramTopicTitle?: string;

  // Message Author Information (person who posted the message)
  telegramAuthorName?: string; // Display name of message author
  telegramAuthorUsername?: string; // @username of message author
  telegramAuthorId?: string | number; // User ID of message author
  telegramIsAuthorChannel?: boolean; // True if posted by channel itself

  // Message Metadata
  telegramMessageType?: TelegramMessageType;
  telegramMessageId?: number; // Original Telegram message ID
  telegramIsForwarded?: boolean;
  telegramForwardedFrom?: string;
  telegramHasMedia?: boolean;
  telegramViews?: number;
  telegramReactions?: any[];
  telegramEditDate?: Date;
  telegramReplyToMessageId?: number; // ID of message this replies to

  // Computed boolean fields for efficient querying
  hasLinks?: boolean; // True if message contains links
}
