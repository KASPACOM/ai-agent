import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

// === Core Configuration ===
import { AppConfigModule } from '../core/modules/config/app-config.module';

// === ETL Services ===
import { TwitterApiService } from './services/twitter-api.service';
import { TelegramApiService } from './services/telegram-api.service';
import { TelegramMTProtoService } from './services/telegram-mtproto.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { BaseIndexerService } from './services/base-indexer.service';
import { TwitterIndexerService } from './services/twitter-indexer.service';
import { TelegramIndexerService } from './services/telegram-indexer.service';
import { IndexerProviderService } from './providers/indexer.provider';
import { EtlSchedulerService } from './services/etl-scheduler.service';
import { AccountRotationService } from './services/account-rotation.service';

// === Controllers ===
import { IndexerSchedulerController } from './controllers/indexer-scheduler.controller';

// === ETL Configuration ===
import { EtlConfigService } from './config/etl.config';

// === Transformers ===
import { TweetTransformer } from './transformers/tweet.transformer';
import { BaseMessageTransformer } from './transformers/base-message.transformer';
import { TwitterMessageTransformer } from './transformers/twitter-message.transformer';
import { TelegramMessageTransformer } from './transformers/telegram-message.transformer';

// === Database Integration ===
import { DatabaseModule } from '../database/database.module';

/**
 * ETL Module
 *
 * Handles all Extract, Transform, Load operations for Kaspa ecosystem data:
 * - Twitter data extraction via API (historical + incremental)
 * - Telegram data extraction (planned implementation)
 * - Text embedding generation via OpenAI
 * - Data transformation and normalization
 * - Unified indexing architecture with base indexer and specialized services
 * - Scheduled indexing operations via controller
 *
 * Architecture:
 * - BaseIndexerService: Abstract base with common Qdrant operations
 * - TwitterIndexerService: Twitter-specific indexing logic
 * - TelegramIndexerService: Telegram-specific indexing logic (stub)
 * - IndexerProviderService: Coordinates all indexing operations
 * - IndexerSchedulerController: Handles scheduling and manual triggers
 *
 * This module is separate from integrations to maintain clear separation
 * between data processing logic and integration concerns.
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
    AppConfigModule,
    DatabaseModule, // For vector storage integration
    ScheduleModule.forRoot(), // Enable cron job scheduling
    EmbeddingModule, // <-- Use EmbeddingModule for EmbeddingService
  ],
  providers: [
    // === Configuration ===
    EtlConfigService,

    // === Core ETL Services ===
    TwitterApiService,
    TelegramApiService,
    TelegramMTProtoService,
    TwitterIndexerService,
    TelegramIndexerService,
    IndexerProviderService,
    EtlSchedulerService,
    AccountRotationService,

    // === Transformers ===
    TweetTransformer,
    BaseMessageTransformer,
    TwitterMessageTransformer,
    TelegramMessageTransformer,
  ],
  controllers: [IndexerSchedulerController],
  exports: [
    // === Configuration ===
    EtlConfigService,

    // === Core ETL Services ===
    TwitterApiService,
    TwitterIndexerService,
    TelegramIndexerService,
    IndexerProviderService,
    AccountRotationService,

    // === Transformers ===
    TweetTransformer,
    BaseMessageTransformer,
    TwitterMessageTransformer,
    TelegramMessageTransformer,
    EmbeddingModule,
  ],
})
export class EtlModule {}
