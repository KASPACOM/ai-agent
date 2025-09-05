import { Injectable, Logger } from '@nestjs/common';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import {
  PDFDocument,
  PDFMetadata,
  PDFTextExtractionResult,
  PDFStructure,
  PDFHeading,
  PDFSection,
  PDFParagraph,
  PDFProcessingStatus,
} from '../models/pdf-document.model';
import {
  PDFDocumentType,
  ChunkingStrategy,
} from '../../shared/models/master-document.model';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// Dynamic imports for PDF parsing libraries
let pdfParse: any;
let pdfLib: any;

/**
 * PDF Parser Service
 *
 * Handles PDF text extraction, metadata parsing, and structure analysis.
 * Uses pdf-parse for text extraction and pdf-lib for advanced metadata.
 *
 * Features:
 * - Text extraction with page-level granularity
 * - Metadata extraction (title, author, creation date, etc.)
 * - Document structure analysis (headings, sections)
 * - Error handling for corrupted or encrypted PDFs
 * - Support for various PDF versions and formats
 */
@Injectable()
export class PDFParserService {
  private readonly logger = new Logger(PDFParserService.name);

  constructor(private readonly config: IndexerConfigService) {
    this.initializePDFLibraries();
  }

  /**
   * Initialize PDF parsing libraries dynamically
   */
  private async initializePDFLibraries(): Promise<void> {
    try {
      // Dynamic import to handle optional dependencies
      const pdfParseModule = await import('pdf-parse');
      const pdfLibModule = await import('pdf-lib');

      // Handle both CommonJS and ES module exports
      pdfParse = pdfParseModule.default || pdfParseModule;
      pdfLib = pdfLibModule.default || pdfLibModule;

      this.logger.log('PDF parsing libraries initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize PDF libraries:', error.message);
      throw new Error(
        'PDF parsing libraries not available. Please install pdf-parse and pdf-lib.',
      );
    }
  }

