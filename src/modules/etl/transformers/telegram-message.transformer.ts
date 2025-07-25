import { BaseMessageTransformer } from './base-message.transformer';
import { BaseMessage } from '../models/base-indexer.model';
import { TelegramMessage, TelegramMessageType } from '../models/telegram.model';
import { TweetProcessingStatus, TweetSource } from '../models/etl.enums';

/**
 * Telegram Message Transformer
 *
 * Handles Telegram-specific message transformations
 * Extends base transformer functionality with proper typing
 */
export class TelegramMessageTransformer extends BaseMessageTransformer {
  /**
   * Transform Telegram message for Qdrant storage with proper typing
   */
  public static transformMessageForStorage(message: TelegramMessage): any {
    const baseMetadata = this.createBaseStorageMetadata(message);

    // Add Telegram-specific metadata with properly separated fields
    return {
      ...baseMetadata,

      // Core message identification
      originalMessageId: message.id,
      telegramMessageId: message.telegramMessageId,

      // Channel/Group Information (clearly separated)
      channelTitle: message.telegramChannelTitle,
      channelUsername: message.telegramChannelUsername,
      channelId: message.telegramChannelId,

      // Topic Information (for forum-style groups)
      topicId: message.telegramTopicId,
      topicTitle: message.telegramTopicTitle,

      // Message Author Information (clearly separated)
      messageAuthorName: message.telegramAuthorName,
      messageAuthorUsername: message.telegramAuthorUsername,
      messageAuthorId: message.telegramAuthorId,
      isAuthorChannel: message.telegramIsAuthorChannel,

      // Message Metadata (telegram-specific)
      messageType:
        message.telegramMessageType || this.determineMessageType(message.text),
      isForwarded:
        message.telegramIsForwarded ?? this.isForwardedMessage(message.text),
      forwardedFrom:
        message.telegramForwardedFrom ||
        this.extractForwardedFrom(message.text),
      hasMedia: message.telegramHasMedia ?? this.hasMediaContent(message.text),
      views: message.telegramViews || 0,
      editDate: message.telegramEditDate
        ? message.telegramEditDate.toISOString()
        : undefined,
      replyToMessageId: message.telegramReplyToMessageId,

      // Processing metadata (override base source)
      source: 'telegram',
    };
  }

  /**
   * Create a BaseMessage from raw Telegram data
   * TODO: Implement when Telegram API is integrated
   */
  public static createFromRawTelegramData(
    telegramData: any,
    channelInfo?: any,
  ): BaseMessage {
    const now = new Date();
    const text = this.normalizeText(
      telegramData.text || telegramData.message || '',
    );
    const kaspaAnalysis = this.analyzeKaspaContent(text);

    return {
      id: telegramData.id || `telegram_${now.getTime()}`,
      text,
      author:
        channelInfo?.title || telegramData.chat?.title || 'Unknown Channel',
      authorHandle:
        channelInfo?.username || telegramData.chat?.username || 'unknown',
      createdAt: new Date(telegramData.date * 1000 || now), // Telegram uses Unix timestamp
      url: this.buildTelegramUrl(
        channelInfo?.username || telegramData.chat?.username,
        telegramData.id,
      ),
      source: TweetSource.API, // TODO: Add TELEGRAM source to enum
      processingStatus: TweetProcessingStatus.SCRAPED,
      processedAt: now,
      kaspaRelated: kaspaAnalysis.isKaspaRelated,
      kaspaTopics: kaspaAnalysis.kaspaTopics,
      hashtags: this.extractHashtags(text),
      mentions: this.extractMentions(text),
      links: this.extractLinks(text),
      language: this.detectLanguage(text),
      errors: [],
      retryCount: 0,
    };
  }

  /**
   * Create a sample Telegram message for testing
   * TODO: Remove when actual implementation is added
   */
  public static createSampleMessage(channelName: string): BaseMessage {
    const now = new Date();
    const sampleText = 'Sample Telegram message for testing purposes';
    const kaspaAnalysis = this.analyzeKaspaContent(sampleText);

    return {
      id: `telegram_${now.getTime()}`,
      text: sampleText,
      author: channelName,
      authorHandle: channelName,
      createdAt: now,
      url: this.buildTelegramUrl(channelName),
      source: TweetSource.API, // TODO: Add TELEGRAM source to enum
      processingStatus: TweetProcessingStatus.SCRAPED,
      processedAt: now,
      kaspaRelated: kaspaAnalysis.isKaspaRelated,
      kaspaTopics: kaspaAnalysis.kaspaTopics,
      hashtags: this.extractHashtags(sampleText),
      mentions: this.extractMentions(sampleText),
      links: this.extractLinks(sampleText),
      language: this.detectLanguage(sampleText),
      errors: [],
      retryCount: 0,
    };
  }

