import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// === Core Configuration ===
import { AppConfigModule } from '../core/modules/config/app-config.module';

// === ETL Services ===
import { TwitterScraperService } from './services/twitter-scraper.service';
import { TwitterListenerService } from './services/twitter-listener.service';
import { EmbeddingService } from './services/embedding.service';
import { IndexerService } from './services/indexer.service';

// === ETL Configuration ===
import { EtlConfigService } from './config/etl.config';

// === Transformers ===
import { TweetTransformer } from './transformers/tweet.transformer';

// === Database Integration ===
import { DatabaseModule } from '../database/database.module';

/**
 * ETL Module
 * 
 * Handles all Extract, Transform, Load operations for Kaspa ecosystem data:
 * - Twitter data extraction (historical + live)
 * - Text embedding generation via OpenAI
 * - Data transformation and normalization
 * - Indexing coordination with separate scraper and listener processes
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
  ],
  providers: [
    // === Configuration ===
    EtlConfigService,

    // === Core ETL Services ===
    TwitterScraperService,
    TwitterListenerService,
    EmbeddingService,
    IndexerService,

    // === Transformers ===
    TweetTransformer,
  ],
  exports: [
    // === Configuration ===
    EtlConfigService,

    // === Core ETL Services ===
    TwitterScraperService,
    TwitterListenerService,
    EmbeddingService,
    IndexerService,

    // === Transformers ===
    TweetTransformer,
  ],
})
export class EtlModule {} 