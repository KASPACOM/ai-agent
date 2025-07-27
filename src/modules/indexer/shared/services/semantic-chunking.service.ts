import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../../../embedding/embedding.service';
import { ChunkingStrategy } from '../models/master-document.model';
import { v4 as uuidv4 } from 'uuid';

/**
 * Semantic Text Chunk Interface
 */
export interface SemanticChunk {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  sentences: string[];
  semanticGroupId: string;
  semanticContext: string;
  semanticLevel: number;
  parentChunkId?: string;
  childChunkIds?: string[];
  siblingChunkIds?: string[];
  tokenCount: number;
  confidence: number; // Semantic coherence confidence (0-1)
}

/**
 * Semantic Chunking Options
 */
export interface SemanticChunkingOptions {
  strategy: ChunkingStrategy;
  maxTokensPerChunk: number;
  minTokensPerChunk: number;
  overlapTokens: number;
  sentenceWindowSize: number; // Number of sentences to analyze together
  semanticThreshold: number; // Cosine similarity threshold for topic boundaries
  maxHierarchyLevels: number; // Maximum depth for hierarchical chunking
  preserveStructure: boolean; // Respect document headings/paragraphs
}

/**
 * Sentence with Embeddings
 */
interface SentenceEmbedding {
  sentence: string;
  embedding: number[];
  index: number;
  tokenCount: number;
}

/**
 * Topic Boundary Detection Result
 */
interface TopicBoundary {
  sentenceIndex: number;
  similarityDrop: number;
  confidence: number;
  context: string;
}

/**
 * Semantic Chunking Service
 * 
 * Implements advanced semantic chunking using embeddings to detect topic boundaries.
 * Handles hierarchical chunking when semantic chunks are too large.
 * 
 * Algorithm:
 * 1. Split text into sentences
 * 2. Create rolling windows of sentences
 * 3. Generate embeddings for each window
 * 4. Calculate semantic distances between adjacent windows
 * 5. Identify topic boundaries where similarity drops significantly
 * 6. Create chunks based on semantic boundaries
 * 7. If chunks too large, recursively sub-chunk while preserving relationships
 */
@Injectable()
export class SemanticChunkingService {
  private readonly logger = new Logger(SemanticChunkingService.name);

  constructor(private readonly embeddingService: EmbeddingService) {}

  /**
   * Performs semantic chunking on input text
   */
  async performSemanticChunking(
    text: string,
    options: SemanticChunkingOptions,
  ): Promise<SemanticChunk[]> {
    this.logger.log(`Starting semantic chunking for ${text.length} characters`);

    try {
      // Step 1: Split into sentences
      const sentences = this.splitIntoSentences(text);
      this.logger.debug(`Split into ${sentences.length} sentences`);

      // Step 2: Generate embeddings for sentence windows
      const sentenceEmbeddings = await this.generateSentenceEmbeddings(
        sentences,
        options.sentenceWindowSize,
      );

      // Step 3: Detect topic boundaries using semantic similarity
      const topicBoundaries = this.detectTopicBoundaries(
        sentenceEmbeddings,
        options.semanticThreshold,
      );

      // Step 4: Create initial semantic chunks
      const initialChunks = this.createSemanticChunks(
        sentences,
        topicBoundaries,
        options,
      );

      // Step 5: Handle oversized chunks with hierarchical splitting
      const finalChunks = await this.handleOversizedChunks(
        initialChunks,
        options,
      );

      // Step 6: Establish relationships between chunks
      this.establishChunkRelationships(finalChunks);

      this.logger.log(`Generated ${finalChunks.length} semantic chunks`);
      return finalChunks;
    } catch (error) {
      this.logger.error(`Semantic chunking failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Splits text into sentences using improved sentence boundary detection
   */
  private splitIntoSentences(text: string): string[] {
    // Enhanced sentence splitting that handles academic text better
    const sentences = text
      .split(/(?<=[.!?])\s+(?=[A-Z])/) // Basic sentence boundaries
      .filter(sentence => sentence.trim().length > 10) // Filter out very short sentences
      .map(sentence => sentence.trim());

    return sentences;
  }

  /**
   * Generates embeddings for sentence windows to capture semantic context
   */
  private async generateSentenceEmbeddings(
    sentences: string[],
    windowSize: number,
  ): Promise<SentenceEmbedding[]> {
    const sentenceEmbeddings: SentenceEmbedding[] = [];

    for (let i = 0; i < sentences.length; i++) {
      // Create rolling window of sentences
      const windowStart = Math.max(0, i - Math.floor(windowSize / 2));
      const windowEnd = Math.min(sentences.length, windowStart + windowSize);
      const window = sentences.slice(windowStart, windowEnd);
      const windowText = window.join(' ');

      try {
        // Generate embedding for this window
        const response = await this.embeddingService.generateSingleEmbedding(windowText);
        
        if (response.success && response.embedding) {
          sentenceEmbeddings.push({
            sentence: sentences[i],
            embedding: response.embedding.vector,
            index: i,
            tokenCount: this.estimateTokenCount(sentences[i]),
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to generate embedding for sentence ${i}: ${error.message}`);
      }
    }

