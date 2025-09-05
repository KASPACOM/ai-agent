import { Module } from '@nestjs/common';

// Import shared infrastructure
import { SharedModule } from '../shared/shared.module';

// Import twitter services
import { TwitterIndexerService } from './services/twitter-indexer.service';
import { TwitterNoteUpdateService } from './services/twitter-note-update.service';

// Import controllers
import { TwitterController } from './controllers/twitter.controller';
import { TwitterNoteUpdateController } from './controllers/twitter-note-update.controller';

// Import existing ETL/integration services (reuse during transition)
import { TwitterApiModule } from '../../integrations/twitter/twitter-api.module';
import { AppConfigModule } from '../../core/modules/config/app-config.module';
import { AccountRotationService } from './services/account-rotation.service';
import { TwitterService } from './services/twitter.service';
import { OrchestratorModule } from 'src/modules/orchestrator/orchestrator.module';
import { MultiAgentModule } from 'src/modules/multiagent/multiagent.module';
import { TwitterRawStorageService } from './services/twitter-raw-storage.service';
import { TwitterDocGenerationService } from './services/twitter-doc-generation.service';
import { TwitterRawIndexerService } from './services/twitter-raw-indexer.service';
import { TwitterRawAuditService } from './services/twitter-raw-audit.service';
import { TwitterSourceIndexerService } from './services/twitter-source-indexer.service';

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
    MultiAgentModule, // ✅ For AgentFactory used by controller
  ],
  controllers: [
    TwitterController, // ✅ Simple controller with cron management
    TwitterNoteUpdateController, // ✅ Controller for note_tweet updates
  ],
  providers: [
    // ✅ Twitter-specific indexer services
    TwitterIndexerService, // Main indexing logic
    TwitterNoteUpdateService, // Note tweet update service

    // ✅ Local copies and dependencies
    AccountRotationService, // Account management and rotation (local copy)
    TwitterService,
    TwitterRawStorageService,
    TwitterDocGenerationService,
    TwitterRawIndexerService,
    TwitterRawAuditService,
    TwitterSourceIndexerService,
  ],
  exports: [
    // ✅ Export services for potential external use
    TwitterIndexerService,
    TwitterNoteUpdateService,
    AccountRotationService, // Export for potential shared use
    TwitterService,
    TwitterDocGenerationService,
    TwitterRawIndexerService,
    TwitterRawAuditService,
    TwitterSourceIndexerService,
  ],
})
export class TwitterModule {}
