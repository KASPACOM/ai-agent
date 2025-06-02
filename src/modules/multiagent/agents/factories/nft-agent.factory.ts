import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AgentBuilder } from '../agent-builder.service';
import { BuiltAgent } from '../../models/agent.model';
import { BackendApiService } from '../../services/backend-api.service';

/**
 * NFTAgentFactory - Creates NFT agent with KRC721 collection and token capabilities
 */
@Injectable()
export class NFTAgentFactory {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly backendApiService: BackendApiService,
  ) {}

  createAgent(): BuiltAgent {
    return (
      AgentBuilder.create(this.httpService, this.configService, 'nft-agent')
        .withDescription(
          'NFT Agent for KRC721 collection information, floor prices, and NFT market data',
        )

        // === NFT Collection Information ===
        .addCapability(
          'nft_get_collection_info',
          'Get detailed information about an NFT collection',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description:
                'NFT collection ticker (e.g., Kaspunks, Ghostriders)',
            },
          ],
          [
            'tell me about Kaspunks',
            'Kaspunks collection info',
            'Ghostriders NFT details',
            'collection statistics',
          ],
          async (args) => {
            try {
              return await this.backendApiService.fetchNFTCollectionDetails(
                args.ticker,
              );
            } catch (error) {
              return {
                collection: args.ticker,
                error: `Failed to fetch collection info: ${error.message}`,
                type: 'KRC721 NFT Collection',
                network: 'Kaspa',
              };
            }
          },
        )

        .addCapability(
          'nft_get_floor_price',
          'Get floor price for an NFT collection',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'NFT collection ticker',
            },
          ],
          [
            'Kaspunks floor price',
            'what is the floor price for Ghostriders?',
            'cheapest Kaspunks NFT',
          ],
          async (args) => {
            try {
              const floorPrice = await this.backendApiService.getFloorPrice(
                args.ticker,
              );
              return {
                collection: args.ticker,
                floorPrice,
                currency: 'KAS',
                timestamp: new Date(),
              };
            } catch (error) {
              return {
                collection: args.ticker,
                error: `Failed to fetch floor price: ${error.message}`,
                floorPrice: null,
              };
            }
          },
        )

        .addCapability(
          'nft_list_collections',
          'List all NFT collections',
          [
            {
              name: 'limit',
              type: 'number',
              required: false,
              description: 'Maximum number of collections to return',
              default: 20,
            },
            {
              name: 'sortBy',
              type: 'string',
              required: false,
              description: 'Sort by: volume, floorPrice, holders',
              default: 'volume',
            },
          ],
          [
            'list NFT collections',
            'top NFT collections',
            'most popular NFTs',
            'show me all NFT collections',
          ],
          async (args) => {
            try {
              const collections =
                await this.backendApiService.fetchAllNFTCollections();

              // Apply limit if specified
              const limitedCollections = args.limit
                ? collections.slice(0, args.limit)
                : collections;
              
              return {
                collections: limitedCollections,
                total: collections.length,
                displayed: limitedCollections.length,
                message: 'NFT collections retrieved successfully',
              };
            } catch (error) {
              return {
                collections: [],
                total: 0,
                displayed: 0,
                error: `Failed to fetch NFT collections: ${error.message}`,
              };
            }
          },
        )

        .addCapability(
          'nft_get_collection_stats',
          'Get trading statistics for an NFT collection',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'NFT collection ticker',
            },
            {
              name: 'timeFrame',
              type: 'string',
              required: false,
              description: 'Time period: 24h, 7d, 30d',
              default: '24h',
            },
          ],
          [
            'Kaspunks trading volume',
            'NFT collection stats',
            'collection performance',
          ],
          async (args) => {
            try {
              // Get both collection details and trading stats
              const [details, tradeStats] = await Promise.allSettled([
                this.backendApiService.fetchNFTCollectionStats(
                  args.ticker,
                ),
                this.backendApiService.fetchNFTCollectionTradeStats(
                  args.ticker,
                ),
              ]);

              return {
                collection: args.ticker,
                timeFrame: args.timeFrame,
                details: details.status === 'fulfilled' ? details.value : null,
                tradeStats:
                  tradeStats.status === 'fulfilled' ? tradeStats.value : null,
                message: 'NFT collection statistics retrieved',
              };
            } catch (error) {
              return {
                collection: args.ticker,
                timeFrame: args.timeFrame,
                error: `Failed to fetch collection stats: ${error.message}`,
                details: null,
                tradeStats: null,
              };
            }
          },
        )

        .build()
    );
  }
}
