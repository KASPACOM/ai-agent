import { Injectable, Logger } from '@nestjs/common';
import { QdrantClientService } from '../../../database/qdrant/services/qdrant-client.service';
import { QdrantCollectionService } from '../../../database/qdrant/services/qdrant-collection.service';
import { EmbeddingService } from '../../../embedding/embedding.service';
import { MasterDocument } from '../models/master-document.model';
import { MessageSource } from '../models/message-source.enum';
import { StorageOperationResult } from '../models/indexer-result.model';
import { IndexerConfigService } from '../config/indexer.config';
import { v5 as uuidv5 } from 'uuid';
import { EmbeddingTransformer } from '../transformers/embedding.transformer';

/**
 * Unified Storage Service
 *
 * Handles storage and retrieval of MasterDocument instances in the unified collection.
 * Following DEVELOPMENT_RULES.md: Single transformation principle - stores documents as-is,
 * no field mapping or multiple transformations.
 */
@Injectable()
export class UnifiedStorageService {
  private readonly logger = new Logger(UnifiedStorageService.name);

  constructor(
    private readonly qdrantClient: QdrantClientService,
    private readonly qdrantCollection: QdrantCollectionService,
    private readonly embeddingService: EmbeddingService,
    private readonly config: IndexerConfigService, // ✅ Use configuration service
  ) {}

  /**
   * Get the collection name used for unified storage
   */
  getCollectionName(): string {
    return this.config.getUnifiedMessagesCollectionName();
  }

