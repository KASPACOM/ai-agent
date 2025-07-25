import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UnifiedStorageService } from './services/unified-storage.service';
import { CronManager } from './services/cron-manager.service';
import { IndexerConfigService } from './config/indexer.config';

// Import database and embedding modules
import { QdrantModule } from '../../database/qdrant/qdrant.module';
import { EmbeddingModule } from '../../embedding/embedding.module';
import { AppConfigModule } from '../../core/modules/config/app-config.module';

/**
 * Shared Module
 *
 * Contains shared services and components used by all indexer sub-modules.
 * Following DEVELOPMENT_RULES.md: Clear module separation with focused exports.
 */
@Module({
  imports: [
    ConfigModule, // Configuration management
    AppConfigModule, // ✅ External service credentials (OpenAI, Qdrant, etc.)
    QdrantModule, // Database layer
    EmbeddingModule, // Embedding generation
  ],
  providers: [
    IndexerConfigService, // ✅ Centralized configuration
    UnifiedStorageService,
    CronManager, // ✅ Shared cron management
    // Note: BaseIndexerService is abstract, so not provided directly
    // Sub-modules will extend it in their concrete implementations
  ],
  exports: [
    IndexerConfigService, // ✅ Export configuration for sub-modules
    UnifiedStorageService,
    CronManager, // ✅ Export cron management for sub-modules
    // Export database and embedding modules for sub-modules
    QdrantModule,
    EmbeddingModule,
  ],
})
export class SharedModule {}
