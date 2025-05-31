import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import TelegramBot = require('node-telegram-bot-api');
import { AppConfigService } from '../../core/modules/config/app-config.service';
import { InputEvent } from '../../orchestrator/models/message.model';
import { Subject, Observable } from 'rxjs';

@Injectable()
export class TelegramSubscriberService
  implements OnModuleInit, OnModuleDestroy
{
  private bot: TelegramBot;
  private messageSubject = new Subject<InputEvent>();

  constructor(private readonly configService: AppConfigService) {
    console.log(
      'Initializing Telegram listener with token:',
      this.configService.getTelegramBotToken ? 'Token exists' : 'No token',
    );

    // Create bot with polling enabled and channel message support
    this.bot = new TelegramBot(this.configService.getTelegramBotToken, {
      polling: true,
      filepath: false,
    });

    console.log('Telegram listener instance created');
    this.setupHandlers();
    console.log('Message handlers setup complete');
  }

  onModuleInit() {
    console.log('Module init - starting message listener');
    this.startListener().catch((error) => {
      console.error('Critical error during listener startup:', error);
    });
  }

  onModuleDestroy() {
    this.stopListener();
    this.messageSubject.complete();
  }

  getMessages(): Observable<InputEvent> {
    return this.messageSubject.asObservable();
  }

  private setupHandlers() {
    console.log('Setting up message handlers');
    const channelId = this.configService.getTelegramChannelId;
    console.log('Configured channel ID:', channelId);

    // Handle channel posts
    this.bot.on('channel_post', (msg) => {
      // Only process messages from our configured channel
      if (msg.chat.id.toString() !== channelId) {
        return;
      }

      if (!msg.text) {
        console.log('Ignoring non-text message');
        return;
      }

      console.log('Processing channel message:', {
        chatId: msg.chat.id,
        chatTitle: msg.chat.title,
        messageId: msg.message_id,
        text: msg.text,
      });

      try {
        // Convert Telegram message to InputEvent
        const inputEvent: InputEvent = {
          chatId: msg.chat.id.toString(),
          content: msg.text,
          userId: 'channel',
          timestamp: new Date(msg.date * 1000),
          metadata: {
            platform: 'telegram',
            messageId: msg.message_id,
            isChannel: true,
            channelTitle: msg.chat.title,
          },
        };

        // Forward the message to the Agent
        this.messageSubject.next(inputEvent);
        console.log('Channel message forwarded to Agent');
      } catch (error) {
        console.error('Error processing channel message:', error);
      }
    });

    // Handle edited channel posts
    this.bot.on('edited_channel_post', (msg) => {
      // Only process messages from our configured channel
      if (msg.chat.id.toString() !== channelId) {
        return;
      }

      if (!msg.text) {
        console.log('Ignoring non-text edited message');
        return;
      }

      console.log('Processing edited channel message:', {
        chatId: msg.chat.id,
        chatTitle: msg.chat.title,
        messageId: msg.message_id,
        text: msg.text,
      });

      try {
        // Convert Telegram message to InputEvent
        const inputEvent: InputEvent = {
          chatId: msg.chat.id.toString(),
          content: msg.text,
          userId: 'channel',
          timestamp: new Date(msg.edit_date * 1000),
          metadata: {
            platform: 'telegram',
            messageId: msg.message_id,
            isChannel: true,
            channelTitle: msg.chat.title,
            isEdited: true,
          },
        };

        // Forward the message to the Agent
        this.messageSubject.next(inputEvent);
        console.log('Edited channel message forwarded to Agent');
      } catch (error) {
        console.error('Error processing edited channel message:', error);
      }
    });

    console.log('Message handlers setup complete');
  }

  private async startListener() {
    try {
      console.log('Starting Telegram message listener...');
      console.log('Listener instance:', this.bot ? 'exists' : 'null');

      // Verify connection
      try {
        console.log('Testing connection...');
        const botInfo = await this.bot.getMe();
        console.log('Connection verified for bot:', botInfo.username);
      } catch (error) {
        console.error('Failed to verify connection:', error);
        throw new Error(`Connection verification failed: ${error.message}`);
      }

      console.log('Telegram message listener started successfully');
    } catch (error) {
      console.error('Failed to start message listener:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  async stopListener() {
    try {
      console.log('Stopping Telegram message listener...');
      await this.bot.stopPolling();
      console.log('Telegram message listener stopped successfully');
    } catch (error) {
      console.error('Error stopping message listener:', error);
    }
  }
}
