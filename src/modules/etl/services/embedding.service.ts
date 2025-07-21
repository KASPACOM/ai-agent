import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import {
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingVector,
  EmbeddingStats,
} from '../models/embedding.model';
import { EmbeddingModel } from '../models/etl.enums';
import { EtlConfigService } from '../config/etl.config';

/**
 * Embedding Service
 *
 * Handles text embedding generation using OpenAI
 * Provides batch processing, rate limiting, and comprehensive error handling
 */
@Injectable()
export class EmbeddingService {
  [x: string]: any;
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly openai: OpenAI;
  private readonly embeddingStats = {
    totalGenerated: 0,
    totalTokens: 0,
    totalCost: 0,
    averageProcessingTime: 0,
    modelBreakdown: {
      [EmbeddingModel.TEXT_EMBEDDING_3_SMALL]: 0,
      [EmbeddingModel.TEXT_EMBEDDING_3_LARGE]: 0,
      [EmbeddingModel.TEXT_EMBEDDING_ADA_002]: 0,
    },
    dailyStats: {} as Record<string, number>,
    errorRate: 0,
    errors: [] as string[],
  };

  constructor(private readonly etlConfig: EtlConfigService) {
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.logger.log('EmbeddingService initialized with OpenAI');
  }

  /**
   * Generate embeddings for text array
   * Uses OpenAI API with batch processing and rate limiting
   */
  async generateEmbeddings(
    request: EmbeddingRequest,
  ): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    this.logger.log(
      `Generating embeddings for ${request.texts.length} texts using model: ${request.model}`,
    );

    const embeddings: EmbeddingVector[] = [];
    const errors: string[] = [];
    let totalTokens = 0;

