import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfigService } from '../../core/modules/config/app-config.service';
import {
  TwitterTweetDocument,
  TwitterTweetSchema,
} from './schemas/twitter.schema';
import {
  TwitterAccountDocument,
  TwitterAccountSchema,
} from './schemas/twitter-account.schema';
import {
  TelegramMessageDocument,
  TelegramMessageSchema,
} from './schemas/telegram.schema';
import {
  TelegramChannelDocument,
  TelegramChannelSchema,
} from './schemas/telegram-channel.schema';
import { TwitterRepository } from './repositories/twitter.repository';
import { TwitterAccountRepository } from './repositories/twitter-account.repository';
import { TelegramRepository } from './repositories/telegram.repository';
import { TelegramChannelRepository } from './repositories/telegram-channel.repository';
import { AppConfigModule } from 'src/modules/core/modules/config/app-config.module';

/**
 * MongoDB Module
 *
 * Provides MongoDB connection and repositories for raw data storage.
 * Following DEVELOPMENT_RULES.md: All configuration through environment variables.
 *
 * Collections:
 * - twitter_tweets: Raw tweets from Twitter API
 * - twitter_accounts: Twitter account sync status
 * - telegram_messages: Raw messages from Telegram API
 * - telegram_channels: Telegram channel indexing history
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: async (configService: AppConfigService) => ({
        uri: configService.getMongoUri,
      }),
      inject: [AppConfigService],
    }),
    MongooseModule.forFeature([
      { name: TwitterTweetDocument.name, schema: TwitterTweetSchema },
      { name: TwitterAccountDocument.name, schema: TwitterAccountSchema },
      { name: TelegramMessageDocument.name, schema: TelegramMessageSchema },
      { name: TelegramChannelDocument.name, schema: TelegramChannelSchema },
    ]),
  ],
  providers: [
    TwitterRepository,
    TwitterAccountRepository,
    TelegramRepository,
    TelegramChannelRepository,
  ],
  exports: [
    MongooseModule,
    TwitterRepository,
    TwitterAccountRepository,
    TelegramRepository,
    TelegramChannelRepository,
  ],
})
export class MongoDbModule {}
