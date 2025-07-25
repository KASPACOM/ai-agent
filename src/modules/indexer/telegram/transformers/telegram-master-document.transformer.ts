import {
  MasterDocument,
  ProcessingStatus,
  TelegramMessageType,
} from '../../shared/models/master-document.model';
import { MessageSource } from '../../shared/models/message-source.enum';
import { TelegramChannelConfig } from '../models/telegram-history.model';

/**
 * Telegram Master Document Transformer
 *
 * Static helper methods for transforming Telegram API responses to MasterDocument format.
 * Moved from TelegramIndexerService to follow proper separation of concerns.
 *
 * ✅ Static methods only - no dependencies, pure transformations
 */
export class TelegramMasterDocumentTransformer {
  /**
   * Transform Telegram API response directly to MasterDocument format
   */
  static transformTelegramApiResponseToMasterDocument(
    telegramMsg: any,
    channel: TelegramChannelConfig,
    topicTitle?: string,
  ): MasterDocument {
    const now = new Date().toISOString();
    const text = telegramMsg.text || telegramMsg.message || '';

    return {
      id: `telegram_${telegramMsg.id}_${channel.username}`,
      source: MessageSource.TELEGRAM,
      text,
      author: telegramMsg.from_id?.user_id || channel.title || channel.username,
      authorHandle: channel.username,
      createdAt: telegramMsg.date
        ? new Date(telegramMsg.date * 1000).toISOString()
        : now,
      url: `https://t.me/${channel.username}/${telegramMsg.id}`,
      processingStatus: ProcessingStatus.PROCESSED,
      processedAt: now,
      kaspaRelated: this.analyzeKaspaContent(text),
      kaspaTopics: this.extractKaspaTopics(text),
      hashtags: this.extractHashtags(text),
      mentions: this.extractMentions(text),
      links: this.extractLinks(text),
      language: 'unknown',
      errors: [],
      retryCount: 0,

      // Telegram-specific fields
      telegramChannelTitle: channel.title,
      telegramTopicId: telegramMsg.topic_id,
      telegramTopicTitle: topicTitle, // ✅ Now capturing topic title
      telegramMessageType: this.determineTelegramMessageType(telegramMsg),

      // Fields that will be populated during storage
      vector: undefined,
      vectorDimensions: undefined,
      embeddedAt: undefined,
      storedAt: undefined,
    };
  }

  /**
   * Analyze if text content is Kaspa-related
   */
  static analyzeKaspaContent(text: string): boolean {
    const kaspaKeywords = ['kaspa', '$kas', 'blockdag', 'pow'];
    return kaspaKeywords.some((keyword) =>
      text.toLowerCase().includes(keyword),
    );
  }

  /**
   * Extract Kaspa-specific topics from text
   */
  static extractKaspaTopics(text: string): string[] {
    const topics: string[] = [];
    if (text.toLowerCase().includes('mining')) topics.push('mining');
    if (text.toLowerCase().includes('price')) topics.push('price');
    if (text.toLowerCase().includes('development')) topics.push('development');
    if (text.toLowerCase().includes('wallet')) topics.push('wallet');
    if (text.toLowerCase().includes('exchange')) topics.push('exchange');
    return topics;
  }

  /**
   * Extract hashtags from text
   */
  static extractHashtags(text: string): string[] {
    const hashtagRegex = /#[\w]+/g;
    return text.match(hashtagRegex) || [];
  }

  /**
   * Extract mentions from text
   */
  static extractMentions(text: string): string[] {
    const mentionRegex = /@[\w]+/g;
    return text.match(mentionRegex) || [];
  }

  /**
   * Extract links from text
   */
  static extractLinks(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/g;
    return text.match(urlRegex) || [];
  }

  /**
   * Determine Telegram message type based on message properties
   */
  static determineTelegramMessageType(message: any): TelegramMessageType {
    if (message.media) {
      return TelegramMessageType.MEDIA;
    }
    if (message.replyTo) {
      return TelegramMessageType.REPLY;
    }
    if (message.forwardedFrom) {
      return TelegramMessageType.FORWARDED;
    }
    if (message.post) {
      return TelegramMessageType.CHANNEL_POST;
    }
    return TelegramMessageType.TEXT;
  }
}
