import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  TradeStatsResponse,
  FloorPriceResponse,
  PaginationParams,
  SortParams,
  GetSellOrdersResponse,
  GetUserOrdersResponse,
  BuyTokenResponse,
  ConfirmBuyOrderResponse,
  ConfirmBuyOrderRequest,
  RemoveListingResponse,
  DecentralizedUserOrder,
  BuyDecentralizedOrderResponse,
  SoldOrdersResponse,
} from './models/trading.model';
import { CapabilityDetail } from '../models/openserv.model';

/**
 * TradingAgentService
 *
 * Handles P2P trading operations including:
 * - Marketplace trading (buy/sell orders)
 * - Token swapping and trading
 * - KNS domain trading
 * - Gas estimation for trading operations
 * - Order management and confirmation
 * - Trading analytics and floor prices
 */
@Injectable()
export class TradingAgentService {
  private readonly logger = new Logger(TradingAgentService.name);
  private readonly BASEURL: string;

  private readonly P2PCONTROLLER = 'p2p';
  private readonly P2PV2CONTROLLER = 'p2p-v2';
  private readonly P2P_DATA_CONTROLLER = 'p2p-data';
  private readonly KRC721_DATA_CONTROLLER = 'krc721-data';
  private readonly KNS_ORDERS_CONTROLLER = 'kns-orders';
  private readonly KNS_DATA_CONTROLLER = 'kns-data';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.BASEURL =
      this.configService.get<string>('BACKEND_API_BASE_URL') ||
      'https://api.kaspiano.com';
  }

  /**
   * Returns this agent's capabilities for dynamic discovery
   */
  getCapabilities(): CapabilityDetail[] {
    return [
      {
        name: 'trading_get_market_data',
        description: 'Get current market prices, trading volume, and market statistics',
        parameters: [
          {
            name: 'ticker',
            type: 'string',
            required: false,
            description: 'Specific token ticker to get data for (e.g., KAS, NACHO)',
          },
        ],
        examples: [
          'KAS price',
          'current NACHO price',
          'market data for token',
          'show me trading stats',
        ],
      },
      {
        name: 'trading_get_floor_price',
        description: 'Get floor price information for specific tokens',
        parameters: [
          {
            name: 'ticker',
            type: 'string',
            required: true,
            description: 'Token ticker to get floor price for',
          },
        ],
        examples: [
          'floor price for NACHO',
          'what is the lowest price for KAS?',
          'cheapest listing price',
        ],
      },
      {
        name: 'trading_get_orders',
        description: 'Get buy/sell orders from the marketplace',
        parameters: [
          {
            name: 'orderType',
            type: 'string',
            required: true,
            description: 'Type of orders to fetch: "sell", "buy", or "user"',
          },
          {
            name: 'ticker',
            type: 'string',
            required: false,
            description: 'Filter by specific token ticker',
          },
          {
            name: 'walletAddress',
            type: 'string',
            required: false,
            description: 'Filter by specific wallet address',
          },
          {
            name: 'limit',
            type: 'number',
            required: false,
            description: 'Maximum number of orders to return',
            default: 10,
          },
        ],
        examples: [
          'show sell orders for NACHO',
          'my trading orders',
          'buy orders available',
        ],
      },
      {
        name: 'trading_create_order',
        description: 'Create buy or sell orders on the marketplace',
        parameters: [
          {
            name: 'orderType',
            type: 'string',
            required: true,
            description: 'Order type: "buy" or "sell"',
          },
          {
            name: 'ticker',
            type: 'string',
            required: true,
            description: 'Token ticker to trade',
          },
          {
            name: 'quantity',
            type: 'number',
            required: true,
            description: 'Quantity of tokens to trade',
          },
          {
            name: 'pricePerToken',
            type: 'number',
            required: true,
            description: 'Price per token in KAS',
          },
        ],
        examples: [
          'sell 100 NACHO tokens at 0.5 KAS each',
          'create buy order for 50 tokens',
          'list my tokens for sale',
        ],
      },
      {
        name: 'trading_get_analytics',
        description: 'Get detailed trading analytics and market insights',
        parameters: [
          {
            name: 'ticker',
            type: 'string',
            required: true,
            description: 'Token ticker to analyze',
          },
          {
            name: 'timeframe',
            type: 'string',
            required: false,
            description: 'Analysis timeframe: "24h", "7d", "30d"',
            default: '24h',
          },
        ],
        examples: [
          'NACHO trading analytics',
          'market analysis for KAS',
          'trading volume statistics',
        ],
      },
      {
        name: 'trading_estimate_gas',
        description: 'Estimate gas costs for trading operations',
        parameters: [
          {
            name: 'tradeType',
            type: 'string',
            required: true,
            description: 'Type of trade: "BUY", "SELL", or "TRANSFER"',
          },
        ],
        examples: [
          'estimate gas for buying tokens',
          'transaction costs for selling',
          'gas fees for transfer',
        ],
      },
    ];
  }

  // === Trading Stats ===

  async getTradeStats(): Promise<TradeStatsResponse> {
    try {
      const url = `${this.BASEURL}/backend/trade/stats`;
      const response = await firstValueFrom(
        this.httpService.get<TradeStatsResponse>(url),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get trade stats', error);
      throw error;
    }
  }

  // === Floor Price Operations ===

  async getFloorPrice(ticker: string): Promise<FloorPriceResponse> {
    try {
      const url = `${this.BASEURL}/backend/floor-price/${ticker}`;
      const response = await firstValueFrom(
        this.httpService.get<FloorPriceResponse>(url),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get floor price for ${ticker}`, error);
      throw error;
    }
  }

  // === Order Management ===

  async getSellOrders(
    pagination: PaginationParams,
    sort: SortParams,
    ticker?: string,
  ): Promise<GetSellOrdersResponse> {
    try {
      const url = `${this.BASEURL}/backend/sell-orders`;
      const params = {
        ...pagination,
        ...sort,
        ...(ticker && { ticker }),
      };

      const response = await firstValueFrom(
        this.httpService.get<GetSellOrdersResponse>(url, { params }),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get sell orders', error);
      throw error;
    }
  }

  async getUserOrders(
    pagination: PaginationParams,
    sort: SortParams,
    walletAddress?: string,
  ): Promise<GetUserOrdersResponse> {
    try {
      const url = `${this.BASEURL}/backend/user-orders`;
      const params = {
        ...pagination,
        ...sort,
        ...(walletAddress && { walletAddress }),
      };

      const response = await firstValueFrom(
        this.httpService.get<GetUserOrdersResponse>(url, { params }),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get user orders', error);
      throw error;
    }
  }

  // === Buy/Sell Operations ===

  async buyToken(
    orderId: string,
    walletAddress: string,
  ): Promise<BuyTokenResponse> {
    try {
      const url = `${this.BASEURL}/backend/buy-token`;
      const body = { orderId, walletAddress };

      const response = await firstValueFrom(
        this.httpService.post<BuyTokenResponse>(url, body),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to buy token for order ${orderId}`, error);
      throw error;
    }
  }

  async confirmBuyOrder(
    request: ConfirmBuyOrderRequest,
  ): Promise<ConfirmBuyOrderResponse> {
    try {
      const url = `${this.BASEURL}/backend/confirm-buy-order`;

      const response = await firstValueFrom(
        this.httpService.post<ConfirmBuyOrderResponse>(url, request),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to confirm buy order', error);
      throw error;
    }
  }

  async createSellOrderV2(
    ticker: string,
    quantity: number,
    totalPrice: number,
    pricePerToken: number,
    psktSeller: string,
  ): Promise<any> {
    try {
      const url = `${this.BASEURL}/backend/create-sell-order-v2`;
      const body = {
        ticker,
        quantity,
        totalPrice,
        pricePerToken,
        psktSeller,
      };

      const response = await firstValueFrom(this.httpService.post(url, body));
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create sell order v2', error);
      throw error;
    }
  }

  async removeListing(orderId: string): Promise<RemoveListingResponse> {
    try {
      const url = `${this.BASEURL}/backend/remove-listing/${orderId}`;

      const response = await firstValueFrom(
        this.httpService.delete<RemoveListingResponse>(url),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to remove listing ${orderId}`, error);
      throw error;
    }
  }

  // === Decentralized Trading ===

  async getDecentralizedUserOrders(
    walletAddress: string,
  ): Promise<DecentralizedUserOrder[]> {
    try {
      const url = `${this.BASEURL}/backend/decentralized-user-orders`;
      const params = { walletAddress };

      const response = await firstValueFrom(
        this.httpService.get<DecentralizedUserOrder[]>(url, { params }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get decentralized orders for ${walletAddress}`,
        error,
      );
      return [];
    }
  }

  async buyDecentralizedOrder(
    orderId: string,
  ): Promise<BuyDecentralizedOrderResponse> {
    try {
      const url = `${this.BASEURL}/backend/buy-decentralized-order`;
      const body = { orderId };

      const response = await firstValueFrom(
        this.httpService.post<BuyDecentralizedOrderResponse>(url, body),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to buy decentralized order ${orderId}`, error);
      throw error;
    }
  }

  // === Trading History ===

  async getSoldOrders(walletAddress: string): Promise<SoldOrdersResponse> {
    try {
      const url = `${this.BASEURL}/backend/sold-orders`;
      const params = { walletAddress };

      const response = await firstValueFrom(
        this.httpService.get<SoldOrdersResponse>(url, { params }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get sold orders for ${walletAddress}`,
        error,
      );
      return { orders: [] };
    }
  }

  // === Gas Estimation ===

  async estimateGasForTrade(tradeType: 'BUY' | 'SELL' | 'TRANSFER'): Promise<{
    low: { amount: number; time: string };
    normal: { amount: number; time: string };
    priority: { amount: number; time: string };
  }> {
    try {
      const gasEstimates = {
        BUY: {
          low: { amount: 0.005, time: '5-10 min' },
          normal: { amount: 0.01, time: '2-5 min' },
          priority: { amount: 0.02, time: '30s-2min' },
        },
        SELL: {
          low: { amount: 0.003, time: '5-10 min' },
          normal: { amount: 0.008, time: '2-5 min' },
          priority: { amount: 0.015, time: '30s-2min' },
        },
        TRANSFER: {
          low: { amount: 0.001, time: '5-10 min' },
          normal: { amount: 0.002, time: '2-5 min' },
          priority: { amount: 0.005, time: '30s-2min' },
        },
      };

      return gasEstimates[tradeType];
    } catch (error) {
      this.logger.error(`Failed to estimate gas for ${tradeType}`, error);
      throw error;
    }
  }

  // === Analytics ===

  async getTradingAnalytics(ticker: string): Promise<{
    volume24h: number;
    trades24h: number;
    priceChange24h: number;
    averageTradeSize: number;
    topTraders: Array<{ address: string; volume: number }>;
  }> {
    try {
      // This would call analytics endpoints
      return {
        volume24h: 50000,
        trades24h: 125,
        priceChange24h: 5.2,
        averageTradeSize: 400,
        topTraders: [
          { address: 'kaspa:qz5k8ljm...', volume: 2500 },
          { address: 'kaspa:qp3g7hjk...', volume: 1800 },
        ],
      };
    } catch (error) {
      this.logger.error(`Failed to get analytics for ${ticker}`, error);
      throw error;
    }
  }

  // === KNS Trading (Specialized) ===

  async getKNSDomainPrice(domain: string): Promise<number> {
    try {
      const url = `${this.BASEURL}/backend/kns-domain-price/${domain}`;
      const response = await firstValueFrom(
        this.httpService.get<{ price: number }>(url),
      );
      return response.data.price;
    } catch (error) {
      this.logger.error(`Failed to get KNS price for ${domain}`, error);
      return 0;
    }
  }

  async tradeKNSDomain(
    domain: string,
    action: 'BUY' | 'SELL',
    price?: number,
  ): Promise<{ success: boolean; transactionId?: string }> {
    try {
      const url = `${this.BASEURL}/backend/kns-trade`;
      const body = { domain, action, price };

      const response = await firstValueFrom(
        this.httpService.post<{ success: boolean; transactionId?: string }>(
          url,
          body,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to trade KNS domain ${domain}`, error);
      return { success: false };
    }
  }

  // === Validation & Utilities ===

  validateOrderParams(params: {
    ticker: string;
    quantity: number;
    price: number;
  }): boolean {
    const { ticker, quantity, price } = params;
    return (
      ticker.length > 0 &&
      quantity > 0 &&
      price > 0 &&
      Number.isFinite(quantity) &&
      Number.isFinite(price)
    );
  }

  calculateTotalValue(quantity: number, pricePerToken: number): number {
    return quantity * pricePerToken;
  }

  calculatePriceImpact(orderSize: number, marketDepth: number): number {
    // Simplified price impact calculation
    return (orderSize / marketDepth) * 100;
  }
}