  /**
   * Build Telegram URL for a message
   */
  public static buildTelegramUrl(
    channelUsername?: string,
    messageId?: string,
  ): string {
    if (!channelUsername) {
      return 'https://t.me/unknown';
    }

    const cleanUsername = channelUsername.startsWith('@')
      ? channelUsername.slice(1)
      : channelUsername;

    if (messageId) {
      return `https://t.me/${cleanUsername}/${messageId}`;
    }

    return `https://t.me/${cleanUsername}`;
  }

  /**
   * Determine message type based on content using enum
   */
  public static determineMessageType(text: string): TelegramMessageType {
    if (this.isForwardedMessage(text)) return TelegramMessageType.FORWARDED;
    if (this.hasMediaContent(text)) return TelegramMessageType.MEDIA;
    if (this.isReplyMessage(text)) return TelegramMessageType.REPLY;
    if (this.isChannelPost(text)) return TelegramMessageType.CHANNEL_POST;
    return TelegramMessageType.TEXT;
  }

  /**
   * Check if message is forwarded
   */
  public static isForwardedMessage(text: string): boolean {
    return text.includes('Forwarded from') || text.includes('Forwarded');
  }

  /**
   * Check if message has media content
   */
  public static hasMediaContent(text: string): boolean {
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
  public static isReplyMessage(text: string): boolean {
    return text.includes('Reply to') || text.startsWith('>');
  }

  /**
   * Check if message is a channel post
   */
  public static isChannelPost(
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
  public static extractForwardedFrom(text: string): string | null {
    const forwardMatch = text.match(/Forwarded from (.+)/);
    return forwardMatch ? forwardMatch[1].trim() : null;
  }

  /**
   * Extract Telegram-specific engagement metrics
   * TODO: Implement when Telegram API is available
   */
  public static extractEngagementMetrics(telegramData: any): {
    views: number;
    reactions: any[];
    forwards: number;
  } {
    return {
      views: telegramData.views || 0,
      reactions: telegramData.reactions || [],
      forwards: telegramData.forwards || 0,
    };
  }

  /**
   * Validate Telegram-specific message data
   */
  public static validateTelegramMessage(message: BaseMessage): string[] {
    const baseErrors = this.validateBaseMessage(message);
    const telegramErrors: string[] = [];

    // Telegram-specific validations
    if (!message.authorHandle.match(/^[a-zA-Z0-9_]{5,32}$/)) {
      telegramErrors.push('Invalid Telegram username format');
    }

    // Telegram messages can be much longer than tweets
    if (message.text.length > 4096) {
      telegramErrors.push('Telegram message text exceeds 4096 characters');
    }

    return [...baseErrors, ...telegramErrors];
  }

  /**
   * Clean Telegram-specific text artifacts
   */
  public static cleanTelegramText(text: string): string {
    return this.normalizeText(text)
      .replace(/\[Photo\]/g, '') // Remove media placeholders
      .replace(/\[Video\]/g, '')
      .replace(/\[Document\]/g, '')
      .replace(/\[Audio\]/g, '')
      .replace(/\[Sticker\]/g, '')
      .replace(/Forwarded from .+\n/g, '') // Remove forwarded headers
      .trim();
  }

  /**
   * Get implementation status for Telegram transformer
   */
  public static getImplementationStatus(): {
    isImplemented: boolean;
    features: Record<string, boolean>;
    notes: string[];
  } {
    return {
      isImplemented: false,
      features: {
        messageTransformation: true,
        mediaHandling: false,
        forwardedMessages: true,
        reactions: false,
        channelMetadata: false,
        userInformation: false,
      },
      notes: [
        'Basic text transformation implemented',
        'Media handling not yet implemented',
        'Forwarded message detection basic implementation',
        'Reaction handling requires Telegram API',
        'Channel metadata handling requires API integration',
        'Need to add TELEGRAM source to TweetSource enum',
      ],
    };
  }
}