  /**
   * Parse PDF file and extract text, metadata, and structure
   */
  async parsePDF(
    filePath: string,
    fileName: string,
    options: {
      extractStructure?: boolean;
      documentType?: PDFDocumentType;
      category?: string;
    } = {},
  ): Promise<PDFDocument> {
    const startTime = Date.now();
    this.logger.log(`Starting PDF parsing for: ${fileName}`);

    try {
      // Read the PDF file
      const fileBuffer = await this.readPDFFile(filePath);
      const fileStats = fs.statSync(filePath);

      // Extract text and basic info
      const extractionResult = await this.extractTextFromPDF(
        fileBuffer,
        fileName,
      );

      // Create PDF document model
      const pdfDocument: PDFDocument = {
        id: this.generateDocumentId(fileName),
        fileName,
        filePath,
        title: extractionResult.metadata.title,
        author: extractionResult.metadata.author,
        subject: extractionResult.metadata.subject,
        keywords: extractionResult.metadata.keywords,
        creator: extractionResult.metadata.creator,
        producer: extractionResult.metadata.producer,
        creationDate: extractionResult.metadata.creationDate?.toISOString(),
        modificationDate:
          extractionResult.metadata.modificationDate?.toISOString(),
        pageCount: extractionResult.metadata.pageCount,
        fileSize: fileStats.size,
        documentType:
          options.documentType || this.detectDocumentType(extractionResult),
        category: options.category || this.detectCategory(extractionResult),
        uploadedAt: new Date().toISOString(),
        processingStatus: PDFProcessingStatus.PARSING,
        chunkingStrategy: ChunkingStrategy.SEMANTIC, // Default to semantic
        errors: extractionResult.extractionErrors,
      };

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `PDF parsing completed in ${processingTime}ms: ${fileName}`,
      );

      return pdfDocument;
    } catch (error) {
      this.logger.error(`PDF parsing failed for ${fileName}:`, error.message);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  /**
   * Extract text and metadata from PDF buffer
   */
  async extractTextFromPDF(
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<PDFTextExtractionResult> {
    try {
      // Use pdf-parse for text extraction
      const pdfData = await pdfParse(fileBuffer);

      // Extract page-level text
      const pageTexts = await this.extractPageTexts(fileBuffer);

      // Extract detailed metadata
      const metadata = await this.extractDetailedMetadata(fileBuffer);

      // Analyze document structure (optional enhancement)
      const structure = await this.analyzeDocumentStructure(
        pdfData.text,
        pageTexts,
      );

      return {
        text: pdfData.text,
        pageTexts,
        metadata: {
          ...metadata,
          pageCount: pdfData.numpages,
          fileSize: fileBuffer.length,
        },
        structure,
        extractionErrors: [],
      };
    } catch (error) {
      this.logger.error(
        `Text extraction failed for ${fileName}:`,
        error.message,
      );
      return {
        text: '',
        pageTexts: [],
        metadata: {
          pageCount: 0,
          fileSize: fileBuffer.length,
          isEncrypted: true, // Assume encryption if extraction fails
          hasFormFields: false,
          version: 'unknown',
        },
        extractionErrors: [error.message],
      };
    }
  }

  /**
   * Extract text from individual pages
   */
  private async extractPageTexts(fileBuffer: Buffer): Promise<string[]> {
    try {
      // This is a simplified implementation
      // In a production environment, you might want to use a more sophisticated
      // page-by-page extraction library like pdf2pic + OCR
      const pdfData = await pdfParse(fileBuffer);

      // Split text by page breaks (rough approximation)
      const pageTexts = pdfData.text
        .split(/\f|\n{3,}/)
        .filter((text) => text.trim().length > 0);

      return pageTexts;
    } catch (error) {
      this.logger.warn('Failed to extract page-level text:', error.message);
      return [];
    }
  }

  /**
   * Extract detailed metadata using pdf-lib
   */
  private async extractDetailedMetadata(
    fileBuffer: Buffer,
  ): Promise<PDFMetadata> {
    try {
      const pdfDoc = await pdfLib.PDFDocument.load(fileBuffer);

      const title = pdfDoc.getTitle();
      const author = pdfDoc.getAuthor();
      const subject = pdfDoc.getSubject();
      const keywords = pdfDoc.getKeywords();
      const creator = pdfDoc.getCreator();
      const producer = pdfDoc.getProducer();
      const creationDate = pdfDoc.getCreationDate();
      const modificationDate = pdfDoc.getModificationDate();

      return {
        title: title || undefined,
        author: author || undefined,
        subject: subject || undefined,
        keywords: keywords || undefined,
        creator: creator || undefined,
        producer: producer || undefined,
        creationDate: creationDate || undefined,
        modificationDate: modificationDate || undefined,
        pageCount: pdfDoc.getPageCount(),
        fileSize: fileBuffer.length,
        isEncrypted: false, // If we got here, it's not encrypted
        hasFormFields: pdfDoc.getForm().getFields().length > 0,
        version: pdfDoc.getVersion() || 'unknown',
      };
    } catch (error) {
      this.logger.warn('Failed to extract detailed metadata:', error.message);
      return {
        pageCount: 0,
        fileSize: fileBuffer.length,
        isEncrypted: false,
        hasFormFields: false,
        version: 'unknown',
      };
    }
  }

  /**
   * Analyze document structure for headings and sections
   */
  private async analyzeDocumentStructure(
    fullText: string,
    pageTexts: string[],
  ): Promise<PDFStructure> {
    try {
      const headings = this.detectHeadings(fullText);
      const sections = this.buildSections(headings);
      const paragraphs = this.extractParagraphs(fullText, pageTexts);

      return {
        headings,
        paragraphs,
        sections,
        hasTableOfContents: this.detectTableOfContents(fullText),
        hasImages: this.detectImages(fullText),
        hasTables: this.detectTables(fullText),
      };
    } catch (error) {
      this.logger.warn('Failed to analyze document structure:', error.message);
      return {
        headings: [],
        paragraphs: [],
        sections: [],
        hasTableOfContents: false,
        hasImages: false,
        hasTables: false,
      };
    }
  }

  /**
   * Detect headings in the text using patterns
   */
  private detectHeadings(text: string): PDFHeading[] {
    const headings: PDFHeading[] = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Pattern matching for common heading formats
      const headingPatterns = [
        /^(\d+\.?\s+)([A-Z][A-Za-z\s]+)$/, // "1. Introduction"
        /^([A-Z\s]{5,})$/, // "INTRODUCTION"
        /^([A-Z][a-z]+(\s[A-Z][a-z]+)*)$/, // "Introduction"
        /^(\d+\.\d+\.?\s+)([A-Z][A-Za-z\s]+)$/, // "1.1 Background"
      ];

      for (const pattern of headingPatterns) {
        const match = line.match(pattern);
        if (match && line.length < 100) {
          // Reasonable heading length
          const level = this.determineHeadingLevel(match[1] || line);
          headings.push({
            text: line,
            level,
            pageNumber: this.estimatePageNumber(i, lines.length, text.length),
            position: text.indexOf(line),
          });
          break;
        }
      }
    }

    return headings;
  }

  /**
   * Determine heading level based on formatting
   */
  private determineHeadingLevel(text: string): number {
    if (/^\d+\.\d+\.\d+/.test(text)) return 3; // 1.1.1
    if (/^\d+\.\d+/.test(text)) return 2; // 1.1
    if (/^\d+\.?/.test(text)) return 1; // 1.
    if (text === text.toUpperCase()) return 1; // ALL CAPS
    return 2; // Default
  }

  /**
   * Build hierarchical sections from headings
   */
  private buildSections(headings: PDFHeading[]): PDFSection[] {
    const sections: PDFSection[] = [];
    let currentSection: PDFSection | null = null;

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const nextHeading = headings[i + 1];

      const section: PDFSection = {
        title: heading.text,
        level: heading.level,
        startPage: heading.pageNumber,
        endPage: nextHeading ? nextHeading.pageNumber : heading.pageNumber,
        startPosition: heading.position,
        endPosition: nextHeading
          ? nextHeading.position
          : heading.position + heading.text.length,
        subsections: [],
      };

      if (heading.level === 1) {
        sections.push(section);
        currentSection = section;
      } else if (currentSection && heading.level > currentSection.level) {
        currentSection.subsections.push(section);
      } else {
        sections.push(section);
      }
    }

    return sections;
  }

