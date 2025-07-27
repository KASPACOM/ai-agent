import { PDFDocumentType, ChunkingStrategy } from '../../shared/models/master-document.model';

/**
 * PDF Document Model
 * 
 * Represents a PDF document that has been uploaded and processed
 */
export interface PDFDocument {
  id: string;
  fileName: string;
  filePath: string;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string; // ISO string
  modificationDate?: string; // ISO string
  pageCount: number;
  fileSize: number; // bytes
  documentType: PDFDocumentType;
  category: string;
  uploadedAt: string; // ISO string
  processedAt?: string; // ISO string
  processingStatus: PDFProcessingStatus;
  chunkingStrategy: ChunkingStrategy;
  totalChunks?: number;
  errors: string[];
}

/**
 * PDF Processing Status Enum
 */
export enum PDFProcessingStatus {
  UPLOADED = 'uploaded',
  PARSING = 'parsing',
  CHUNKING = 'chunking',
  EMBEDDING = 'embedding',
  STORED = 'stored',
  FAILED = 'failed',
}

/**
 * PDF Processing Options
 */
export interface PDFProcessingOptions {
  chunkingStrategy: ChunkingStrategy;
  maxTokensPerChunk: number;
  minTokensPerChunk: number;
  overlapTokens: number;
  semanticThreshold?: number; // For semantic chunking
  preserveStructure: boolean;
  extractImages: boolean;
  extractTables: boolean;
  documentType?: PDFDocumentType;
  category?: string;
}

/**
 * PDF Text Extraction Result
 */
export interface PDFTextExtractionResult {
  text: string;
  pageTexts: string[]; // Text from each page
  metadata: PDFMetadata;
  structure?: PDFStructure;
  extractionErrors: string[];
}

/**
 * PDF Metadata
 */
export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  pageCount: number;
  fileSize: number;
  isEncrypted: boolean;
  hasFormFields: boolean;
  version: string;
}

/**
 * PDF Document Structure (for structure-aware chunking)
 */
export interface PDFStructure {
  headings: PDFHeading[];
  paragraphs: PDFParagraph[];
  sections: PDFSection[];
  hasTableOfContents: boolean;
  hasImages: boolean;
  hasTables: boolean;
}

/**
 * PDF Heading
 */
export interface PDFHeading {
  text: string;
  level: number; // 1-6 (H1-H6)
  pageNumber: number;
  position: number; // Character position in full text
}

/**
 * PDF Paragraph
 */
export interface PDFParagraph {
  text: string;
  pageNumber: number;
  startPosition: number;
  endPosition: number;
  headingLevel?: number; // If belongs to a heading section
}

/**
 * PDF Section
 */
export interface PDFSection {
  title: string;
  level: number;
  startPage: number;
  endPage: number;
  startPosition: number;
  endPosition: number;
  subsections: PDFSection[];
}

/**
 * PDF Upload Request
 */
export interface PDFUploadRequest {
  file: Buffer | string; // File buffer or path
  fileName: string;
  processingOptions: PDFProcessingOptions;
}

/**
 * PDF Processing Result
 */
export interface PDFProcessingResult {
  success: boolean;
  document: PDFDocument;
  chunksCreated: number;
  chunksStored: number;
  errors: string[];
  processingTimeMs: number;
}

/**
 * PDF Chunk Preview (for API responses)
 */
export interface PDFChunkPreview {
  id: string;
  text: string;
  pageNumber: number;
  chunkIndex: number;
  semanticContext: string;
  tokenCount: number;
  confidence: number;
}

/**
 * PDF Query Options
 */
export interface PDFQueryOptions {
  documentId?: string;
  documentType?: PDFDocumentType;
  category?: string;
  semanticGroupId?: string;
  pageNumber?: number;
  limit?: number;
  offset?: number;
}

/**
 * PDF Statistics
 */
export interface PDFStatistics {
  totalDocuments: number;
  totalChunks: number;
  averageChunksPerDocument: number;
  documentsByType: Record<PDFDocumentType, number>;
  documentsByCategory: Record<string, number>;
  totalStorageSize: number;
  processingErrors: number;
} 