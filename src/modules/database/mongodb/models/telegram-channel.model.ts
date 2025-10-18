/**
 * Telegram Channel Model
 *
 * Represents Telegram channel indexing history and metadata.
 * Following DEVELOPMENT_RULES.md: Predefined interfaces, no any types.
 */
export interface TelegramChannel {
  id: string; // channelName_topicId
  channelName: string;
  channelId: string;
  channelTitle: string | null;
  topicId: number | null;
  topicTitle: string | null;
  messagesIndexed: number;
  latestMessageDate: Date;
  latestMessageId: number;
  earliestMessageDate: Date | null;
  earliestMessageId: number | null;
  isComplete: boolean;
  lastIndexedAt: Date;
  indexingErrors: string[];
  consecutiveErrors: number;
  createdAt: Date;
  updatedAt: Date;
}

