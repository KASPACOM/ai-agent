import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

// Import shared infrastructure
import { SharedModule } from '../shared/shared.module';

// Import twitter services
import { TwitterIndexerService } from './services/twitter-indexer.service';
import { TwitterSchedulerService } from './services/twitter-scheduler.service';

// Import existing ETL/integration services (reuse during transition)
import { TwitterApiService } from '../../integrations/twitter/twitter-api.service';
import { TwitterMessageTransformer } from '../../etl/transformers/twitter-message.transformer';
import { AccountRotationService } from './services/account-rotation.service';
import { EtlConfigService } from '../../etl/config/etl.config';

/**
 * Twitter Module
 * 
 * Independent module for Twitter indexing operations.
 * Following the architecture where each data source has its own module for true independence.
 * 
 * Features:
 * - Complete Twitter indexing pipeline
 * - Independent scheduler with 15-minute cron
 * - Account rotation and rate limiting via AccountRotationService (local copy)
 * - Unified storage integration via SharedModule
 * - Minimal ETL dependencies (only static transformers)
 */
@Module({
  imports: [
    SharedModule,              // ✅ Gets UnifiedStorageService, IndexerConfigService, etc.
    ScheduleModule,            // ✅ Enables @Cron decorators
  ],
  providers: [
    // ✅ Twitter-specific indexer services
    TwitterIndexerService,     // Main indexing logic
    TwitterSchedulerService,   // Independent scheduler
    
    // ✅ Local copies and dependencies
    AccountRotationService,    // Account management and rotation (local copy)
    TwitterMessageTransformer, // Message transformation (ETL copy - static methods)
    TwitterApiService,         // Twitter API client (integration service)
    EtlConfigService,          // Configuration for ETL services
  ],
  exports: [
    // ✅ Export services for potential external use
    TwitterIndexerService,
    TwitterSchedulerService,
    AccountRotationService,    // Export for potential shared use
  ],
})
export class TwitterModule {} 