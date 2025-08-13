import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PDFIndexerService } from '../services/pdf-indexer.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import {
  PDFProcessingOptions,
  PDFUploadRequest,
  PDFProcessingResult,
  PDFChunkPreview,
} from '../models/pdf-document.model';
import {
  PDFDocumentType,
  ChunkingStrategy,
} from '../../shared/models/master-document.model';
import * as multer from 'multer';

/**
 * PDF Controller
 *
 * REST API endpoints for PDF document processing.
 * Simplified without cron scheduling - focuses on direct file processing.
 *
 * Features:
 * - PDF file upload with processing options
 * - Process PDF by file path
 * - Document status and chunk preview
 * - Manual processing triggers
 * - Health monitoring and statistics
 */
@Controller('indexer/pdf')
export class PDFController implements OnModuleInit {
  private readonly logger = new Logger(PDFController.name);

  constructor(
    private readonly pdfIndexer: PDFIndexerService,
    private readonly config: IndexerConfigService,
  ) {}

  /**
   * Initialize PDF module (no cron needed)
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('PDF module initialized - ready for file processing');
  }

  // ==========================================
  // PDF PROCESSING ENDPOINTS
  // ==========================================

  /**
   * Upload and process a PDF file
   * POST /indexer/pdf/upload
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit (configurable)
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new Error('Only PDF files are allowed'), false);
        }
      },
    }),
  )
  async uploadPDF(
    @UploadedFile() file: any,
    @Body() options?: Partial<PDFProcessingOptions>,
  ): Promise<PDFProcessingResult> {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(
        `Processing PDF upload: ${file.originalname} (${file.size} bytes)`,
      );

      // Build processing options with defaults
      const processingOptions: PDFProcessingOptions = {
        chunkingStrategy:
          options?.chunkingStrategy || ChunkingStrategy.SEMANTIC,
        maxTokensPerChunk:
          options?.maxTokensPerChunk || this.config.getPDFMaxTokensPerChunk(),
        minTokensPerChunk:
          options?.minTokensPerChunk || this.config.getPDFMinTokensPerChunk(),
        overlapTokens:
          options?.overlapTokens || this.config.getPDFOverlapTokens(),
        semanticThreshold:
          options?.semanticThreshold || this.config.getPDFSemanticThreshold(),
        preserveStructure: options?.preserveStructure ?? true,
        extractImages: options?.extractImages ?? false,
        extractTables: options?.extractTables ?? false,
        documentType: options?.documentType || PDFDocumentType.ARTICLE,
        category: options?.category || 'general',
      };

      // Create upload request
      const uploadRequest: PDFUploadRequest = {
        file: file.buffer,
        fileName: file.originalname,
        processingOptions,
      };

      // Process the PDF using runIndexer pattern
      const result = await this.pdfIndexer.runIndexer(uploadRequest);

      if (!result.success) {
        throw new HttpException(
          `PDF processing failed: ${result.errors.join(', ')}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`PDF upload failed: ${error.message}`);
      throw new HttpException(
        error.message || 'PDF processing failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Process a PDF file by path
   * POST /indexer/pdf/process
   */
  @Post('process')
  async processPDFByPath(
    @Body()
    request: {
      filePath: string;
      fileName?: string;
      processingOptions?: PDFProcessingOptions;
    },
  ): Promise<PDFProcessingResult> {
    try {
      this.logger.log(`Processing PDF from path: ${request.filePath}`);

      const processingOptions =
        request.processingOptions ||
        PDFIndexerService.createDefaultProcessingOptions();

      const fileName =
        request.fileName || request.filePath.split('/').pop() || 'unknown.pdf';

      // Create upload request from file path
      const uploadRequest: PDFUploadRequest = {
        file: request.filePath,
        fileName,
        processingOptions,
      };

      // Process using runIndexer pattern
      const result = await this.pdfIndexer.runIndexer(uploadRequest);

      return result;
    } catch (error) {
      this.logger.error(`PDF file processing failed: ${error.message}`);
      throw new HttpException(
        error.message || 'PDF file processing failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ==========================================
  // DOCUMENT QUERY & STATUS ENDPOINTS
  // ==========================================

  /**
   * Get PDF document status and chunks
   * GET /indexer/pdf/status/:documentId
   */
  @Get('status/:documentId')
  async getPDFStatus(@Param('documentId') documentId: string) {
    try {
      const status = await this.pdfIndexer.getPDFStatus(documentId);
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      this.logger.error(`Failed to get PDF status: ${error.message}`);
      throw new HttpException(
        error.message || 'Failed to get PDF status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Preview chunks for a PDF document
   * GET /indexer/pdf/chunks/:documentId
   */
  @Get('chunks/:documentId')
  async getPDFChunks(
    @Param('documentId') documentId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{
    success: boolean;
    chunks: PDFChunkPreview[];
    total: number;
  }> {
    try {
      const status = await this.pdfIndexer.getPDFStatus(documentId);
      const chunks = status.chunks || [];

      // Apply pagination
      const startIndex = offset || 0;
      const endIndex = startIndex + (limit || 50);
      const paginatedChunks = chunks.slice(startIndex, endIndex);

      // Transform to preview format
      const chunkPreviews: PDFChunkPreview[] = paginatedChunks.map((chunk) => ({
        id: chunk.id,
        text:
          chunk.text.substring(0, 500) + (chunk.text.length > 500 ? '...' : ''),
        pageNumber: chunk.pdfPageNumber || 1,
        chunkIndex: chunk.pdfChunkIndex || 0,
        semanticContext: chunk.pdfSemanticContext || '',
        tokenCount: Math.ceil(chunk.text.split(/\s+/).length * 1.3), // Rough estimate
        confidence: 0.8, // Default confidence
      }));

      return {
        success: true,
        chunks: chunkPreviews,
        total: chunks.length,
      };
    } catch (error) {
      this.logger.error(`Failed to get PDF chunks: ${error.message}`);
      throw new HttpException(
        error.message || 'Failed to get PDF chunks',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ==========================================
  // HEALTH & STATUS ENDPOINTS
  // ==========================================

  /**
   * Get PDF indexer health and statistics
   * GET /indexer/pdf/health
   */
  @Get('health')
  async getHealth() {
    try {
      const health = await this.pdfIndexer.getHealth();

      return {
        success: true,
        health,
        configuration: {
          maxFileSize: this.config.getPDFMaxFileSize(),
          uploadPath: this.config.getPDFUploadPath(),
          maxTokensPerChunk: this.config.getPDFMaxTokensPerChunk(),
          minTokensPerChunk: this.config.getPDFMinTokensPerChunk(),
          overlapTokens: this.config.getPDFOverlapTokens(),
          semanticThreshold: this.config.getPDFSemanticThreshold(),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get PDF health: ${error.message}`);
      throw new HttpException(
        error.message || 'Failed to get PDF health',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get supported document types and chunking strategies
   * GET /indexer/pdf/options
   */
  @Get('options')
  async getProcessingOptions() {
    return {
      success: true,
      options: {
        documentTypes: Object.values(PDFDocumentType),
        chunkingStrategies: Object.values(ChunkingStrategy),
        defaultOptions: PDFIndexerService.createDefaultProcessingOptions(),
        limits: {
          maxFileSize: this.config.getPDFMaxFileSize(),
          maxTokensPerChunk: this.config.getPDFMaxTokensPerChunk(),
          minTokensPerChunk: this.config.getPDFMinTokensPerChunk(),
        },
      },
    };
  }

  /**
   * Delete PDF document and its chunks
   * DELETE /indexer/pdf/:documentId
   */
  @Delete(':documentId')
  async deletePDF(@Param('documentId') documentId: string) {
    try {
      // This would integrate with a full PDF document management system
      // For now, return a placeholder response
      this.logger.log(`PDF deletion requested for document: ${documentId}`);

      return {
        success: true,
        message:
          'PDF deletion not fully implemented - chunks remain in unified collection',
        documentId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`PDF deletion failed: ${error.message}`);
      throw new HttpException(
        error.message || 'PDF deletion failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
