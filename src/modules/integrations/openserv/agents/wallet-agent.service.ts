import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  FetchWalletPortfolioResponse,
  TickerPortfolioBackend,
  WalletActivityResponse,
  WalletTradingDataResponse,
  UserHoldingsResponse,
  UserHoldingsResponseV2,
  GetSellOrdersResponse,
} from './models/wallet.model';

/**
 * WalletAgentService
 *
 * Handles wallet portfolio and activity management including:
 * - Wallet balance and portfolio tracking
 * - KRC20 token balance management
 * - Wallet activity scoring and analytics
 * - Trading data and performance metrics
 * - Wallet validation and utilities
 * - Portfolio optimization suggestions
 */
@Injectable()
export class WalletAgentService {
  private readonly logger = new Logger(WalletAgentService.name);
  private readonly BASEURL: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.BASEURL =
      this.configService.get<string>('BACKEND_API_BASE_URL') ||
      'https://api.kaspiano.com';
  }

  // === Portfolio Management ===

  async fetchWalletKRC20TokensBalance(
    walletAddress: string,
  ): Promise<FetchWalletPortfolioResponse> {
    try {
      const url = `${this.BASEURL}/backend/wallet-portfolio/${walletAddress}`;
      const response = await firstValueFrom(
        this.httpService.get<FetchWalletPortfolioResponse>(url),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch KRC20 portfolio for ${walletAddress}`,
        error,
      );
      return {
        portfolioItems: [],
        next: null,
        prev: null,
      };
    }
  }

  async fetchPortfolioAllocation(
    walletAddress: string,
  ): Promise<TickerPortfolioBackend[]> {
    try {
      const url = `${this.BASEURL}/backend/portfolio-allocation/${walletAddress}`;
      const response = await firstValueFrom(
        this.httpService.get<TickerPortfolioBackend[]>(url),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch portfolio allocation for ${walletAddress}`,
        error,
      );
      return [];
    }
  }

  // === Activity & Analytics ===

  async getWalletPoints(): Promise<WalletActivityResponse> {
    try {
      const url = `${this.BASEURL}/backend/wallet-points`;
      const response = await firstValueFrom(
        this.httpService.get<WalletActivityResponse>(url),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get wallet points', error);
      throw error;
    }
  }

  async getWalletActivity(
    walletAddress: string,
  ): Promise<WalletActivityResponse> {
    try {
      const url = `${this.BASEURL}/backend/wallet-activity/${walletAddress}`;
      const response = await firstValueFrom(
        this.httpService.get<WalletActivityResponse>(url),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get wallet activity for ${walletAddress}`,
        error,
      );
      throw error;
    }
  }

  async getWalletTradingData(
    walletAddress: string,
  ): Promise<WalletTradingDataResponse> {
    try {
      const url = `${this.BASEURL}/backend/wallet-trading/${walletAddress}`;
      const response = await firstValueFrom(
        this.httpService.get<WalletTradingDataResponse>(url),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get trading data for ${walletAddress}`,
        error,
      );
      return {};
    }
  }

  // === Holdings & Balances ===

  async getUserHoldings(
    walletAddress: string,
    ticker: string,
  ): Promise<UserHoldingsResponse> {
    try {
      const url = `${this.BASEURL}/backend/user-holdings`;
      const params = { walletAddress, ticker };

      const response = await firstValueFrom(
        this.httpService.get<UserHoldingsResponse>(url, { params }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get holdings for ${walletAddress} - ${ticker}`,
        error,
      );
      throw error;
    }
  }

  async getUserHoldingsV2(
    walletAddress: string,
    ticker: string,
  ): Promise<UserHoldingsResponseV2> {
    try {
      const url = `${this.BASEURL}/backend/user-holdings-v2`;
      const params = { walletAddress, ticker };

      const response = await firstValueFrom(
        this.httpService.get<UserHoldingsResponseV2>(url, { params }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get holdings v2 for ${walletAddress} - ${ticker}`,
        error,
      );
      throw error;
    }
  }

  // === Order Management ===

  async getSellOrders(walletAddress: string): Promise<GetSellOrdersResponse> {
    try {
      const url = `${this.BASEURL}/backend/wallet-sell-orders`;
      const params = { walletAddress };

      const response = await firstValueFrom(
        this.httpService.get<GetSellOrdersResponse>(url, { params }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get sell orders for ${walletAddress}`,
        error,
      );
      return {
        orders: [],
        totalCount: 0,
      };
    }
  }

  // === Wallet Validation & Utilities ===

  validateWalletAddress(address: string): {
    isValid: boolean;
    type?: 'kaspa' | 'ethereum';
    error?: string;
  } {
    try {
      // Kaspa address validation
      if (address.startsWith('kaspa:')) {
        const kaspaRegex = /^kaspa:[a-z0-9]{61,63}$/;
        if (kaspaRegex.test(address)) {
          return { isValid: true, type: 'kaspa' };
        }
        return {
          isValid: false,
          error: 'Invalid Kaspa address format',
        };
      }

      // Ethereum address validation
      if (address.startsWith('0x')) {
        const ethRegex = /^0x[a-fA-F0-9]{40}$/;
        if (ethRegex.test(address)) {
          return { isValid: true, type: 'ethereum' };
        }
        return {
          isValid: false,
          error: 'Invalid Ethereum address format',
        };
      }

      return {
        isValid: false,
        error: 'Unsupported address format',
      };
    } catch (error) {
      return {
        isValid: false,
        error: 'Address validation failed',
      };
    }
  }

  formatWalletAddress(
    address: string,
    format: 'short' | 'medium' | 'full' = 'short',
  ): string {
    if (!address) return '';

    switch (format) {
      case 'short':
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
      case 'medium':
        return `${address.slice(0, 10)}...${address.slice(-8)}`;
      case 'full':
      default:
        return address;
    }
  }

  // === Portfolio Analytics ===

  async calculatePortfolioValue(walletAddress: string): Promise<{
    totalValue: number;
    breakdown: Array<{
      ticker: string;
      value: number;
      percentage: number;
    }>;
  }> {
    try {
      const portfolio = await this.fetchWalletKRC20TokensBalance(walletAddress);

      // TODO: IMPLEMENT - Fetch real-time token prices from price oracle or DEX
      // Need to integrate with price feed service (CoinGecko, DEX APIs, etc.)
      // Current implementation missing: Real price fetching for each token
      throw new Error(
        'Portfolio value calculation not implemented - requires real price data integration',
      );

      // Template implementation (commented out):
      /*
      let totalValue = 0;
      const breakdown = [];
      
      for (const item of portfolio.portfolioItems) {
        const realPrice = await this.priceService.getTokenPrice(item.ticker);
        const value = item.balance * realPrice;
        totalValue += value;
        breakdown.push({
          ticker: item.ticker,
          value,
          percentage: 0, // Will calculate after total is known
        });
      }
      
      // Calculate percentages
      breakdown.forEach((item) => {
        item.percentage = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
      });
      
      return { totalValue, breakdown };
      */
    } catch (error) {
      this.logger.error(
        `Failed to calculate portfolio value for ${walletAddress}`,
        error,
      );
      throw error;
    }
  }

  async getPortfolioPerformance(walletAddress: string): Promise<{
    totalChange: number;
    totalChangePercent: number;
    topPerformers: Array<{
      ticker: string;
      change: number;
      changePercent: number;
    }>;
    worstPerformers: Array<{
      ticker: string;
      change: number;
      changePercent: number;
    }>;
  }> {
    try {
      // TODO: IMPLEMENT - Portfolio performance calculation
      // Required integrations:
      // 1. Historical price data service
      // 2. Transaction history analysis
      // 3. Time-weighted return calculations
      // 4. Benchmark comparison logic
      throw new Error(
        'Portfolio performance calculation not implemented - requires historical data analysis',
      );
    } catch (error) {
      this.logger.error(
        `Failed to get portfolio performance for ${walletAddress}`,
        error,
      );
      throw error;
    }
  }

  // === Wallet Insights & Recommendations ===

  async getWalletInsights(walletAddress: string): Promise<{
    riskScore: number;
    diversificationScore: number;
    activityLevel: 'low' | 'medium' | 'high';
    recommendations: string[];
  }> {
    try {
      // TODO: IMPLEMENT - AI-powered wallet analysis
      // Required components:
      // 1. Risk scoring algorithm based on token volatility
      // 2. Diversification analysis across asset classes
      // 3. Activity pattern recognition
      // 4. Machine learning recommendation engine
      // 5. Market correlation analysis
      throw new Error(
        'Wallet insights not implemented - requires AI analysis engine',
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate wallet insights for ${walletAddress}`,
        error,
      );
      throw error;
    }
  }

  // === Transaction History ===

  async getTransactionHistory(
    walletAddress: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{
    transactions: Array<{
      id: string;
      type: 'buy' | 'sell' | 'transfer' | 'mint';
      ticker: string;
      amount: number;
      price?: number;
      timestamp: string;
      status: 'completed' | 'pending' | 'failed';
    }>;
    totalCount: number;
  }> {
    try {
      const url = `${this.BASEURL}/backend/wallet-transactions/${walletAddress}`;
      const params = { limit, offset };

      const response = await firstValueFrom(
        this.httpService.get(url, { params }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get transaction history for ${walletAddress}`,
        error,
      );
      return {
        transactions: [],
        totalCount: 0,
      };
    }
  }

  // === Utility Functions ===

  isKaspaAddress(address: string): boolean {
    return (
      address.startsWith('kaspa:') && /^kaspa:[a-z0-9]{61,63}$/.test(address)
    );
  }

  isEthereumAddress(address: string): boolean {
    return address.startsWith('0x') && /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  formatBalance(balance: number, decimals: number = 8): string {
    return (balance / Math.pow(10, decimals)).toFixed(decimals);
  }

  calculateTokenValue(balance: number, price: number): number {
    return balance * price;
  }
}
