import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AgentBuilder } from '../agent-builder.service';
import { BuiltAgent } from '../../models/agent.model';
import { BackendApiService } from '../../services/backend-api.service';
import { KaspaApiService } from '../../services/kaspa-api.service';

/**
 * TradingAgentFactory - Creates trading agent with marketplace data and educational guidance
 *
 * NOTE: Trading operations requiring wallet authentication are commented out
 * until we implement agent wallet authentication system.
 */
@Injectable()
export class TradingAgentFactory {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly backendApiService: BackendApiService,
    private readonly kaspaApiService: KaspaApiService,
  ) {}

  createAgent(): BuiltAgent {
    return (
      AgentBuilder.create(this.httpService, this.configService, 'trading-agent')
        .withDescription('P2P trading marketplace data and gas estimation')
        .withVersion('2.0.0')
        .withCategory('financial')
        .withApiConfig('BACKEND_API_BASE_URL')

        // === Public Market Data Capabilities (No Auth Required) ===
        .addCapability(
          'trading_get_market_data',
          'Get current market prices, trading volume, and market statistics',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'Token ticker symbol (e.g., KAS, NACHO)',
            },
            {
              name: 'timeframe',
              type: 'string',
              required: false,
              description: 'Time period: "1h", "24h", "7d", "30d"',
              default: '24h',
            },
          ],
          [
            'KAS price',
            'current NACHO price',
            'market data for token',
            'show me trading stats',
          ],
          async (args) =>
            await this.backendApiService.getTradeStats(
              args.ticker,
              args.timeframe || '24h',
            ),
        )

        .addCapability(
          'trading_get_floor_price',
          'Get floor price information for specific tokens',
          [
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'Token ticker to get floor price for',
            },
          ],
          [
            'floor price for NACHO',
            'what is the lowest price for KAS?',
            'cheapest listing price',
          ],
          async (args) =>
            await this.backendApiService.getFloorPrice(args.ticker),
        )

        .addCapability(
          'trading_get_sell_orders',
          'Get sell orders from the marketplace',
          [
            {
              name: 'ticker',
              type: 'string',
              required: false,
              description: 'Filter by specific token ticker',
            },
            {
              name: 'limit',
              type: 'number',
              required: false,
              description: 'Maximum number of orders to return',
              default: 10,
            },
            {
              name: 'skip',
              type: 'number',
              required: false,
              description: 'Number of orders to skip for pagination',
              default: 0,
            },
            {
              name: 'sortBy',
              type: 'string',
              required: false,
              description: 'Sort field (e.g., "price", "createdAt")',
            },
            {
              name: 'direction',
              type: 'string',
              required: false,
              description: 'Sort direction: "asc" or "desc"',
            },
          ],
          [
            'show sell orders for NACHO',
            'available sell orders',
            'marketplace listings',
          ],
          async (args) => {
            const pagination = {
              limit: args.limit || 10,
              offset: args.skip || 0,
            };
            const sort = {
              field: args.sortBy || 'createdAt',
              direction: (args.direction || 'desc') as 'desc' | 'asc',
            };
            return await this.backendApiService.getSellOrders(
              args.ticker || '',
              pagination,
              sort,
            );
          },
        )

        .addCapability(
          'trading_gas_estimation',
          'Estimate gas fees for trading operations',
          [
            {
              name: 'tradeType',
              type: 'string',
              required: true,
              description: 'Type of trade: KASPA, TRANSFER, or TRADE',
            },
          ],
          [
            'gas estimate for trade',
            'transaction fee estimate',
            'how much will this cost?',
          ],
          async (args) =>
            await this.kaspaApiService.gasEstimator(
              args.tradeType as 'KASPA' | 'TRANSFER' | 'TRADE',
            ),
        )

        /*
        TODO: WALLET-AUTH-REQUIRED TRADING CAPABILITIES
        
        These capabilities require wallet authentication (session cookies or JWT token):
        
        === Trading Operations (All require PSKT + wallet session) ===
        - trading_create_sell_order: Create sell order (requires PSKT signature)
        - trading_buy_token: Buy tokens from order (requires wallet session)
        - trading_confirm_buy_order: Confirm buy transaction (requires wallet session)
        
        According to kaspacom.md:
        - POST /p2p-v2 (create sell order) - Auth Required + PSKT
        - POST /p2p/buy/{orderId} - Auth Required + wallet session
        - POST /p2p/confirmBuyOrder/{orderId} - Auth Required + wallet session
        
        Implementation notes:
        - Need wallet signin flow: POST /auth/wallet-signin
        - Need session management (cookies or JWT)
        - Need PSKT (Partially Signed Kaspa Transaction) for sell orders
        - Headers required: Authorization: Bearer <token> or session cookies
        
        Error handling:
        - 401 Unauthorized: Authentication required
        - 403 Forbidden: Insufficient permissions
        */

        .build()
    );
  }
}
