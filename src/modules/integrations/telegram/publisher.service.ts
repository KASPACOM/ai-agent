import { Injectable } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { AppConfigService } from '../../core/modules/config/app-config.service';

@Injectable()
export class TelegramPublisherService {
  private bot: Telegraf;

  constructor(private readonly configService: AppConfigService) {
    this.bot = new Telegraf(this.configService.getTelegramBotToken);
  }

  /**
   * Send a text message to a Telegram chat
   */
  async sendMessage(chatId: string, text: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, text);
    } catch (error) {
      console.error(`Failed to send message to ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Send a text message to the configured channel
   */
  async sendChannelMessage(text: string): Promise<void> {
    const channelId = this.configService.getTelegramChannelId;
    try {
      await this.bot.telegram.sendMessage(channelId, text);
    } catch (error) {
      console.error(`Failed to send message to channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Send a typing indicator to a chat
   */
  async sendTypingAction(chatId: string): Promise<void> {
    try {
      await this.bot.telegram.sendChatAction(chatId, 'typing');
    } catch (error) {
      console.error(`Failed to send typing action to ${chatId}:`, error);
    }
  }

  /**
   * Edit a previously sent message
   */
  async editMessage(
    chatId: string,
    messageId: number,
    newText: string,
  ): Promise<void> {
    try {
      await this.bot.telegram.editMessageText(
        chatId,
        messageId,
        undefined,
        newText,
      );
    } catch (error) {
      console.error(
        `Failed to edit message ${messageId} in chat ${chatId}:`,
        error,
      );
      throw error;
    }
  }
}
