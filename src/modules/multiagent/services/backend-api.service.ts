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
    this.BASEURL = this.configService.get<string>('BACKEND_API_BASE_URL');

    if (!this.BASEURL) {
      throw new Error(
        'BACKEND_API_BASE_URL environment variable is required but not set. ' +
          'Please check your environment configuration.',
      );
    }

    this.logger.log(`BackendApiService initialized with URL: ${this.BASEURL}`);
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
    const logId = `token_list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - fetchAllTokens started`);
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: limit=${limit}, skip=${skip}, timeInterval=${timeInterval}, order=${order}, direction=${direction}`,
    );

    try {
      const params: any = {
        skip: skip.toString(),
        limit: limit.toString(),
        timeInterval,
      };

      if (order) params.order = order;
      if (direction) params.direction = direction;

      const url = `${this.BASEURL}/${this.KRC20CONTROLLER}`;
      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);
      this.logger.debug(`[API-CALL] ${logId} - Request params:`, params);

      const response = await firstValueFrom(
        this.httpService.get<TokenListItemResponse[]>(url, {
          params,
          ...this.getAuthorizedOptions(),
        }),
      );

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        tokensCount: (response.data as any)?.length || 0,
        firstToken: (response.data as any)?.[0]?.ticker || 'none',
      });

      return response.data;
    } catch (error) {
      this.logger.error(`[API-CALL] ${logId} - Failed to fetch all tokens`);
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      return [];
    }
  }

  async fetchTokenByTicker(
    ticker: string,
    wallet?: string,
    refresh = false,
  ): Promise<BackendTokenResponse> {
    const logId = `token_info_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - fetchTokenByTicker started`);
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: ticker=${ticker}, wallet=${wallet}, refresh=${refresh}`,
    );

    try {
      const url = `${this.BASEURL}/${this.KRC20CONTROLLER}/${ticker}`;
      const params = {
        ...(wallet && { wallet }),
        ...(refresh && { refresh: refresh.toString() }),
      };

      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);
      this.logger.debug(`[API-CALL] ${logId} - Request params:`, params);

      const response = await firstValueFrom(
        this.httpService.get<BackendTokenResponse>(
          url,
          this.getAuthorizedOptions({ params }),
        ),
      );

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        ticker: (response.data as any)?.ticker,
        price: (response.data as any)?.price,
        holders: (response.data as any)?.holders,
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to fetch token by ticker ${ticker}`,
      );
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
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
    const logId = `floor_price_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - getFloorPrice started`);
    this.logger.debug(`[API-CALL] ${logId} - Parameters: ticker=${ticker}`);

    try {
      const url = `${this.BASEURL}/${this.P2P_DATA_CONTROLLER}/floor-price/${ticker}`;

      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get<FloorPriceResponse>(
          url,
          this.getAuthorizedOptions(),
        ),
      );

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        floorPrice:
          (response.data as any)?.floor_price ||
          (response.data as any)?.floorPrice,
        ticker: (response.data as any)?.ticker,
      });

      return (
        (response.data as any)?.floor_price ||
        (response.data as any)?.floorPrice ||
        0
      );
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to get floor price for ${ticker}`,
      );
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
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
    const logId = `wallet_portfolio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(
      `[API-CALL] ${logId} - fetchWalletKRC20TokensBalance started`,
    );
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: address=${address}, paginationKey=${paginationKey}, direction=${direction}`,
    );

    try {
      const url = `${this.BASEURL}/${this.P2PCONTROLLER}/${address}/portfolio`;
      const params = {
        ...(paginationKey && { paginationKey }),
        ...(direction && { direction }),
      };

      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);
      this.logger.debug(`[API-CALL] ${logId} - Request params:`, params);

      const response = await firstValueFrom(
        this.httpService.get<FetchWalletPortfolioResponse>(url, {
          params,
          ...this.getAuthorizedOptions(),
        }),
      );

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        tokensCount:
          (response.data as any)?.result?.length ||
          (response.data as any)?.tokens?.length ||
          0,
        hasNextPage:
          (response.data as any)?.next ||
          (response.data as any)?.pagination?.hasNextPage,
        hasPrevPage:
          (response.data as any)?.prev ||
          (response.data as any)?.pagination?.hasPrevPage,
        totalValue: (response.data as any)?.totalValue,
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to fetch wallet KRC20 tokens balance`,
      );
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      throw error;
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
    const logId = `trade_stats_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - getTradeStats started`);
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: ticker=${ticker}, timeFrame=${timeFrame}`,
    );

    try {
      const url = `${this.BASEURL}/${this.P2P_DATA_CONTROLLER}/${ticker}/trade-stats`;
      const params = {
        timeFrame,
      };

      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);
      this.logger.debug(`[API-CALL] ${logId} - Request params:`, params);

      const response = await firstValueFrom(
        this.httpService.get<TradeStatsResponse>(
          url,
          this.getAuthorizedOptions({ params }),
        ),
      );

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        ticker: (response.data as any)?.ticker,
        totalTrades:
          (response.data as any)?.totalTrades ||
          (response.data as any)?.total_trades,
        totalVolumeKas:
          (response.data as any)?.totalVolumeKas ||
          (response.data as any)?.total_volume_kas,
        totalVolumeUsd:
          (response.data as any)?.totalVolumeUsd ||
          (response.data as any)?.total_volume_usd,
        timeFrame:
          (response.data as any)?.timeFrame ||
          (response.data as any)?.time_frame,
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to get trade stats for ${ticker}`,
      );
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      throw error;
    }
  }

  async getSellOrders(
    ticker: string,
    pagination: PaginationParams,
    sort: SortParams,
  ): Promise<GetSellOrdersResponse> {
    const logId = `sell_orders_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - getSellOrders started`);
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: ticker=${ticker}, pagination=`,
      pagination,
      'sort=',
      sort,
    );

    try {
      const url = `${this.BASEURL}/${this.P2PCONTROLLER}`;
      const params = {
        ...(ticker && { ticker }),
        limit: pagination.limit.toString(),
        skip: pagination.offset.toString(),
        sortBy: sort.field,
        direction: sort.direction,
      };

      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);
      this.logger.debug(`[API-CALL] ${logId} - Request params:`, params);

      const response = await firstValueFrom(
        this.httpService.get<GetSellOrdersResponse>(
          url,
          this.getAuthorizedOptions({ params }),
        ),
      );

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        ordersCount:
          (response.data as any)?.orders?.length ||
          (response.data as any)?.result?.length ||
          0,
        totalOrders:
          (response.data as any)?.total || (response.data as any)?.count,
        ticker: ticker || 'all',
      });

      return response.data;
    } catch (error) {
      this.logger.error(`[API-CALL] ${logId} - Failed to get sell orders`);
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      throw error;
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
          `${this.BASEURL}/${this.P2P_DATA_CONTROLLER}/tokens/count`,
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
        this.httpService.post<TokenSearchItems[]>(
          `${this.BASEURL}/${this.P2P_DATA_CONTROLLER}/token/search`,
          { query },
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
      const url = `${this.BASEURL}/${this.P2P_DATA_CONTROLLER}/${ticker}/price-history`;
      const params =
        timeframe && timeframe !== 'All' ? { timeFrame: timeframe } : {};

      const response = await firstValueFrom(
        this.httpService.get<{ data: { price: number; date: string }[] }>(
          url,
          params ? { params } : {},
        ),
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
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Sec-Ch-Ua':
          '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        ...options?.headers,
      },
    };
  }
}
