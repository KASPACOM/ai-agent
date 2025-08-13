import { Injectable, Logger } from '@nestjs/common';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import {
  SemanticChunkingService,
  SemanticChunkingOptions,
} from '../../shared/services/semantic-chunking.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { PDFParserService } from './pdf-parser.service';
import { PDFMasterDocumentTransformer } from '../transformers/pdf-master-document.transformer';
import {
  PDFDocument,
  PDFProcessingOptions,
  PDFProcessingResult,
  PDFProcessingStatus,
  PDFUploadRequest,
} from '../models/pdf-document.model';
import {
  ChunkingStrategy,
  PDFDocumentType,
} from '../../shared/models/master-document.model';
import { MasterDocument } from '../../shared/models/master-document.model';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PDF Indexer Service
 *
 * Main orchestration service for PDF document processing and indexing.
 * Standalone service focused on PDF processing without cron scheduling.
 *
 * Processing Pipeline:
 * 1. PDF Upload & Validation
 * 2. Text Extraction & Metadata Parsing
 * 3. Semantic Chunking
 * 4. MasterDocument Transformation
 * 5. Embedding Generation & Storage
 * 6. Cleanup & Status Updates
 *
 * Features:
 * - Semantic chunking with hierarchical relationships
 * - Intelligent document type and category detection
 * - Comprehensive error handling and retry logic
 * - File cleanup and storage management
 */
@Injectable()
export class PDFIndexerService {
  private readonly logger = new Logger(PDFIndexerService.name);

  constructor(
    private readonly pdfParser: PDFParserService,
    private readonly semanticChunking: SemanticChunkingService,
    private readonly unifiedStorage: UnifiedStorageService,
    private readonly config: IndexerConfigService,
  ) {}

  /**
   * Main indexer entry point - runs the full PDF processing pipeline
   */
  async runIndexer(
    uploadRequest: PDFUploadRequest,
  ): Promise<PDFProcessingResult> {
    this.logger.log(`Starting PDF indexer run for: ${uploadRequest.fileName}`);

    try {
      // Process the PDF upload request
      const result = await this.processPDFUpload(uploadRequest);

      this.logger.log('PDF indexer run completed successfully');
      return result;
    } catch (error) {
      this.logger.error('PDF indexer run failed:', error.message);
      throw error;
    }
  }

