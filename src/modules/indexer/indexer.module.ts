import { Module } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';
import { TelegramModule } from './telegram/telegram.module'; // ✅ Telegram module imported
import { TwitterModule } from './twitter/twitter.module'; // ✅ Twitter module imported
import { PDFModule } from './pdf/pdf.module'; // ✅ PDF module imported

/**
 * Main Indexer Module
 *
 * Root module for the new indexer system that replaces the ETL module.
 * Contains shared infrastructure and imports all data source sub-modules.
 *
 * Architecture:
 * - SharedModule: Common services (UnifiedStorageService, BaseIndexerService, SemanticChunkingService)
 * - TelegramModule: Telegram-specific indexing with own scheduler
 * - TwitterModule: Twitter-specific indexing with own scheduler
 * - PDFModule: PDF document processing with semantic chunking
 *
 * Each sub-module is completely independent and can be deployed separately.
 */
@Module({
  imports: [
    SharedModule,
    TelegramModule, // ✅ Independent telegram indexing
    TwitterModule, // ✅ Independent twitter indexing
    PDFModule, // ✅ Independent PDF processing
  ],
  providers: [],
  exports: [
    SharedModule,
    TelegramModule, // ✅ Export telegram services
    TwitterModule, // ✅ Export twitter services
    PDFModule, // ✅ Export PDF services
  ],
})
export class IndexerModule {}
