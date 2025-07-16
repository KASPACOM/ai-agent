import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// === Core Configuration ===
import { AppConfigModule } from '../../core/modules/config/app-config.module';

// === Qdrant Services ===
import { QdrantClientService } from './services/qdrant-client.service';
import { QdrantCollectionService } from './services/qdrant-collection.service';
import { QdrantRepository } from './services/qdrant.repository'

// === Qdrant Configuration ===
import { QdrantConfigService } from './config/qdrant.config';

/**
 * Qdrant Integration Module
 * 
 * Provides vector database integration with Qdrant:
 * - HTTP client for Qdrant API
 * - Collection management and configuration
 * - High-level repository for domain operations
 * - Vector storage, retrieval, and search
 * 
 * This module encapsulates all Qdrant-specific operations and provides
 * a clean interface for the rest of the application.
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
    AppConfigModule,
  ],
  providers: [
    // === Configuration ===
    QdrantConfigService,

    // === Core Qdrant Services ===
    QdrantClientService,
    QdrantCollectionService,
    QdrantRepository,
  ],
  exports: [
    // === Configuration ===
    QdrantConfigService,

    // === Core Qdrant Services ===
    QdrantClientService,
    QdrantCollectionService,
    QdrantRepository,
  ],
})
export class QdrantModule {} 