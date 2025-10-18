import { Module } from '@nestjs/common';

// Import shared infrastructure
import { SharedModule } from '../shared/shared.module';
import { MongoDbModule } from '../../database/mongodb/mongodb.module';

// Import telegram services
import { TelegramHistoryService } from './services/telegram-history.service';
import { TelegramStorageService } from './services/telegram-storage.service';
import { TelegramIndexerService } from './services/telegram-indexer.service';
import { TelegramVectorGenerationService } from './services/telegram-vector-generation.service';

// Import controllers
import { TelegramController } from './controllers/telegram.controller';
import { TelegramVectorGenerationController } from './controllers/telegram-vector-generation.controller';

// Import local copies (independent from ETL)
import { TelegramMTProtoService } from './services/telegram-mtproto.service';

import { AppConfigModule } from '../../core/modules/config/app-config.module';

/**
 * Telegram Module
 *
 * Independent module for Telegram indexing operations.
 * Following simplified architecture: controller.
 *
 * Features:
 * - Complete Telegram indexing pipeline
 * - Simple controller with manual trigger endpoints
 * - History tracking for channels and topics
 * - Unified storage integration via SharedModule
 * - Local copies of services (independent from ETL module)
 */
@Module({
  imports: [
    SharedModule, // ✅ Gets UnifiedStorageService, IndexerConfigService
    MongoDbModule, // ✅ MongoDB repositories for raw data storage
    AppConfigModule, // ✅ Gets AppConfigService for Telegram API credentials
  ],
  controllers: [
    TelegramController, // ✅ Simple controller with cron management
    TelegramVectorGenerationController, // ✅ Controller for vector generation
  ],
  providers: [
    // ✅ Telegram-specific services
    TelegramHistoryService, // History tracking (MongoDB)
    TelegramStorageService, // Raw message storage (MongoDB)
    TelegramIndexerService, // Main indexing logic
    TelegramVectorGenerationService, // Vector generation service

    // ✅ Local copies (independent from ETL)
    TelegramMTProtoService, // Telegram API client (local copy)
  ],
  exports: [
    // ✅ Export services for potential external use
    TelegramHistoryService,
    TelegramStorageService,
    TelegramIndexerService,
  ],
})
export class TelegramModule {}
