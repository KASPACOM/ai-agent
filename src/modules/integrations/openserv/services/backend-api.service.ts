import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  AdItemResponse,
  NotificationsResponse,
  ContactInfoResponse,
  AdType,
} from '../agents/models/user-management.model';
import {
  TokenListItemResponse,
  BackendTokenResponse,
  BackendTokenStatsResponse,
  HolderChangeResponse,
  TokenSearchItems,
  TickerPortfolioBackend,
} from '../agents/models/token-registry.model';
import {
  FetchWalletPortfolioResponse,
  WalletActivityResponse,
  WalletTradingDataResponse,
} from '../agents/models/wallet.model';
import {
  FloorPriceResponse,
  TradeStatsResponse,
  PaginationParams,
  SortParams,
  BuyTokenResponse,
  ConfirmBuyOrderResponse,
  ConfirmBuyOrderRequest,
  GetSellOrdersResponse,
} from '../agents/models/trading.model';

/**
 * BackendApiService
 *
 * Legacy service that provides comprehensive backend API integration for:
 * - Token and wallet operations
 * - Trading and order management
 * - User management and notifications
 * - NFT and collection operations
 * - Advertisement and contact management
 *
 * Note: This service contains mixed responsibilities and should be
 * refactored to use the newer specialized agent services.
 */
@Injectable()
export class BackendApiService {
  private readonly logger = new Logger(BackendApiService.name);
  private readonly BASEURL: string;