    return sentenceEmbeddings;
  }

  /**
   * Detects topic boundaries by analyzing semantic similarity between sentence windows
   */
  private detectTopicBoundaries(
    sentenceEmbeddings: SentenceEmbedding[],
    threshold: number,
  ): TopicBoundary[] {
    const boundaries: TopicBoundary[] = [];

    for (let i = 1; i < sentenceEmbeddings.length; i++) {
      const prev = sentenceEmbeddings[i - 1];
      const curr = sentenceEmbeddings[i];

      // Calculate cosine similarity between adjacent embeddings
      const similarity = this.cosineSimilarity(prev.embedding, curr.embedding);
      
      // Calculate the drop in similarity (larger drops indicate topic changes)
      const similarityDrop = i > 1 
        ? this.cosineSimilarity(sentenceEmbeddings[i - 2].embedding, prev.embedding) - similarity
        : 0;

      // If similarity drops significantly, mark as topic boundary
      if (similarityDrop > threshold && similarity < 0.8) {
        boundaries.push({
          sentenceIndex: i,
          similarityDrop,
          confidence: Math.min(1.0, similarityDrop / threshold),
          context: this.generateContextDescription(prev.sentence, curr.sentence),
        });
      }
    }

    this.logger.debug(`Detected ${boundaries.length} topic boundaries`);
    return boundaries;
  }

  /**
   * Creates semantic chunks based on detected topic boundaries
   */
  private createSemanticChunks(
    sentences: string[],
    boundaries: TopicBoundary[],
    options: SemanticChunkingOptions,
  ): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    let chunkStart = 0;

    // Add boundary at the end to process final chunk
    const allBoundaries = [...boundaries, { sentenceIndex: sentences.length, similarityDrop: 0, confidence: 1, context: 'document_end' }];

    for (const boundary of allBoundaries) {
      const chunkEnd = boundary.sentenceIndex;
      const chunkSentences = sentences.slice(chunkStart, chunkEnd);
      
      if (chunkSentences.length > 0) {
        const chunkText = chunkSentences.join(' ');
        const tokenCount = this.estimateTokenCount(chunkText);

        chunks.push({
          id: uuidv4(),
          text: chunkText,
          startIndex: chunkStart,
          endIndex: chunkEnd,
          sentences: chunkSentences,
          semanticGroupId: uuidv4(),
          semanticContext: boundary.context || this.generateSemanticContext(chunkSentences),
          semanticLevel: 1, // Top level
          tokenCount,
          confidence: boundary.confidence || 0.8,
        });
      }

      chunkStart = chunkEnd;
    }

    return chunks;
  }

  /**
   * Handles chunks that exceed size limits by hierarchically splitting them
   */
  private async handleOversizedChunks(
    chunks: SemanticChunk[],
    options: SemanticChunkingOptions,
  ): Promise<SemanticChunk[]> {
    const processedChunks: SemanticChunk[] = [];

    for (const chunk of chunks) {
      if (chunk.tokenCount <= options.maxTokensPerChunk) {
        // Chunk is fine as-is
        processedChunks.push(chunk);
      } else {
        // Chunk too large - need to sub-chunk while preserving semantic meaning
        this.logger.debug(`Sub-chunking oversized chunk: ${chunk.tokenCount} tokens`);
        
        const subChunks = await this.createHierarchicalSubChunks(chunk, options);
        
        // Update parent chunk to reference children
        chunk.childChunkIds = subChunks.map(sub => sub.id);
        chunk.text = this.createSummaryFromSubChunks(subChunks); // Shortened summary
        chunk.tokenCount = this.estimateTokenCount(chunk.text);
        
        processedChunks.push(chunk, ...subChunks);
      }
    }

    return processedChunks;
  }

  /**
   * Creates hierarchical sub-chunks from oversized chunks
   */
  private async createHierarchicalSubChunks(
    parentChunk: SemanticChunk,
    options: SemanticChunkingOptions,
  ): Promise<SemanticChunk[]> {
    // Recursively apply semantic chunking to the oversized chunk
    const subChunkOptions: SemanticChunkingOptions = {
      ...options,
      maxTokensPerChunk: Math.floor(options.maxTokensPerChunk * 0.8), // Slightly smaller
      semanticThreshold: options.semanticThreshold * 0.8, // More sensitive
    };

    const subChunks = await this.performSemanticChunking(parentChunk.text, subChunkOptions);
    
    return subChunks.map((subChunk, index) => ({
      ...subChunk,
      semanticGroupId: parentChunk.semanticGroupId, // Keep same semantic group
      semanticLevel: parentChunk.semanticLevel + 1, // Next level down
      parentChunkId: parentChunk.id,
    }));
  }

  /**
   * Establishes sibling relationships between chunks in the same semantic group
   */
  private establishChunkRelationships(chunks: SemanticChunk[]): void {
    // Group chunks by semantic group and level
    const groupedChunks = new Map<string, SemanticChunk[]>();
    
    chunks.forEach(chunk => {
      const key = `${chunk.semanticGroupId}_${chunk.semanticLevel}`;
      if (!groupedChunks.has(key)) {
        groupedChunks.set(key, []);
      }
      groupedChunks.get(key)!.push(chunk);
    });

    // Set sibling relationships
    groupedChunks.forEach(siblings => {
      if (siblings.length > 1) {
        siblings.forEach(chunk => {
          chunk.siblingChunkIds = siblings
            .filter(sibling => sibling.id !== chunk.id)
            .map(sibling => sibling.id);
        });
      }
    });
  }

  /**
   * Utility: Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Utility: Estimate token count (rough approximation)
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 1.3); // ~1.3 tokens per word
  }

  /**
   * Utility: Generate semantic context description
   */
  private generateSemanticContext(sentences: string[]): string {
    // Extract key terms and create brief context description
    const allText = sentences.join(' ');
    const words = allText.toLowerCase().split(/\s+/);
    
    // Simple keyword extraction (could be enhanced with NLP)
    const keyWords = words
      .filter(word => word.length > 4)
      .filter(word => !['that', 'this', 'with', 'from', 'they', 'were', 'been', 'have'].includes(word))
      .slice(0, 5);
    
    return keyWords.join(', ');
  }

  /**
   * Utility: Generate context description from sentence transition
   */
  private generateContextDescription(prevSentence: string, currSentence: string): string {
    // Extract key concepts from the transition point
    const prevWords = prevSentence.toLowerCase().split(/\s+/).slice(-5);
    const currWords = currSentence.toLowerCase().split(/\s+/).slice(0, 5);
    
    return [...prevWords, '→', ...currWords].join(' ');
  }

  /**
   * Utility: Create summary from sub-chunks
   */
  private createSummaryFromSubChunks(subChunks: SemanticChunk[]): string {
    return subChunks
      .map(chunk => chunk.sentences[0]) // First sentence of each sub-chunk
      .join(' ')
      .substring(0, 500) + '...'; // Truncate to reasonable length
  }
} 