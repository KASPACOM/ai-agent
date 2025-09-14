import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AgentBuilder } from '../agent-builder.service';
import { BuiltAgent } from '../../models/agent.model';
import { QdrantRepository } from '../../../database/qdrant/services/qdrant.repository';
import { AgentTaskService } from '../../services/agent-task.service';
import { MessageSource } from '../../../indexer/shared/models/message-source.enum';

@Injectable()
export class QdrantAgentFactory {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly qdrantRepository: QdrantRepository,
    private readonly agentTasks: AgentTaskService,
  ) {}

  createAgent(): BuiltAgent {
    return (
      AgentBuilder.create(this.httpService, this.configService, 'qdrant-agent')
        .withDescription(
          'Read-only agent for Qdrant vector database collections (all collections)',
        )
        .withVersion('1.1.0')
        .withCategory('database')
        // List all collections
        // .addCapability(
        //   'qdrant_list_collections',
        //   'List all Qdrant collections',
        //   [],
        //   ['list qdrant collections', 'show all collections'],
        //   async () => await this.qdrantRepository.listCollections(),
        // )
        // Get collection info
        // .addCapability(
        //   'qdrant_get_collection_info',
        //   'Get information about a specific Qdrant collection',
        //   [
        //     {
        //       name: 'collectionName',
        //       type: 'string',
        //       required: true,
        //       description: 'Name of the collection',
        //     },
        //   ],
        //   ['show qdrant collection info', 'get qdrant collection details'],
        //   async (args) =>
        //     await this.qdrantRepository.getCollectionInfo(args.collectionName),
        // )
        // Get collection stats
        // .addCapability(
        //   'qdrant_get_collection_stats',
        //   'Get statistics for a specific Qdrant collection',
        //   [
        //     {
        //       name: 'collectionName',
        //       type: 'string',
        //       required: true,
        //       description: 'Name of the collection',
        //     },
        //   ],
        //   ['show qdrant collection stats', 'get qdrant stats'],
        //   async (args) =>
        //     await this.qdrantRepository.getCollectionStats(args.collectionName),
        // )
        // Search vectors in a collection
        // .addCapability(
        //   'qdrant_search_vectors',
        //   'Search for similar vectors in a Qdrant collection',
        //   [
        //     {
        //       name: 'collectionName',
        //       type: 'string',
        //       required: true,
        //       description: 'Name of the collection',
        //     },
        //     {
        //       name: 'queryVector',
        //       type: 'array',
        //       required: true,
        //       description: 'Query vector (number array)',
        //     },
        //     {
        //       name: 'limit',
        //       type: 'number',
        //       required: false,
        //       description: 'Maximum number of results',
        //       default: 10,
        //     },
        //     {
        //       name: 'filters',
        //       type: 'object',
        //       required: false,
        //       description: 'Optional filter object',
        //     },
        //   ],
        //   ['find similar vectors', 'vector search in qdrant'],
        //   async (args) =>
        //     await this.qdrantRepository.searchVectors(
        //       args.collectionName,
        //       args.queryVector,
        //       args.limit,
        //       args.filters,
        //     ),
        // )
        // Get vector by ID from a collection
        // .addCapability(
        //   'qdrant_get_vector_by_id',
        //   'Get a vector and its metadata by ID from a Qdrant collection',
        //   [
        //     {
        //       name: 'collectionName',
        //       type: 'string',
        //       required: true,
        //       description: 'Name of the collection',
        //     },
        //     {
        //       name: 'id',
        //       type: 'string',
        //       required: true,
        //       description: 'Vector (point) ID',
        //     },
        //   ],
        //   ['get vector by id', 'fetch qdrant point'],
        //   async (args) =>
        //     await this.qdrantRepository.getVectorById(
        //       args.collectionName,
        //       args.id,
        //     ),
        // )
        // Search tweets by subject using embedding similarity
        .addCapability(
          'qdrant_search_tweets_by_subject_embedding',
          'Search tweets by subject using embedding similarity (converts subject to embedding and finds related tweets)',
          [
            {
              name: 'subject',
              type: 'string',
              required: true,
              description:
                'Subject or keyword to search for (will be embedded)',
            },
            {
              name: 'limit',
              type: 'number',
              required: false,
              description: 'Maximum number of tweets to return',
              default: 5,
            },
            {
              name: 'filters',
              type: 'object',
              required: false,
              description:
                'Optional filter object (e.g., { authorHandle: "foo" })',
            },
          ],
          [
            'semantic tweet search',
            'find tweets about (semantic)',
            'tweets related to',
          ],
          async (args) =>
            await this.qdrantRepository.searchTweetsBySubjectEmbedding(
              args.subject,
              args.limit,
              args.filters,
            ),
        )
        // Weekly summary capability
        .addCapability(
          'qdrant_create_weekly_summary',
          'Create a weekly digest of Telegram and Twitter messages from the last N days',
          [
            {
              name: 'days',
              type: 'number',
              required: false,
              description: 'How many days back to include (default 7)',
              default: 7,
            },
            {
              name: 'sources',
              type: 'object',
              required: false,
              description:
                'Sources to include as array of strings (twitter, telegram)',
              default: ['TWITTER'],
            },
          ],
          [
            'weekly summary',
            'weekly digest',
            'past week recap',
            'public summary',
            'create weekly summary',
          ],
          async (args) => {
            const raw = Array.isArray(args?.sources)
              ? args.sources
              : Array.isArray(args?.source)
                ? args.source
                : args?.source
                  ? [args.source]
                  : undefined;
            const norm = (raw ?? ['TWITTER', 'TELEGRAM'])
              .map((s: string) => String(s).toUpperCase())
              .filter((s: string) => s === 'TWITTER' || s === 'TELEGRAM');
            const selected: MessageSource[] = [];
            if (norm.includes('TWITTER')) selected.push(MessageSource.TWITTER);
            if (norm.includes('TELEGRAM'))
              selected.push(MessageSource.TELEGRAM);
            return this.agentTasks.createWeeklySummary(
              args?.days ?? 7,
              selected,
            );
          },
        )
        .build()
    );
  }
}
