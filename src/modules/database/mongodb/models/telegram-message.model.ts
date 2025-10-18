/**
 * Telegram Message Model
 *
 * Represents a raw message fetched from Telegram API.
 * Following DEVELOPMENT_RULES.md: Predefined interfaces, no any types.
 */
export interface TelegramMessage {
  messageId: number;
  channelId: string;
  channelUsername: string;
  topicId: number | null;
  date: Date;
  payload: Record<string, unknown>;
  fetchedAt: Date;
  vectorGeneratedAt?: Date;
}

