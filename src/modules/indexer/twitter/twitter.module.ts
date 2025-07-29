import { Module } from '@nestjs/common';

// Import shared infrastructure
import { SharedModule } from '../shared/shared.module';

// Import twitter services
import { TwitterIndexerService } from './services/twitter-indexer.service';

// Import controller
import { TwitterController } from './controllers/twitter.controller';

// Import existing ETL/integration services (reuse during transition)
import { TwitterApiModule } from '../../integrations/twitter/twitter-api.module';
import { AppConfigModule } from '../../core/modules/config/app-config.module';
import { AccountRotationService } from './services/account-rotation.service';
import { TwitterService } from './services/twitter.service';
import { OrchestratorModule } from 'src/modules/orchestrator/orchestrator.module';

/**
 * Twitter Module
 *
 * Independent module for Twitter indexing operations.
 * Following simplified architecture: controller.
 *
 * Features:
 * - Complete Twitter indexing pipeline
 * - Simple controller with manual trigger endpoints
 * - Account rotation and rate limiting via AccountRotationService (local copy)
 * - Unified storage integration via SharedModule
 * - Minimal ETL dependencies (only static transformers)
 */
@Module({
  imports: [
    SharedModule, // ✅ Gets UnifiedStorageService, IndexerConfigService
    TwitterApiModule, // ✅ Gets TwitterApiService with proper dependencies
    AppConfigModule, // ✅ Gets AppConfigService for Twitter accounts configuration
    OrchestratorModule,
  ],
  controllers: [
    TwitterController, // ✅ Simple controller with cron management
  ],
  providers: [
    // ✅ Twitter-specific indexer services
    TwitterIndexerService, // Main indexing logic

    // ✅ Local copies and dependencies
    AccountRotationService, // Account management and rotation (local copy)
    TwitterService,
  ],
  exports: [
    // ✅ Export services for potential external use
    TwitterIndexerService,
    AccountRotationService, // Export for potential shared use
    TwitterService,
  ],
})
export class TwitterModule {}
