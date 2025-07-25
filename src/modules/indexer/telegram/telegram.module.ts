import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

// Import shared infrastructure
import { SharedModule } from '../shared/shared.module';

// Import telegram services
import { TelegramHistoryService } from './services/telegram-history.service';
import { TelegramIndexerService } from './services/telegram-indexer.service';
import { TelegramSchedulerService } from './services/telegram-scheduler.service';

// Import local copies (independent from ETL)
import { TelegramMTProtoService } from './services/telegram-mtproto.service';
import { TelegramMessageTransformer } from '../../etl/transformers/telegram-message.transformer';

/**
 * Telegram Module
 * 
 * Independent module for Telegram indexing operations.
 * Following the architecture where each data source has its own module for true independence.
 * 
 * Features:
 * - Complete Telegram indexing pipeline
 * - Independent scheduler with daily cron
 * - History tracking for channels and topics
 * - Unified storage integration via SharedModule
 * - Local copies of services (independent from ETL module)
 */
@Module({
  imports: [
    SharedModule,     // ✅ Gets UnifiedStorageService, IndexerConfigService, etc.
    ScheduleModule,   // ✅ Enables @Cron decorators
  ],
  providers: [
    // ✅ Telegram-specific services
    TelegramHistoryService,    // History tracking
    TelegramIndexerService,    // Main indexing logic
    TelegramSchedulerService,  // Independent scheduler
    
    // ✅ Local copies (independent from ETL)
    TelegramMTProtoService,    // Telegram API client (local copy)
    TelegramMessageTransformer, // Message transformation (ETL copy - static methods)
  ],
  exports: [
    // ✅ Export services for potential external use
    TelegramHistoryService,
    TelegramIndexerService,
    TelegramSchedulerService,
  ],
})
export class TelegramModule {} 