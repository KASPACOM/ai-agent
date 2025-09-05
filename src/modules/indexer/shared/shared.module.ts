import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UnifiedStorageService } from './services/unified-storage.service';
import { IndexerConfigService } from './config/indexer.config';

// Import database and embedding modules
import { QdrantModule } from '../../database/qdrant/qdrant.module';
import { EmbeddingModule } from '../../embedding/embedding.module';
import { AppConfigModule } from '../../core/modules/config/app-config.module';
import { SemanticChunkingService } from './services/semantic-chunking.service';

@Module({
  imports: [ConfigModule, AppConfigModule, QdrantModule, EmbeddingModule],
  providers: [
    IndexerConfigService,
    UnifiedStorageService,
    SemanticChunkingService,
  ],
  exports: [
    IndexerConfigService,
    UnifiedStorageService,
    SemanticChunkingService,
    QdrantModule,
    EmbeddingModule,
  ],
})
export class SharedModule {}