  /**
   * Store multiple MasterDocument instances in batch
   * Handles embedding generation and vector storage
   */
  async storeBatch(
    documents: MasterDocument[],
  ): Promise<StorageOperationResult> {
    const result: StorageOperationResult = {
      success: false,
      stored: 0,
      failed: 0,
      errors: [],
      duplicatesSkipped: 0,
    };

    if (documents.length === 0) {
      this.logger.warn('No documents provided for batch storage');
      result.success = true;
      return result;
    }

    try {
      this.logger.log(
        `Storing ${documents.length} documents to unified collection`,
      );

      // Ensure collection exists
      await this.ensureCollectionExists();

      // Filter out documents without text (can't embed empty content)
      const validDocuments = documents.filter(
        (doc) => doc.text && doc.text.trim().length > 0,
      );
      const skippedCount = documents.length - validDocuments.length;

      if (skippedCount > 0) {
        this.logger.warn(`Skipped ${skippedCount} documents with empty text`);
      }

      if (validDocuments.length === 0) {
        result.success = true;
        result.failed = documents.length;
        result.errors.push('All documents had empty text content');
        return result;
      }

      // Generate embeddings for documents that don't have them
      const documentsToEmbed = validDocuments.filter((doc) => !doc.vector);
      let documentsWithVectors = validDocuments.filter((doc) => doc.vector);

      if (documentsToEmbed.length > 0) {
        const embeddingResult = await this.generateEmbeddings(documentsToEmbed);
        documentsWithVectors = [
          ...documentsWithVectors,
          ...embeddingResult.documents,
        ];
        result.errors.push(...embeddingResult.errors);
      }

      // Prepare points for Qdrant storage
      const points = documentsWithVectors.map((doc) => ({
        id: this.generatePointId(doc.id),
        vector: doc.vector!,
        payload: this.preparePayloadForStorage(doc),
      }));

      // Store in Qdrant using batches to avoid "Bad Request" errors
      const batchSize = this.config.getQdrantUpsertBatchSize();
      let totalStored = 0;
      const collectionName = this.config.getUnifiedMessagesCollectionName();

      this.logger.log(
        `Storing ${points.length} documents in ${Math.ceil(points.length / batchSize)} batches of ${batchSize}`,
      );

      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(points.length / batchSize);

        try {
          this.logger.debug(
            `Upserting batch ${batchNumber}/${totalBatches} (${batch.length} points)`,
          );

          const upsertResult = await this.qdrantClient.upsertPoints(
            collectionName,
            batch,
          );

          if (upsertResult) {
            totalStored += batch.length;
            this.logger.debug(
              `✅ Batch ${batchNumber}/${totalBatches} stored successfully`,
            );
          } else {
            throw new Error(`Batch ${batchNumber} upsert returned no result`);
          }
        } catch (batchError) {
          const errorMsg = `Failed to store batch ${batchNumber}/${totalBatches}: ${batchError.message}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
          result.failed += batch.length;
        }
      }

      result.stored = totalStored;
      result.failed = points.length - totalStored;
      result.success = totalStored > 0;

      this.logger.log(
        `Successfully stored ${result.stored}/${points.length} documents in unified collection`,
      );
    } catch (error) {
      this.logger.error(`Failed to store documents batch: ${error.message}`);
      result.errors.push(error.message);
      result.failed = documents.length;
    }

    return result;
  }

  /**
   * Store a single MasterDocument
   */
  async storeDocument(
    document: MasterDocument,
  ): Promise<StorageOperationResult> {
    return this.storeBatch([document]);
  }

  /**
   * Retrieve documents by source
   */
  async getBySource(
    source: MessageSource,
    limit: number = 100,
    offset: number = 0,
  ): Promise<MasterDocument[]> {
    try {
      this.logger.debug(`Retrieving ${limit} documents from source: ${source}`);

      const searchResult = await this.qdrantClient.searchPoints(
        this.config.getUnifiedMessagesCollectionName(),
        {
          vector: new Array(this.config.getVectorDimensions()).fill(0), // Dummy vector for filter-only search
          limit,
          offset,
          filter: {
            must: [
              {
                key: 'source',
                match: { value: source },
              },
            ],
          },
        },
      );

      return searchResult.points.map((point) =>
        this.convertPayloadToMasterDocument(point.payload),
      );
    } catch (error) {
      this.logger.error(
        `Failed to retrieve documents by source ${source}: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Get latest message date for a specific source and account/channel
   */
  async getLatestMessageDate(
    source: MessageSource,
    accountOrChannel: string,
  ): Promise<Date | undefined> {
    try {
      // Different filter logic based on source
      let filter: any;

      if (source === MessageSource.TELEGRAM) {
        filter = {
          must: [
            { key: 'source', match: { value: source } },
            { key: 'telegramChannelTitle', match: { value: accountOrChannel } },
          ],
        };
      } else if (source === MessageSource.TWITTER) {
        filter = {
          must: [
            { key: 'source', match: { value: source } },
            {
              key: 'authorHandle',
              match: { value: accountOrChannel.toLowerCase() },
            },
          ],
        };
      } else {
        throw new Error(
          `Unsupported source for latest message date: ${source}`,
        );
      }

      const searchResult = await this.qdrantClient.searchPoints(
        this.config.getUnifiedMessagesCollectionName(),
        {
          vector: new Array(this.config.getVectorDimensions()).fill(0), // Dummy vector for filter-only search
          limit: 1,
          filter,
          sort: [{ key: 'createdAt', direction: 'desc' }],
        },
      );

      // Handle cases where searchResult or points might be undefined
      if (searchResult?.points?.length > 0) {
        const latestMessage = searchResult.points[0];
        if (latestMessage?.payload?.createdAt) {
          return new Date(latestMessage.payload.createdAt);
        }
      }

      return undefined;
    } catch (error) {
      this.logger.error(
        `Failed to get latest message date for ${accountOrChannel}: ${error.message}`,
      );
      return undefined;
    }
  }

  /**
   * Generate embeddings for documents that don't have them
   */
  private async generateEmbeddings(documents: MasterDocument[]): Promise<{
    documents: MasterDocument[];
    errors: string[];
  }> {
    const result = {
      documents: [] as MasterDocument[],
      errors: [] as string[],
    };

    try {
      // Extract texts for bulk embedding
      const texts = documents.map((doc) => doc.text);

      // ✅ Use static transformer to create EmbeddingRequest
      const embeddingRequest = EmbeddingTransformer.createEmbeddingRequest(
        texts,
        EmbeddingTransformer.getDefaultEmbeddingModel(),
        EmbeddingTransformer.createBatchId('unified_storage'),
      );

      // Validate request
      const validationErrors =
        EmbeddingTransformer.validateEmbeddingRequest(embeddingRequest);
      if (validationErrors.length > 0) {
        throw new Error(
          `Invalid embedding request: ${validationErrors.join(', ')}`,
        );
      }

      // Generate embeddings in bulk (more efficient)
      const embeddingResponse =
        await this.embeddingService.generateEmbeddings(embeddingRequest);

      // ✅ Use static transformer to apply embeddings to documents
      const { updatedDocuments, errors } =
        EmbeddingTransformer.applyEmbeddingsToDocuments(
          documents,
          embeddingResponse,
        );

      result.documents.push(...updatedDocuments);
      result.errors.push(...errors);
    } catch (error) {
      this.logger.error(`Failed to generate embeddings: ${error.message}`);
      result.errors.push(`Bulk embedding generation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Prepare document payload for Qdrant storage
   * Only converts Date objects to ISO strings, keeps all other data as-is
   */
  private preparePayloadForStorage(document: MasterDocument): any {
    return {
      ...document,
      // Add storage metadata
      storedAt: new Date().toISOString(),
      // Remove vector from payload (stored separately)
      vector: undefined,
    };
  }

  /**
   * Convert Qdrant payload back to MasterDocument
   */
  private convertPayloadToMasterDocument(payload: any): MasterDocument {
    return {
      ...payload,
      // Convert ISO strings back to proper types if needed by the application
      // For now, keep as strings for consistency
    } as MasterDocument;
  }

  /**
   * Generate consistent point ID for Qdrant
   */
  private generatePointId(documentId: string): string {
    return uuidv5(documentId, this.config.getUnifiedMessagesUuidNamespace());
  }

  /**
   * Ensure the unified collection exists
   */
  private async ensureCollectionExists(): Promise<void> {
    try {
      const collectionName = this.config.getUnifiedMessagesCollectionName();

      // Check if collection exists, create if not
      const exists = await this.qdrantClient.collectionExists(collectionName);

      if (!exists) {
        this.logger.log(`Creating unified collection: ${collectionName}`);
        // ✅ Create collection with proper vector configuration
        await this.qdrantClient.createCollection(collectionName, {
          vectors: {
            size: this.config.getVectorDimensions(),
            distance: this.config.getVectorDistance(),
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });
        this.logger.log(`✅ Created unified collection: ${collectionName}`);
      }
    } catch (error) {
      // Handle race condition: if another process created the collection, that's actually success
      if (
        error.message?.includes('Conflict') ||
        error.message?.includes('already exists')
      ) {
        this.logger.debug(
          `Collection ${this.config.getUnifiedMessagesCollectionName()} already exists (created by another process)`,
        );
        return; // This is actually success - another process created it
      }

      // For other errors, log and throw
      this.logger.error(
        `Failed to ensure collection existence: ${error.message}`,
      );
      throw error;
    }
  }
}
