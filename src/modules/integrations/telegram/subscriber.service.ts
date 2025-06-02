import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import TelegramBot = require('node-telegram-bot-api');
import { AppConfigService } from '../../core/modules/config/app-config.service';
import { OrchestratorService } from '../../orchestrator/orchestrator.service';
import { TelegramPublisherService } from './publisher.service';

@Injectable()
export class TelegramSubscriberService
  implements OnModuleInit, OnModuleDestroy
{
  private bot: TelegramBot;

  constructor(
    private readonly configService: AppConfigService,
    private readonly orchestrator: OrchestratorService,
    private readonly telegramPublisher: TelegramPublisherService,
  ) {
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
  }

  private setupHandlers() {
    console.log('Setting up message handlers');
    const channelId = this.configService.getTelegramChannelId;
    console.log('Configured channel ID:', channelId);

    // Handle channel posts
    this.bot.on('channel_post', async (msg) => {
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
        // Process message directly through orchestrator
        console.log('Forwarding message to orchestrator...');

        const orchestratorResponse = await this.orchestrator.processMessage(
          'channel', // userId
          msg.text, // message content
          {
            platform: 'telegram',
            messageId: msg.message_id,
            isChannel: true,
            channelTitle: msg.chat.title,
            chatId: msg.chat.id.toString(),
          },
        );

        console.log(
          `Orchestrator response: "${orchestratorResponse.response.substring(0, 100)}..."`,
        );

        // Send response back to Telegram
        await this.telegramPublisher.sendMessage(
          msg.chat.id.toString(),
          orchestratorResponse.response,
        );

        console.log('Response sent back to Telegram');

        // Log action summary if available
        if (
          orchestratorResponse.actions &&
          orchestratorResponse.actions.length > 0
        ) {
          const agentsUsed = [
            ...new Set(orchestratorResponse.actions.map((a) => a.agent)),
          ];
          console.log(
            `Actions executed: ${orchestratorResponse.actions.length}, Agents used: ${agentsUsed.join(', ')}`,
          );
        }
      } catch (error) {
        console.error('Error processing channel message:', error);

        // Send error response to user
        try {
          await this.telegramPublisher.sendMessage(
            msg.chat.id.toString(),
            'I encountered an error processing your request. Please try again.',
          );
        } catch (publishError) {
          console.error('Failed to send error message:', publishError);
        }
      }
    });

    // Handle edited channel posts
    this.bot.on('edited_channel_post', async (msg) => {
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
        // Process edited message through orchestrator
        const orchestratorResponse = await this.orchestrator.processMessage(
          'channel',
          msg.text,
          {
            platform: 'telegram',
            messageId: msg.message_id,
            isChannel: true,
            channelTitle: msg.chat.title,
            isEdited: true,
            chatId: msg.chat.id.toString(),
          },
        );

        // Send response back to Telegram
        await this.telegramPublisher.sendMessage(
          msg.chat.id.toString(),
          orchestratorResponse.response,
        );

        console.log('Edited message processed and response sent');
      } catch (error) {
        console.error('Error processing edited channel message:', error);
      }
    });

    console.log('Message handlers setup complete');
  }

  private async startListener() {
    try {
      console.log('Starting Telegram message listener...');
      console.log('Listener instance:', this.bot ? 'exists' : 'missing');

      // Test the connection by checking bot info
      console.log('Testing connection...');
      await this.bot.getMe();
      console.log('Telegram bot connection successful');
    } catch (error) {
      console.error('Failed to start Telegram listener:', error);
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