    try {
      // Process texts in batches to handle rate limits
      const batchSize = this.etlConfig.getEmbeddingConfig().maxBatchSize;
      const batches = this.chunkArray(request.texts, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        this.logger.log(
          `Processing batch ${i + 1}/${batches.length} (${batch.length} texts)`,
        );

        try {
          const batchResult = await this.processBatch(
            batch,
            request.model,
            request.batchId,
          );
          embeddings.push(...batchResult.embeddings);
          totalTokens += batchResult.totalTokens;

          // Add delay between batches to respect rate limits
          if (i < batches.length - 1) {
            await this.delay(1000); // 1 second delay between batches
          }
        } catch (error) {
          const errorMsg = `Batch ${i + 1} failed: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
          this.embeddingStats.errors.push(errorMsg);
        }
      }

      const processingTime = Date.now() - startTime;

      // Update statistics
      this.updateStatistics(
        embeddings.length,
        totalTokens,
        processingTime,
        request.model,
      );

      this.logger.log(
        `Embedding generation completed. Generated ${embeddings.length} embeddings in ${processingTime}ms`,
      );

      return {
        embeddings,
        success: embeddings.length > 0,
        errors: errors.length > 0 ? errors : undefined,
        processingTime,
        totalTokens,
        batchId: request.batchId,
      };
    } catch (error) {
      const errorMsg = `Embedding generation failed: ${error.message}`;
      this.logger.error(errorMsg);
      this.embeddingStats.errors.push(errorMsg);

      return {
        embeddings: [],
        success: false,
        errors: [errorMsg],
        processingTime: Date.now() - startTime,
        totalTokens: 0,
        batchId: request.batchId,
      };
    }
  }

  /**
   * Process a batch of texts
   */
  private async processBatch(
    texts: string[],
    model: EmbeddingModel,
    batchId?: string,
  ): Promise<{ embeddings: EmbeddingVector[]; totalTokens: number }> {
    const startTime = Date.now();

    try {
      // Call OpenAI API
      const response = await this.openai.embeddings.create({
        model: this.getOpenAIModelName(model),
        input: texts,
        encoding_format: 'float',
      });

      const embeddings: EmbeddingVector[] = [];
      const processingTime = Date.now() - startTime;

      // Process each embedding result
      for (let i = 0; i < response.data.length; i++) {
        const embeddingData = response.data[i];
        const sourceText = texts[i];

        const embedding: EmbeddingVector = {
          vector: embeddingData.embedding,
          dimensions: embeddingData.embedding.length,
          sourceText,
          sourceId: batchId ? `${batchId}_${i}` : `${Date.now()}_${i}`,
          model,
          generatedAt: new Date(),
          processingTime: processingTime / texts.length, // Average per text
          tokenCount: this.estimateTokenCount(sourceText),
          magnitude: this.calculateMagnitude(embeddingData.embedding),
          normalized: false,
        };

        embeddings.push(embedding);
      }

      return {
        embeddings,
        totalTokens: response.usage?.total_tokens || 0,
      };
    } catch (error) {
      this.logger.error(`OpenAI API call failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embedding for single text
   */
  async generateSingleEmbedding(text: string): Promise<number[]> {
    this.logger.log(
      `Generating single embedding for text: ${text.substring(0, 50)}...`,
    );

    try {
      const config = this.etlConfig.getEmbeddingConfig();
      const response = await this.generateEmbeddings({
        texts: [text],
        model: config.model,
        batchId: `single_${Date.now()}`,
      });

      if (response.success && response.embeddings.length > 0) {
        return response.embeddings[0].vector;
      } else {
        throw new Error(
          `Failed to generate embedding: ${response.errors?.join(', ')}`,
        );
      }
    } catch (error) {
      this.logger.error(`Single embedding generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Normalize embedding vectors
   */
  normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = this.calculateMagnitude(embedding);
    if (magnitude === 0) return embedding;

    return embedding.map((value) => value / magnitude);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    const dotProduct = embedding1.reduce(
      (sum, val, i) => sum + val * embedding2[i],
      0,
    );
    const magnitude1 = this.calculateMagnitude(embedding1);
    const magnitude2 = this.calculateMagnitude(embedding2);

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Calculate vector magnitude
   */
  private calculateMagnitude(vector: number[]): number {
    return Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  }

  /**
   * Get OpenAI model name from our enum
   */
  private getOpenAIModelName(model: EmbeddingModel): string {
    switch (model) {
      case EmbeddingModel.TEXT_EMBEDDING_3_SMALL:
        return 'text-embedding-3-small';
      case EmbeddingModel.TEXT_EMBEDDING_3_LARGE:
        return 'text-embedding-3-large';
      case EmbeddingModel.TEXT_EMBEDDING_ADA_002:
        return 'text-embedding-ada-002';
      default:
        return 'text-embedding-3-small';
    }
  }

  /**
   * Estimate token count for text
   */
  private estimateTokenCount(text: string): number {
    // Rough estimate: 4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update embedding statistics
   */
  private updateStatistics(
    generatedCount: number,
    tokenCount: number,
    processingTime: number,
    model: EmbeddingModel,
  ): void {
    this.embeddingStats.totalGenerated += generatedCount;
    this.embeddingStats.totalTokens += tokenCount;

    // Update average processing time
    const totalProcessingTime =
      this.embeddingStats.averageProcessingTime *
        (this.embeddingStats.totalGenerated - generatedCount) +
      processingTime;
    this.embeddingStats.averageProcessingTime =
      totalProcessingTime / this.embeddingStats.totalGenerated;

    // Update model breakdown
    this.embeddingStats.modelBreakdown[model] =
      (this.embeddingStats.modelBreakdown[model] || 0) + generatedCount;

    // Update daily stats
    const today = new Date().toISOString().split('T')[0];
    this.embeddingStats.dailyStats[today] =
      (this.embeddingStats.dailyStats[today] || 0) + generatedCount;

    // Calculate error rate
    const totalAttempts =
      this.embeddingStats.totalGenerated + this.embeddingStats.errors.length;
    this.embeddingStats.errorRate =
      totalAttempts > 0 ? this.embeddingStats.errors.length / totalAttempts : 0;
  }

  /**
   * Get embedding service status
   */
  async getEmbeddingStatus(): Promise<{
    isAvailable: boolean;
    model: string;
    dimensions: number;
    totalGenerated: number;
    errors: string[];
    stats: EmbeddingStats;
  }> {
    const config = this.etlConfig.getEmbeddingConfig();

    // Test API availability
    let isAvailable = false;
    try {
      await this.openai.models.retrieve(this.getOpenAIModelName(config.model));
      isAvailable = true;
    } catch (error) {
      this.logger.warn(`OpenAI API unavailable: ${error.message}`);
    }

    return {
      isAvailable,
      model: config.model,
      dimensions: config.dimensions,
      totalGenerated: this.embeddingStats.totalGenerated,
      errors: [...this.embeddingStats.errors],
      stats: {
        totalGenerated: this.embeddingStats.totalGenerated,
        totalTokens: this.embeddingStats.totalTokens,
        totalCost: this.embeddingStats.totalCost,
        averageProcessingTime: this.embeddingStats.averageProcessingTime,
        modelBreakdown: { ...this.embeddingStats.modelBreakdown },
        dailyStats: { ...this.embeddingStats.dailyStats },
        errorRate: this.embeddingStats.errorRate,
      },
    };
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.embeddingStats.errors = [];
    this.logger.log('Embedding error history cleared');
  }

  /**
   * Reset embedding statistics
   */
  resetStats(): void {
    this.embeddingStats.totalGenerated = 0;
    this.embeddingStats.totalTokens = 0;
    this.embeddingStats.totalCost = 0;
    this.embeddingStats.averageProcessingTime = 0;
    this.embeddingStats.modelBreakdown = {
      [EmbeddingModel.TEXT_EMBEDDING_3_SMALL]: 0,
      [EmbeddingModel.TEXT_EMBEDDING_3_LARGE]: 0,
      [EmbeddingModel.TEXT_EMBEDDING_ADA_002]: 0,
    };
    this.embeddingStats.dailyStats = {};
    this.embeddingStats.errorRate = 0;
    this.embeddingStats.errors = [];
    this.logger.log('Embedding statistics reset');
  }
}
