import { Module } from '@nestjs/common';

// Import shared infrastructure
import { SharedModule } from '../shared/shared.module';
import { EmbeddingModule } from '../../embedding/embedding.module';

// Import PDF services
import { PDFParserService } from './services/pdf-parser.service';
import { PDFIndexerService } from './services/pdf-indexer.service';

// Import controller
import { PDFController } from './controllers/pdf.controller';

/**
 * PDF Module
 * 
 * Independent module for PDF document processing and indexing.
 * Following the established pattern of Telegram and Twitter modules.
 * 
 * Features:
 * - Complete PDF processing pipeline (parse → chunk → embed → store)
 * - Semantic chunking with hierarchical relationships
 * - REST API for file upload and management
 * - Shared CronManager for scheduling
 * - Unified storage integration via SharedModule
 * - Comprehensive error handling and health monitoring
 * 
 * Processing Flow:
 * 1. PDF Upload (via controller)
 * 2. Text Extraction (PDFParserService)
 * 3. Semantic Chunking (SemanticChunkingService from SharedModule)
 * 4. MasterDocument Transformation (PDFMasterDocumentTransformer)
 * 5. Embedding & Storage (UnifiedStorageService from SharedModule)
 */
@Module({
  imports: [
    SharedModule, // Provides UnifiedStorageService, SemanticChunkingService, CronManager, IndexerConfigService
    EmbeddingModule, // Provides EmbeddingService for text embedding
  ],
  controllers: [
    PDFController, // REST API endpoints
  ],
  providers: [
    PDFParserService, // PDF text extraction and metadata parsing
    PDFIndexerService, // Main orchestration service
  ],
  exports: [
    PDFIndexerService, // Export for potential use in other modules
    PDFParserService, // Export for potential standalone use
  ],
})
export class PDFModule {} 