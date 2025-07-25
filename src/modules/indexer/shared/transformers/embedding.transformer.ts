import {
  MasterDocument,
  ProcessingStatus,
} from '../models/master-document.model';
import {
  EmbeddingRequest,
  EmbeddingResponse,
} from '../../../etl/models/embedding.model';
import { EmbeddingModel } from '../../../etl/models/etl.enums';

/**
 * Embedding Transformer
 *
 * Static transformer class for embedding-related transformations.
 * Following DEVELOPMENT_RULES.md: All object building logic in static transformers.
 */
export class EmbeddingTransformer {
  /**
   * Transform array of texts into EmbeddingRequest
   */
  static createEmbeddingRequest(
    texts: string[],
    model: EmbeddingModel = EmbeddingModel.TEXT_EMBEDDING_3_LARGE,
    batchId?: string,
  ): EmbeddingRequest {
    return {
      texts,
      model,
      batchId: batchId || `batch_${Date.now()}`,
      metadata: {
        requestedAt: new Date().toISOString(),
        textCount: texts.length,
      },
    };
  }

  /**
   * Transform EmbeddingResponse into updated MasterDocuments
   */
  static applyEmbeddingsToDocuments(
    documents: MasterDocument[],
    embeddingResponse: EmbeddingResponse,
  ): { updatedDocuments: MasterDocument[]; errors: string[] } {
    const updatedDocuments: MasterDocument[] = [];
    const errors: string[] = [];

    if (!embeddingResponse.success) {
      errors.push(
        `Embedding generation failed: ${embeddingResponse.errors?.join(', ')}`,
      );
      return { updatedDocuments, errors };
    }

    if (documents.length !== embeddingResponse.embeddings.length) {
      errors.push(
        `Document count (${documents.length}) does not match embedding count (${embeddingResponse.embeddings.length})`,
      );
      return { updatedDocuments, errors };
    }

    const now = new Date().toISOString();

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const embeddingVector = embeddingResponse.embeddings[i];

      if (
        embeddingVector &&
        embeddingVector.vector &&
        embeddingVector.vector.length > 0
      ) {
        const updatedDoc: MasterDocument = {
          ...doc,
          vector: embeddingVector.vector,
          vectorDimensions: embeddingVector.vector.length,
          embeddedAt: now,
          processingStatus: ProcessingStatus.EMBEDDED,
        };
        updatedDocuments.push(updatedDoc);
      } else {
        errors.push(`Failed to generate embedding for document: ${doc.id}`);
      }
    }

    return { updatedDocuments, errors };
  }

  /**
   * Validate embedding configuration
   */
  static validateEmbeddingRequest(request: EmbeddingRequest): string[] {
    const errors: string[] = [];

    if (!request.texts || request.texts.length === 0) {
      errors.push('EmbeddingRequest must contain at least one text');
    }

    if (!request.model) {
      errors.push('EmbeddingRequest must specify a model');
    }

    if (
      request.texts &&
      request.texts.some((text) => !text || text.trim().length === 0)
    ) {
      errors.push('EmbeddingRequest contains empty or invalid texts');
    }

    return errors;
  }

  /**
   * Get default embedding model from configuration
   */
  static getDefaultEmbeddingModel(): EmbeddingModel {
    return EmbeddingModel.TEXT_EMBEDDING_3_LARGE;
  }

  /**
   * Create batch ID for embedding requests
   */
  static createBatchId(prefix: string = 'batch'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