  private readonly KRC20CONTROLLER = 'krc20';
  private readonly KRC721CONTROLLER = 'krc721';
  private readonly P2PCONTROLLER = 'p2p';
  private readonly P2PV2CONTROLLER = 'p2p-v2';
  private readonly KNS_ORDERS_CONTROLLER = 'kns-orders';
  private readonly P2P_DATA_CONTROLLER = 'p2p-data';
  private readonly KRC721_DATA_CONTROLLER = 'krc721-data';
  private readonly P2P_KNS_ACTIONS_CONTROLLER = 'kns-actions';
  private readonly P2P_KASPA_SCRIPT_INSCRIPTION_CONTROLLER =
    'kaspa-script-inscription';
  private readonly NOTIFICATIONS_CONTROLLER = 'notifications';
  private readonly KRC20METADATA_CONTROLLER = 'krc20metadata';
  private readonly KRC721METADATA_CONTROLLER = 'krc721metadata';
  private readonly ADS_CONTROLLER = 'ads';
  private readonly AUTH_CONTROLLER = 'auth';
  private readonly REF_CONTROLLER = 'referrals';
  private readonly WALLET_ACTIVITY = 'wallet-activity';
  private readonly KRC721_SWAP = 'krc721-egg-swap';
  private readonly KNS_DATA_CONTROLLER = 'kns-data';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.BASEURL =
      this.configService.get<string>('BACKEND_API_BASE_URL') ||
      'https://api.kaspiano.com';
  }

  async getContactInfo(): Promise<ContactInfoResponse> {
    try {
      const url = `${this.BASEURL}/${this.REF_CONTROLLER}/contact-info`;
      const response = await firstValueFrom(
        this.httpService.get<ContactInfoResponse>(
          url,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get contact info', error);
      throw error;
    }
  }

  async getAdsByLocation(adType: AdType): Promise<AdItemResponse[]> {
    try {
      const url = `${this.BASEURL}/${this.ADS_CONTROLLER}/${adType}`;
      const response = await firstValueFrom(
        this.httpService.get<AdItemResponse[]>(
          url,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get ads for ${adType}`, error);
      return [];
    }
  }

  async getAds(): Promise<AdItemResponse[]> {
    try {
      const url = `${this.BASEURL}/${this.ADS_CONTROLLER}`;
      const response = await firstValueFrom(
        this.httpService.get<AdItemResponse[]>(
          url,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get ads', error);
      return [];
    }
  }

  async getNotifications(
    page: number,
    limit = 10,
  ): Promise<NotificationsResponse[]> {
    try {
      const url = `${this.BASEURL}/${this.NOTIFICATIONS_CONTROLLER}?page=${page}&limit=${limit}`;
      const response = await firstValueFrom(
        this.httpService.get<NotificationsResponse[]>(
          url,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get notifications', error);
      return [];
    }
  }

  async createSellOrderV2(
    ticker: string,
    quantity: number,
    totalPrice: number,
    pricePerToken: number,
    psktSeller: string,
  ): Promise<{ id: string; status: string; errorCode?: number }> {
    try {
      const capitalTicker = ticker.toUpperCase();
      const url = `${this.BASEURL}/${this.P2PV2CONTROLLER}`;
      const payload = {
        ticker: capitalTicker,
        quantity,
        totalPrice,
        pricePerToken,
        psktSeller,
      };

      const response = await firstValueFrom(
        this.httpService.post<{ id: string; status: string }>(
          url,
          payload,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create sell order v2', error);
      return { id: '', status: 'ERROR' };
    }
  }

  async markNotificationsRead(): Promise<void> {
    try {
      const url = `${this.BASEURL}/${this.NOTIFICATIONS_CONTROLLER}/mark-all-read`;
      await firstValueFrom(
        this.httpService.patch(url, {}, this.getAuthorizedOptions()),
      );
    } catch (error) {
      this.logger.error('Failed to mark notifications as read', error);
      throw error;
    }
  }

  async clearAllNotifications(): Promise<void> {
    try {
      const url = `${this.BASEURL}/${this.NOTIFICATIONS_CONTROLLER}/clear`;
      await firstValueFrom(
        this.httpService.patch(url, {}, this.getAuthorizedOptions()),
      );
    } catch (error) {
      this.logger.error('Failed to clear notifications', error);
      throw error;
    }
  }

  async fetchAllTokens(
    limit = 50,
    skip = 0,
    timeInterval: string = '10m',
    order: string | null = null,
    direction: string | null = null,
  ): Promise<TokenListItemResponse[]> {
    try {
      const params: any = {
        skip: skip.toString(),
        limit: limit.toString(),
        timeInterval,
      };

      if (order) params.order = order;
      if (direction) params.direction = direction;

      const response = await firstValueFrom(
        this.httpService.get<TokenListItemResponse[]>(
          `${this.BASEURL}/${this.KRC20CONTROLLER}`,
          { params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch all tokens', error);
      return [];
    }
  }

  async fetchTokenByTicker(
    ticker: string,
    wallet?: string,
    refresh = false,
  ): Promise<BackendTokenResponse> {
    try {
      const params: any = {};
      if (refresh) params.refresh = 'true';
      if (wallet) params.wallet = wallet;

      const response = await firstValueFrom(
        this.httpService.get<BackendTokenResponse>(
          `${this.BASEURL}/${this.KRC20CONTROLLER}/${ticker.toUpperCase()}`,
          { params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch token by ticker: ${ticker}`, error);
      throw error;
    }
  }

  async getHolderChange(
    ticker: string,
    timeInterval: string,
  ): Promise<HolderChangeResponse> {
    try {
      const params = {
        ticker,
        timeInterval,
      };

      const response = await firstValueFrom(
        this.httpService.get<HolderChangeResponse>(
          `${this.BASEURL}/${this.KRC20CONTROLLER}/holder-change`,
          { params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get holder change for ${ticker}`, error);
      throw error;
    }
  }

  async getFloorPrice(ticker: string): Promise<number> {
    try {
      const params = { ticker };

      const response = await firstValueFrom(
        this.httpService.get<FloorPriceResponse[]>(
          `${this.BASEURL}/${this.P2P_DATA_CONTROLLER}/floor-price`,
          { params },
        ),
      );
      return response.data[0]?.floor_price ?? 0;
    } catch (error) {
      this.logger.error(`Failed to get floor price for ${ticker}`, error);
      return 0;
    }
  }

  async fetchTokenInfo(ticker: string, holders: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<any>(
          `${this.BASEURL}/${this.KRC20CONTROLLER}/token/${ticker}?holders=${holders}`,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch token info for ${ticker}`, error);
      return null;
    }
  }

  async fetchWalletKRC20TokensBalance(
    address: string,
    paginationKey: string | null = null,
    direction: 'next' | 'prev' | null = null,
  ): Promise<FetchWalletPortfolioResponse> {
    try {
      const params: any = {};

      if (paginationKey && direction) {
        params[direction] = paginationKey;
      }

      const response = await firstValueFrom(
        this.httpService.get<any>(
          `${this.BASEURL}/${this.KRC20CONTROLLER}/address/${address}/tokenlist`,
          { params },
        ),
      );

      const portfolioItems = response.data.result.map((item: any) => ({
        ticker: item.tick,
        balance: parseInt(item.balance) / 1e8,
        logoUrl: '',
      }));

      return {
        portfolioItems,
        next: response.data.next || null,
        prev: response.data.prev || null,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch wallet KRC20 tokens balance for ${address}`,
        error,
      );
      return {
        portfolioItems: [],
        next: null,
        prev: null,
      };
    }
  }

  async confirmBuyOrder(
    orderId: string,
    transactionId: string,
  ): Promise<ConfirmBuyOrderResponse> {
    try {
      const url = `${this.BASEURL}/${this.P2PCONTROLLER}/confirmBuyOrder/${orderId}`;
      const payload: ConfirmBuyOrderRequest = { transactionId };

      const response = await firstValueFrom(
        this.httpService.post<ConfirmBuyOrderResponse>(
          url,
          payload,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to confirm buy order ${orderId}`, error);
      return {
        confirmed: false,
        transactions: {
          commitTransactionId: '',
          revealTransactionId: '',
          sellerTransactionId: '',
          buyerTransactionId: '',
        },
        priorityFeeTooHigh: false,
      };
    }
  }

  async buyToken(
    orderId: string,
    walletAddress: string,
  ): Promise<BuyTokenResponse> {
    try {
      const url = `${this.BASEURL}/${this.P2PCONTROLLER}/buy/${orderId}`;
      const payload = { walletAddress };

      const response = await firstValueFrom(
        this.httpService.post<BuyTokenResponse>(
          url,
          payload,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to buy token for order ${orderId}`, error);
      return {
        success: false,
        temporaryWalletAddress: '',
        status: 'ERROR',
      };
    }
  }

  async getTradeStats(
    ticker: string,
    timeFrame: string,
  ): Promise<TradeStatsResponse> {
    try {
      const params: any = { ticker };

      if (timeFrame.toLowerCase() !== 'all') {
        params.timeFrame = timeFrame;
      }

      const response = await firstValueFrom(
        this.httpService.get<TradeStatsResponse>(
          `${this.BASEURL}/${this.P2P_DATA_CONTROLLER}/trade-stats`,
          { params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get trade stats for ${ticker}`, error);
      return {
        totalTradesKaspiano: 0,
        totalVolumeKasKaspiano: 0.0,
        totalVolumeUsdKaspiano: 0.0,
        tokens: [],
      };
    }
  }

  async getSellOrders(
    ticker: string,
    pagination: PaginationParams,
    sort: SortParams,
  ): Promise<GetSellOrdersResponse> {
    try {
      const url = `${this.BASEURL}/${this.P2PV2CONTROLLER}/sell-orders`;
      const params = { ticker };

      const response = await firstValueFrom(
        this.httpService.post<GetSellOrdersResponse>(
          url,
          { pagination, sort },
          { ...this.getAuthorizedOptions(), params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get sell orders for ${ticker}`, error);
      return {
        orders: [],
        totalCount: 0,
      };
    }
  }

  async fetchStatusByTicker(
    ticker: string,
    timeInterval: string,
  ): Promise<BackendTokenStatsResponse> {
    try {
      const params: any = { ticker };
      if (timeInterval) {
        params.timeInterval = timeInterval;
      }

      const response = await firstValueFrom(
        this.httpService.get<BackendTokenStatsResponse[]>(
          `${this.BASEURL}/${this.KRC20CONTROLLER}/stats`,
          { params },
        ),
      );
      return response.data[0];
    } catch (error) {
      this.logger.error(`Failed to fetch status by ticker: ${ticker}`, error);
      throw error;
    }
  }

  async countTokens(): Promise<number> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ count: number }>(
          `${this.BASEURL}/${this.KRC20CONTROLLER}/count`,
        ),
      );
      return response.data.count;
    } catch (error) {
      this.logger.error('Failed to count tokens', error);
      return 0;
    }
  }

  async searchToken(query: string): Promise<TokenSearchItems[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<TokenSearchItems[]>(
          `${this.BASEURL}/${this.KRC20CONTROLLER}/search`,
          { params: { query } },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to search token: ${query}`, error);
      return [];
    }
  }

  async fetchTokenPortfolio(
    tickers: string[],
  ): Promise<TickerPortfolioBackend[]> {
    try {
      const tickersString = tickers.join(',');
      const response = await firstValueFrom(
        this.httpService.get<TickerPortfolioBackend[]>(
          `${this.BASEURL}/${this.KRC20CONTROLLER}/portfolio`,
          { params: { tickers: tickersString } },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch token portfolio', error);
      return [];
    }
  }

  async fetchTokenPrice(ticker: string): Promise<number> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ price: number }>(
          `${this.BASEURL}/${this.KRC20CONTROLLER}/token-price/${ticker}`,
        ),
      );
      return response.data.price;
    } catch (error) {
      this.logger.error(`Failed to fetch token price for ${ticker}`, error);
      return 0;
    }
  }

  async getTokenPriceHistory(
    ticker: string,
    timeframe?: string,
  ): Promise<{ price: number; date: string }[]> {
    try {
      let url = `${this.BASEURL}/${this.KRC20CONTROLLER}/price-history-v2/${ticker.toUpperCase()}`;

      if (timeframe && timeframe !== 'All') {
        url += `?timeFrame=${timeframe}`;
      }

      const response = await firstValueFrom(
        this.httpService.get<{ data: { price: number; date: string }[] }>(url),
      );
      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Failed to get token price history for ${ticker}`,
        error,
      );
      return [];
    }
  }

  async getGasEstimator(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<any>(
          `${this.BASEURL}/${this.P2PCONTROLLER}/feeRate`,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get gas estimator', error);
      return { confirmed: false };
    }
  }

  async getWalletPoints(): Promise<WalletActivityResponse> {
    try {
      const url = `${this.BASEURL}/${this.WALLET_ACTIVITY}`;
      const response = await firstValueFrom(
        this.httpService.get<WalletActivityResponse>(
          url,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get wallet points', error);
      return {
        walletAddress: '',
        scores: {
          deployments: 0,
          mints: 0,
          airdrops: 0,
          referals: 0,
          buyOrders: 0,
          sellOrders: 0,
          createdLaunchpads: 0,
          launchpadParticipation: 0,
          total: 0,
          volume: 0,
        },
        tradeVolume: 0,
        totalTrades: 0,
        topTradedTokens: [],
        topTradedNftTokens: [],
        scoreFromReferrals: 0,
      };
    }
  }

  async getWalletTradingData(): Promise<WalletTradingDataResponse> {
    try {
      const url = `${this.BASEURL}/${this.WALLET_ACTIVITY}/trading-data`;
      const response = await firstValueFrom(
        this.httpService.get<WalletTradingDataResponse>(
          url,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get wallet trading data', error);
      return {};
    }
  }

  private getAuthorizedOptions(options?: any): any {
    return {
      ...options,
      withCredentials: true,
    };
  }
}