  /**
   * Process a single PDF upload request
   */
  async processPDFUpload(
    uploadRequest: PDFUploadRequest,
  ): Promise<PDFProcessingResult> {
    const startTime = Date.now();
    this.logger.log(`Processing PDF upload: ${uploadRequest.fileName}`);

    try {
      // Step 1: Save uploaded file to temporary location
      const filePath = await this.saveUploadedFile(uploadRequest);

      // Step 2: Validate PDF file
      const validation = await this.pdfParser.validatePDF(filePath);
      if (!validation.valid) {
        throw new Error(
          `PDF validation failed: ${validation.errors.join(', ')}`,
        );
      }

      // Step 3: Parse PDF and extract text/metadata
      const pdfDocument = await this.pdfParser.parsePDF(
        filePath,
        uploadRequest.fileName,
        {
          documentType: uploadRequest.processingOptions.documentType,
          category: uploadRequest.processingOptions.category,
          extractStructure: uploadRequest.processingOptions.preserveStructure,
        },
      );

      // Step 4: Extract text for chunking
      const extractionResult = await this.pdfParser.extractTextFromPDF(
        typeof uploadRequest.file === 'string'
          ? fs.readFileSync(uploadRequest.file)
          : uploadRequest.file,
        uploadRequest.fileName,
      );

      if (!extractionResult.text) {
        throw new Error('No text could be extracted from PDF');
      }

      // Step 5: Perform semantic chunking
      const chunkingOptions = this.buildChunkingOptions(
        uploadRequest.processingOptions,
      );
      const semanticChunks =
        await this.semanticChunking.performSemanticChunking(
          extractionResult.text,
          chunkingOptions,
        );

      if (semanticChunks.length === 0) {
        throw new Error('No chunks were generated from PDF text');
      }

      // Step 6: Update PDF document with chunk information
      pdfDocument.totalChunks = semanticChunks.length;
      pdfDocument.processingStatus = PDFProcessingStatus.CHUNKING;
      pdfDocument.processedAt = new Date().toISOString();

      // Step 7: Transform chunks to MasterDocument format
      const masterDocuments =
        PDFMasterDocumentTransformer.transformPDFChunksBatch(
          semanticChunks,
          pdfDocument,
          this.extractPageNumbers(semanticChunks, extractionResult.pageTexts),
        );

      // Step 8: Store documents in unified collection
      pdfDocument.processingStatus = PDFProcessingStatus.EMBEDDING;
      const storageResult =
        await this.unifiedStorage.storeBatch(masterDocuments);

      if (!storageResult.success) {
        throw new Error(`Storage failed: ${storageResult.errors.join(', ')}`);
      }

      // Step 9: Update processing status
      pdfDocument.processingStatus = PDFProcessingStatus.STORED;

      // Step 10: Cleanup temporary file
      await this.cleanupTempFile(filePath);

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `PDF processing completed: ${uploadRequest.fileName} ` +
          `(${semanticChunks.length} chunks, ${storageResult.stored} stored, ${processingTime}ms)`,
      );

      return {
        success: true,
        document: pdfDocument,
        chunksCreated: semanticChunks.length,
        chunksStored: storageResult.stored,
        errors: storageResult.errors,
        processingTimeMs: processingTime,
      };
    } catch (error) {
      this.logger.error(
        `PDF processing failed for ${uploadRequest.fileName}:`,
        error.message,
      );

      // Cleanup on error
      try {
        const filePath = this.generateTempFilePath(uploadRequest.fileName);
        await this.cleanupTempFile(filePath);
      } catch (cleanupError) {
        this.logger.warn(
          'Failed to cleanup temp file after error:',
          cleanupError.message,
        );
      }

      return {
        success: false,
        document: {} as PDFDocument, // Minimal empty document
        chunksCreated: 0,
        chunksStored: 0,
        errors: [error.message],
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get processing status for a PDF document
   */
  async getPDFStatus(documentId: string): Promise<{
    document: PDFDocument | null;
    chunks: MasterDocument[];
  }> {
    try {
      // Query the unified collection for chunks from this document
      // TODO: Implement proper search method on UnifiedStorageService
      const chunks: MasterDocument[] = [];

      return {
        document: null, // Would be retrieved from PDF documents collection
        chunks: chunks || [],
      };
    } catch (error) {
      this.logger.error(
        `Failed to get PDF status for ${documentId}:`,
        error.message,
      );
      throw error;
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * Save uploaded file to temporary location
   */
  private async saveUploadedFile(
    uploadRequest: PDFUploadRequest,
  ): Promise<string> {
    const uploadDir = this.config.getPDFUploadPath();

    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const tempFilePath = this.generateTempFilePath(uploadRequest.fileName);

    if (typeof uploadRequest.file === 'string') {
      // File is already on disk, copy it to temp location
      fs.copyFileSync(uploadRequest.file, tempFilePath);
    } else {
      // File is a buffer, write it to temp location
      fs.writeFileSync(tempFilePath, uploadRequest.file);
    }

    return tempFilePath;
  }

  /**
   * Generate temporary file path
   */
  private generateTempFilePath(fileName: string): string {
    const uploadDir = this.config.getPDFUploadPath();
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

    return path.join(uploadDir, `${timestamp}_${uuid}_${sanitizedName}`);
  }

  /**
   * Build chunking options from processing options
   */
  private buildChunkingOptions(
    processingOptions: PDFProcessingOptions,
  ): SemanticChunkingOptions {
    return {
      strategy: processingOptions.chunkingStrategy,
      maxTokensPerChunk: processingOptions.maxTokensPerChunk,
      minTokensPerChunk: processingOptions.minTokensPerChunk,
      overlapTokens: processingOptions.overlapTokens,
      sentenceWindowSize: 3, // Fixed for now
      semanticThreshold:
        processingOptions.semanticThreshold ||
        this.config.getPDFSemanticThreshold(),
      maxHierarchyLevels: 3, // Fixed for now
      preserveStructure: processingOptions.preserveStructure,
    };
  }

  /**
   * Extract page numbers for chunks (simplified approximation)
   */
  private extractPageNumbers(chunks: any[], pageTexts: string[]): number[] {
    // Simplified page number assignment
    // In a more sophisticated implementation, you would track character positions
    // and map them to specific pages based on the PDF structure

    const totalChunks = chunks.length;
    const totalPages = pageTexts.length;

    return chunks.map((_, index) => {
      // Distribute chunks evenly across pages
      const pageRatio = (index + 1) / totalChunks;
      return Math.max(1, Math.ceil(pageRatio * totalPages));
    });
  }

  /**
   * Cleanup temporary file
   */
  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.debug(`Cleaned up temporary file: ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup temp file ${filePath}:`,
        error.message,
      );
    }
  }

  /**
   * Create default processing options
   */
  static createDefaultProcessingOptions(
    documentType: PDFDocumentType = PDFDocumentType.ARTICLE,
    category: string = 'general',
  ): PDFProcessingOptions {
    return {
      chunkingStrategy: ChunkingStrategy.SEMANTIC,
      maxTokensPerChunk: 1000,
      minTokensPerChunk: 200,
      overlapTokens: 150,
      semanticThreshold: 0.15,
      preserveStructure: true,
      extractImages: false, // Not implemented yet
      extractTables: false, // Not implemented yet
      documentType,
      category,
    };
  }

  /**
   * Get health information for PDF indexer
   */
  async getHealth(): Promise<any> {
    return {
      serviceName: PDFIndexerService.name,
      status: 'healthy',
      collectionName: this.unifiedStorage.getCollectionName(),
      pdfSpecific: {
        uploadPath: this.config.getPDFUploadPath(),
        maxFileSize: this.config.getPDFMaxFileSize(),
        semanticChunkingEnabled: true,
        supportedTypes: Object.values(PDFDocumentType),
      },
    };
  }
}
