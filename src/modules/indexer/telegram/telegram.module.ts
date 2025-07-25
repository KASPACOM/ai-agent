import { Module } from '@nestjs/common';

// Import shared infrastructure
import { SharedModule } from '../shared/shared.module';

// Import telegram services
import { TelegramHistoryService } from './services/telegram-history.service';
import { TelegramIndexerService } from './services/telegram-indexer.service';

// Import controller
import { TelegramController } from './controllers/telegram.controller';

// Import local copies (independent from ETL)
import { TelegramMTProtoService } from './services/telegram-mtproto.service';
import { TelegramMessageTransformer } from '../../etl/transformers/telegram-message.transformer';
import { AppConfigModule } from '../../core/modules/config/app-config.module';

/**
 * Telegram Module
 *
 * Independent module for Telegram indexing operations.
 * Following simplified architecture: controller + shared CronManager.
 *
 * Features:
 * - Complete Telegram indexing pipeline
 * - Simple controller with manual trigger endpoints
 * - Shared CronManager for scheduling (no complex @nestjs/schedule dependencies)
 * - History tracking for channels and topics
 * - Unified storage integration via SharedModule
 * - Local copies of services (independent from ETL module)
 */
@Module({
  imports: [
    SharedModule, // ✅ Gets UnifiedStorageService, IndexerConfigService, CronManager
    AppConfigModule, // ✅ Gets AppConfigService for Telegram API credentials
  ],
  controllers: [
    TelegramController, // ✅ Simple controller with cron management
  ],
  providers: [
    // ✅ Telegram-specific services
    TelegramHistoryService, // History tracking
    TelegramIndexerService, // Main indexing logic

    // ✅ Local copies (independent from ETL)
    TelegramMTProtoService, // Telegram API client (local copy)
    TelegramMessageTransformer, // Message transformation (ETL copy - static methods)
  ],
  exports: [
    // ✅ Export services for potential external use
    TelegramHistoryService,
    TelegramIndexerService,
  ],
})
export class TelegramModule {}
