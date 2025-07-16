import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AgentBuilder } from '../agent-builder.service';
import { BuiltAgent } from '../../models/agent.model';
import { QdrantRepositoryService } from '../../../database/qdrant/services/qdrant-repository.service';

@Injectable()
export class QdrantAgentFactory {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly qdrantRepository: QdrantRepositoryService,
  ) {}

  createAgent(): BuiltAgent {
    return (
      AgentBuilder.create(this.httpService, this.configService, 'qdrant-agent')
        .withDescription('Read-only agent for Qdrant vector database collections (all collections)')
        .withVersion('1.1.0')
        .withCategory('database')
        // List all collections
        .addCapability(
          'qdrant_list_collections',
          'List all Qdrant collections',
          [],
          ['list qdrant collections', 'show all collections'],
          async () => await this.qdrantRepository.listCollections(),
        )
        // Get collection info
        .addCapability(
          'qdrant_get_collection_info',
          'Get information about a specific Qdrant collection',
          [
            {
              name: 'collectionName',
              type: 'string',
              required: true,
              description: 'Name of the collection',
            },
          ],
          ['show qdrant collection info', 'get qdrant collection details'],
          async (args) => await this.qdrantRepository.getCollectionInfo(args.collectionName),
        )
        // Get collection stats
        .addCapability(
          'qdrant_get_collection_stats',
          'Get statistics for a specific Qdrant collection',
          [
            {
              name: 'collectionName',
              type: 'string',
              required: true,
              description: 'Name of the collection',
            },
          ],
          ['show qdrant collection stats', 'get qdrant stats'],
          async (args) => await this.qdrantRepository.getCollectionStats(args.collectionName),
        )
        // Search vectors in a collection
        .addCapability(
          'qdrant_search_vectors',
          'Search for similar vectors in a Qdrant collection',
          [
            {
              name: 'collectionName',
              type: 'string',
              required: true,
              description: 'Name of the collection',
            },
            {
              name: 'queryVector',
              type: 'array',
              required: true,
              description: 'Query vector (number array)',
            },
            {
              name: 'limit',
              type: 'number',
              required: false,
              description: 'Maximum number of results',
              default: 10,
            },
            {
              name: 'filters',
              type: 'object',
              required: false,
              description: 'Optional filter object',
            },
          ],
          ['find similar vectors', 'vector search in qdrant'],
          async (args) => await this.qdrantRepository.searchVectors(args.collectionName, args.queryVector, args.limit, args.filters),
        )
        // Get vector by ID from a collection
        .addCapability(
          'qdrant_get_vector_by_id',
          'Get a vector and its metadata by ID from a Qdrant collection',
          [
            {
              name: 'collectionName',
              type: 'string',
              required: true,
              description: 'Name of the collection',
            },
            {
              name: 'id',
              type: 'string',
              required: true,
              description: 'Vector (point) ID',
            },
          ],
          ['get vector by id', 'fetch qdrant point'],
          async (args) => await this.qdrantRepository.getVectorById(args.collectionName, args.id),
        )
        .build()
    );
  }
} 