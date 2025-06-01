import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AgentBuilder, BuiltAgent } from '../agent-builder.service';
import { BackendApiService } from '../../services/backend-api.service';
import { KasplexKrc20Service } from '../../services/kasplex-krc20.service';

/**
 * TokenRegistryAgentFactory - Creates token registry agent with token information capabilities
 */
@Injectable()
export class TokenRegistryAgentFactory {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly backendApiService: BackendApiService,
    private readonly kasplexKrc20Service: KasplexKrc20Service,
  ) {}

  createAgent(): BuiltAgent {
    return (
      AgentBuilder.create(
        this.httpService,
        this.configService,
        'token-registry-agent',
      )
        .withDescription('Token information, pricing, and metadata')
        .withVersion('2.0.0')
        .withCategory('data')
        .withApiConfig('BACKEND_API_BASE_URL')

        // === Token Information Capabilities ===
        .addCapability(
          'token_get_info',
          'Get detailed information about a specific token',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'Token ticker symbol (e.g., KAS, NACHO)',
            },
            {
              name: 'walletAddress',
              type: 'string',
              required: false,
              description: 'Optional wallet address for personalized data',
            },
          ],
          [
            'tell me about NACHO token',
            'KAS token information',
            'what is this token?',
          ],
          async (args) =>
            await this.backendApiService.fetchTokenByTicker(
              args.ticker,
              args.walletAddress,
            ),
        )

        .addCapability(
          'token_search',
          'Search for tokens by name, ticker, or description',
          [
            {
              name: 'query',
              type: 'string',
              required: true,
              description: 'Search query (name, ticker, or keyword)',
            },
          ],
          [
            'search for NACHO',
            'find tokens with meme',
            'look for gaming tokens',
          ],
          async (args) => await this.backendApiService.searchToken(args.query),
        )

        .addCapability(
          'token_list_all',
          'List all available tokens with optional sorting and filtering',
          [
            {
              name: 'limit',
              type: 'number',
              required: false,
              description: 'Maximum number of tokens to return',
              default: 50,
            },
            {
              name: 'skip',
              type: 'number',
              required: false,
              description: 'Number of tokens to skip',
              default: 0,
            },
            {
              name: 'sortBy',
              type: 'string',
              required: false,
              description: 'Sort field',
            },
            {
              name: 'direction',
              type: 'string',
              required: false,
              description: 'Sort direction',
            },
          ],
          [
            'list all tokens',
            'show top tokens by volume',
            'available tokens sorted by price',
          ],
          async (args) =>
            await this.backendApiService.fetchAllTokens(
              args.limit || 50,
              args.skip || 0,
              '10m',
              args.sortBy,
              args.direction,
            ),
        )

        .addCapability(
          'token_get_price_history',
          'Get historical price data for a token',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'Token ticker to get price history for',
            },
            {
              name: 'timeframe',
              type: 'string',
              required: false,
              description: 'Time period: "24h", "7d", "30d", "90d"',
              default: '24h',
            },
          ],
          [
            'NACHO price history',
            'KAS price chart last week',
            'token price over time',
          ],
          async (args) =>
            await this.backendApiService.getTokenPriceHistory(
              args.ticker,
              args.timeframe,
            ),
        )

        .addCapability(
          'token_get_holders',
          'Get holder statistics and changes for a token',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'Token ticker to analyze',
            },
            {
              name: 'timeInterval',
              type: 'string',
              required: false,
              description: 'Time interval for holder change analysis',
              default: '24h',
            },
          ],
          [
            'NACHO holder statistics',
            'how many people hold this token?',
            'token holder growth',
          ],
          async (args) =>
            await this.backendApiService.getHolderChange(
              args.ticker,
              args.timeInterval || '24h',
            ),
        )

        .addCapability(
          'token_get_price',
          'Get current token price',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'Token ticker to get price for',
            },
          ],
          ['current NACHO price', 'token price', 'what is the price of KAS?'],
          async (args) => {
            const price = await this.backendApiService.fetchTokenPrice(
              args.ticker,
            );
            return { ticker: args.ticker, price, timestamp: new Date() };
          },
        )

        .addCapability(
          'token_count_total',
          'Get total number of tokens available',
          [],
          [
            'how many tokens are there?',
            'total token count',
            'token statistics',
          ],
          async () => {
            const count = await this.backendApiService.countTokens();
            return { totalTokens: count, timestamp: new Date() };
          },
        )

        // === Kasplex Token Information ===
        .addCapability(
          'token_get_kasplex_info',
          'Get detailed token information from Kasplex API',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'Token ticker to get info for',
            },
            {
              name: 'includeHolders',
              type: 'boolean',
              required: false,
              description: 'Include holder information',
              default: false,
            },
          ],
          ['Kasplex token info', 'detailed token data', 'token metadata'],
          async (args) =>
            await this.kasplexKrc20Service.fetchTokenInfo(
              args.ticker,
              args.includeHolders || false,
            ),
        )

        .addCapability(
          'token_check_deployment',
          'Check if a token is deployed on Kasplex',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'Token ticker to check',
            },
          ],
          ['is token deployed?', 'check token exists', 'token availability'],
          async (args) => {
            const isDeployed =
              await this.kasplexKrc20Service.checkTokenDeployment(args.ticker);
            return { ticker: args.ticker, isDeployed, timestamp: new Date() };
          },
        )

        .addCapability(
          'token_get_mint_status',
          'Check if token minting is finished',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'Token ticker to check mint status for',
            },
          ],
          ['is minting finished?', 'mint status', 'can I still mint?'],
          async (args) => {
            const mintingFinished =
              await this.kasplexKrc20Service.getTokenMintsLeft(args.ticker);
            return {
              ticker: args.ticker,
              mintingFinished,
              timestamp: new Date(),
            };
          },
        )

        .build()
    );
  }
}