  /**
   * Extract paragraphs with position information
   */
  private extractParagraphs(
    fullText: string,
    pageTexts: string[],
  ): PDFParagraph[] {
    const paragraphs: PDFParagraph[] = [];
    const paragraphTexts = fullText
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 50);

    for (const paragraphText of paragraphTexts) {
      const startPosition = fullText.indexOf(paragraphText);
      const pageNumber = this.estimatePageNumber(0, 0, startPosition);

      paragraphs.push({
        text: paragraphText.trim(),
        pageNumber,
        startPosition,
        endPosition: startPosition + paragraphText.length,
      });
    }

    return paragraphs;
  }

  /**
   * Utility methods for content detection
   */
  private detectTableOfContents(text: string): boolean {
    const tocPatterns = [/table\s+of\s+contents/i, /contents/i, /index/i];
    return tocPatterns.some((pattern) => pattern.test(text.substring(0, 1000)));
  }

  private detectImages(text: string): boolean {
    return /figure|image|fig\.|img/i.test(text);
  }

  private detectTables(text: string): boolean {
    return /table|tbl\.|tab\./i.test(text);
  }

  private estimatePageNumber(
    lineIndex: number,
    totalLines: number,
    textLength: number,
  ): number {
    // Rough estimation - assume ~50 lines per page
    return Math.max(1, Math.ceil(lineIndex / 50));
  }

  /**
   * Detect document type based on content analysis
   */
  private detectDocumentType(
    extractionResult: PDFTextExtractionResult,
  ): PDFDocumentType {
    const text = extractionResult.text.toLowerCase();

    if (text.includes('whitepaper') || text.includes('white paper')) {
      return PDFDocumentType.WHITEPAPER;
    }
    if (
      text.includes('research') ||
      text.includes('study') ||
      text.includes('analysis')
    ) {
      return PDFDocumentType.RESEARCH_PAPER;
    }
    if (
      text.includes('technical') ||
      text.includes('specification') ||
      text.includes('documentation')
    ) {
      return PDFDocumentType.TECHNICAL_DOCUMENTATION;
    }
    if (
      text.includes('report') ||
      text.includes('quarterly') ||
      text.includes('annual')
    ) {
      return PDFDocumentType.REPORT;
    }
    if (
      text.includes('academic') ||
      text.includes('university') ||
      text.includes('journal')
    ) {
      return PDFDocumentType.ACADEMIC_PAPER;
    }

    return PDFDocumentType.ARTICLE; // Default
  }

  /**
   * Detect document category based on content
   */
  private detectCategory(extractionResult: PDFTextExtractionResult): string {
    const text = extractionResult.text.toLowerCase();

    if (
      text.includes('kaspa') ||
      text.includes('blockchain') ||
      text.includes('cryptocurrency')
    ) {
      return 'blockchain';
    }
    if (
      text.includes('finance') ||
      text.includes('economic') ||
      text.includes('financial')
    ) {
      return 'finance';
    }
    if (
      text.includes('technology') ||
      text.includes('technical') ||
      text.includes('software')
    ) {
      return 'technology';
    }
    if (
      text.includes('research') ||
      text.includes('scientific') ||
      text.includes('academic')
    ) {
      return 'research';
    }

    return 'general';
  }

  /**
   * Generate unique document ID
   */
  private generateDocumentId(fileName: string): string {
    const timestamp = Date.now();
    const fileNameHash = fileName.replace(/[^a-zA-Z0-9]/g, '_');
    return `pdf_${fileNameHash}_${timestamp}`;
  }

  /**
   * Read PDF file from filesystem
   */
  private async readPDFFile(filePath: string): Promise<Buffer> {
    try {
      return fs.readFileSync(filePath);
    } catch (error) {
      throw new Error(`Failed to read PDF file: ${error.message}`);
    }
  }

  /**
   * Validate PDF file
   */
  async validatePDF(
    filePath: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check file exists
      if (!fs.existsSync(filePath)) {
        errors.push('File does not exist');
        return { valid: false, errors };
      }

      // Check file size
      const stats = fs.statSync(filePath);
      const maxSize = this.config.getPDFMaxFileSize();
      if (stats.size > maxSize) {
        errors.push(`File size ${stats.size} exceeds maximum ${maxSize} bytes`);
      }

      // Check file extension
      if (!path.extname(filePath).toLowerCase().includes('pdf')) {
        errors.push('File must have .pdf extension');
      }

      // Try to parse the PDF
      const fileBuffer = fs.readFileSync(filePath);
      await pdfParse(fileBuffer);

      return { valid: errors.length === 0, errors };
    } catch (error) {
      errors.push(`PDF validation failed: ${error.message}`);
      return { valid: false, errors };
    }
  }
}
