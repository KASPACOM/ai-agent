import {
  MasterDocument,
  ProcessingStatus,
  PDFDocumentType,
  ChunkingStrategy,
} from '../../shared/models/master-document.model';
import { MessageSource } from '../../shared/models/message-source.enum';
import { SemanticChunk } from '../../shared/services/semantic-chunking.service';
import { PDFDocument } from '../models/pdf-document.model';

/**
 * PDF Master Document Transformer
 * 
 * Transforms PDF semantic chunks into MasterDocument format for unified storage.
 * Following DEVELOPMENT_RULES.md: Single transformation principle - transform data ONCE
 * at entry point and use consistently throughout the pipeline.
 * 
 * Features:
 * - Converts SemanticChunk to MasterDocument
 * - Preserves all PDF-specific metadata and relationships
 * - Analyzes content for Kaspa-related topics
 * - Extracts hashtags, mentions, and links
 * - Maintains semantic grouping and hierarchy
 */
export class PDFMasterDocumentTransformer {
  /**
   * Transform a semantic chunk from PDF into MasterDocument format
   */
  static transformPDFChunkToMasterDocument(
    chunk: SemanticChunk,
    pdfDocument: PDFDocument,
    chunkIndex: number,
    pageNumber?: number,
  ): MasterDocument {
    const now = new Date().toISOString();
    
    return {
      // ==========================================
      // CORE FIELDS (Always Present)
      // ==========================================
      id: chunk.id,
      source: MessageSource.PDF,
      text: chunk.text,
      author: pdfDocument.author || 'Unknown',
      authorHandle: this.generateAuthorHandle(pdfDocument.author),
      createdAt: pdfDocument.creationDate || pdfDocument.uploadedAt,
      url: this.generateDocumentURL(pdfDocument, pageNumber),

      // ==========================================
      // PROCESSING METADATA (Always Present)
      // ==========================================
      processingStatus: ProcessingStatus.PROCESSED,
      processedAt: now,
      kaspaRelated: this.analyzeKaspaContent(chunk.text),
      kaspaTopics: this.extractKaspaTopics(chunk.text),
      hashtags: this.extractHashtags(chunk.text),
      mentions: this.extractMentions(chunk.text),
      links: this.extractLinks(chunk.text),
      language: this.detectLanguage(chunk.text),
      errors: [],
      retryCount: 0,

      // ==========================================
      // PDF-SPECIFIC FIELDS (Optional)
      // ==========================================

      // Document Information
      pdfFileName: pdfDocument.fileName,
      pdfDocumentId: pdfDocument.id,
      pdfTitle: pdfDocument.title,
      pdfAuthor: pdfDocument.author,
      pdfSubject: pdfDocument.subject,
      pdfPageCount: pdfDocument.pageCount,
      pdfFileSize: pdfDocument.fileSize,

      // Document Classification
      pdfDocumentType: pdfDocument.documentType,
      pdfCategory: pdfDocument.category,

      // Chunk Structure & Semantics
      pdfPageNumber: pageNumber,
      pdfChunkIndex: chunkIndex,
      pdfTotalChunks: pdfDocument.totalChunks,
      pdfSemanticGroupId: chunk.semanticGroupId,
      pdfSemanticLevel: chunk.semanticLevel,
      pdfSemanticContext: chunk.semanticContext,
      pdfChunkingStrategy: pdfDocument.chunkingStrategy,

      // Hierarchical Relationships
      pdfParentChunkId: chunk.parentChunkId,
      pdfChildChunkIds: chunk.childChunkIds,
      pdfSiblingChunkIds: chunk.siblingChunkIds,

      // Document Structure
      pdfSectionTitle: this.extractSectionTitle(chunk.text),
      pdfSectionLevel: this.determineSectionLevel(chunk.text),
      pdfHasStructure: this.hasDocumentStructure(chunk.text),

      // ==========================================
      // VECTOR & EMBEDDING FIELDS (Populated during storage)
      // ==========================================
      vector: undefined, // Will be populated by EmbeddingService
      vectorDimensions: undefined, // Will be populated by EmbeddingService
      embeddedAt: undefined, // Will be populated during embedding
      storedAt: undefined, // Will be populated during storage
    };
  }

  /**
   * Transform multiple PDF chunks in batch
   */
  static transformPDFChunksBatch(
    chunks: SemanticChunk[],
    pdfDocument: PDFDocument,
    pageNumbers?: number[],
  ): MasterDocument[] {
    return chunks.map((chunk, index) => 
      this.transformPDFChunkToMasterDocument(
        chunk,
        pdfDocument,
        index + 1, // 1-based indexing for chunks
        pageNumbers?.[index],
      )
    );
  }

  // ==========================================
  // CONTENT ANALYSIS HELPERS
  // ==========================================

  /**
   * Analyze if content is Kaspa-related
   */
  static analyzeKaspaContent(text: string): boolean {
    const kaspaTerms = [
      'kaspa',
      'kas',
      'ghostdag',
      'blockdag',
      'dag',
      'phantomghost',
      'phantom',
      'ghost',
      'pow',
      'proof of work',
      'mining',
      'blockchain',
      'cryptocurrency',
      'consensus',
      'protocol',
    ];

    const lowerText = text.toLowerCase();
    return kaspaTerms.some(term => lowerText.includes(term));
  }

  /**
   * Extract Kaspa-specific topics from text
   */
  static extractKaspaTopics(text: string): string[] {
    const topics: string[] = [];
    const lowerText = text.toLowerCase();

    const topicPatterns = [
      { pattern: /ghostdag|ghost\s*dag/gi, topic: 'ghostdag' },
      { pattern: /blockdag|block\s*dag/gi, topic: 'blockdag' },
      { pattern: /consensus|consensus\s*mechanism/gi, topic: 'consensus' },
      { pattern: /mining|miner|miners/gi, topic: 'mining' },
      { pattern: /scalability|scalable|throughput/gi, topic: 'scalability' },
      { pattern: /security|secure|safety/gi, topic: 'security' },
      { pattern: /protocol|network\s*protocol/gi, topic: 'protocol' },
      { pattern: /transaction|txn|transactions/gi, topic: 'transactions' },
      { pattern: /block|blocks|blockchain/gi, topic: 'blocks' },
      { pattern: /decentraliz|decentral/gi, topic: 'decentralization' },
    ];

    for (const { pattern, topic } of topicPatterns) {
      if (pattern.test(text)) {
        topics.push(topic);
      }
    }

    return [...new Set(topics)]; // Remove duplicates
  }

  /**
   * Extract hashtags from text
   */
  static extractHashtags(text: string): string[] {
    const hashtagPattern = /#[a-zA-Z0-9_]+/g;
    const matches = text.match(hashtagPattern);
    return matches ? matches.map(tag => tag.toLowerCase()) : [];
  }

  /**
   * Extract mentions from text
   */
  static extractMentions(text: string): string[] {
    const mentionPattern = /@[a-zA-Z0-9_]+/g;
    const matches = text.match(mentionPattern);
    return matches ? matches.map(mention => mention.toLowerCase()) : [];
  }

  /**
   * Extract links from text
   */
  static extractLinks(text: string): string[] {
    const linkPattern = /https?:\/\/[^\s]+/g;
    const matches = text.match(linkPattern);
    return matches || [];
  }

  /**
   * Detect language of text (simplified)
   */
  static detectLanguage(text: string): string {
    // Simplified language detection - in production you might use a proper library
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was', 'were'];
    const lowerText = text.toLowerCase();
    
    const englishWordCount = englishWords.filter(word => 
      new RegExp(`\\b${word}\\b`, 'g').test(lowerText)
    ).length;
    
    // If we find several English words, assume English
    return englishWordCount >= 3 ? 'en' : 'unknown';
  }

  // ==========================================
  // PDF STRUCTURE ANALYSIS HELPERS
  // ==========================================

  /**
   * Extract section title from chunk text
   */
  static extractSectionTitle(text: string): string | undefined {
    // Look for section headings at the beginning of the chunk
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length === 0) return undefined;
    
    const firstLine = lines[0];
    
    // Pattern matching for section titles
    const sectionPatterns = [
      /^(\d+\.?\s+)([A-Z][A-Za-z\s]+)$/, // "1. Introduction"
      /^([A-Z\s]{5,})$/, // "INTRODUCTION"
      /^([A-Z][a-z]+(\s[A-Z][a-z]+)*)$/, // "Introduction"
      /^(\d+\.\d+\.?\s+)([A-Z][A-Za-z\s]+)$/, // "1.1 Background"
    ];

    for (const pattern of sectionPatterns) {
      if (pattern.test(firstLine) && firstLine.length < 100) {
        return firstLine;
      }
    }

    return undefined;
  }

  /**
   * Determine section level from text
   */
  static determineSectionLevel(text: string): number | undefined {
    const sectionTitle = this.extractSectionTitle(text);
    if (!sectionTitle) return undefined;

    if (/^\d+\.\d+\.\d+/.test(sectionTitle)) return 3; // 1.1.1
    if (/^\d+\.\d+/.test(sectionTitle)) return 2; // 1.1
    if (/^\d+\.?/.test(sectionTitle)) return 1; // 1.
    if (sectionTitle === sectionTitle.toUpperCase()) return 1; // ALL CAPS
    
    return 2; // Default
  }

  /**
   * Check if document has clear structure
   */
  static hasDocumentStructure(text: string): boolean {
    const lines = text.split('\n');
    let structureIndicators = 0;

    // Look for numbered sections, headings, etc.
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^\d+\./.test(trimmed) || // "1."
          /^[A-Z\s]{10,}$/.test(trimmed) || // ALL CAPS HEADINGS
          /^\d+\.\d+/.test(trimmed)) { // "1.1"
        structureIndicators++;
      }
    }

    return structureIndicators >= 2; // At least 2 structural elements
  }

  // ==========================================
  // UTILITY HELPERS
  // ==========================================

  /**
   * Generate author handle from author name
   */
  static generateAuthorHandle(author?: string): string {
    if (!author) return 'unknown_author';
    
    return author
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 50); // Limit length
  }

  /**
   * Generate document URL for PDF chunk
   */
  static generateDocumentURL(pdfDocument: PDFDocument, pageNumber?: number): string {
    const baseUrl = `file://${pdfDocument.fileName}`;
    
    if (pageNumber) {
      return `${baseUrl}#page=${pageNumber}`;
    }
    
    return baseUrl;
  }

  /**
   * Create processing summary for logging
   */
  static createProcessingSummary(
    chunks: SemanticChunk[],
    pdfDocument: PDFDocument,
  ): {
    totalChunks: number;
    semanticGroups: number;
    hierarchicalLevels: number;
    kaspaRelatedChunks: number;
    averageTokensPerChunk: number;
  } {
    const uniqueGroups = new Set(chunks.map(chunk => chunk.semanticGroupId));
    const uniqueLevels = new Set(chunks.map(chunk => chunk.semanticLevel));
    const kaspaRelated = chunks.filter(chunk => this.analyzeKaspaContent(chunk.text));
    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);

    return {
      totalChunks: chunks.length,
      semanticGroups: uniqueGroups.size,
      hierarchicalLevels: uniqueLevels.size,
      kaspaRelatedChunks: kaspaRelated.length,
      averageTokensPerChunk: Math.round(totalTokens / chunks.length),
    };
  }
} 