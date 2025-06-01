import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  TokenListItemResponse,
  BackendTokenResponse,
  BackendTokenStatsResponse,
  HolderChangeResponse,
  TokenSearchItems,
  MintInfoResponseDto,
  BackendTokenMetadata,
  TokenSentiment,
  BackendKrc721Response,
  NFTCollectionDetails,
  Krc721TokenFilterRequest,
  Krc721TokenResponse,
  NFTCollectionSearch,
  CollectionPriceHistory,
  DailyTradingVolume,
  KnsDailyTradeStats,
  KnsSoldOrdersResponse,
} from './models/token-registry.model';

/**
 * TokenRegistryAgentService
 *
 * Handles comprehensive token registry operations including:
 * - KRC20 token management and trading
 * - KRC721 (NFT) collection management
 * - Token metadata and statistics
 * - Token search and discovery
 * - Price history and market data
 * - KNS (Kaspa Name Service) operations
 */
@Injectable()
export class TokenRegistryAgentService {
  private readonly logger = new Logger(TokenRegistryAgentService.name);
  private readonly BASEURL: string;

  private readonly KRC20CONTROLLER = 'krc20';
  private readonly KRC721CONTROLLER = 'krc721';
  private readonly KRC20METADATA_CONTROLLER = 'krc20metadata';
  private readonly KRC721METADATA_CONTROLLER = 'krc721metadata';
  private readonly KRC721_DATA_CONTROLLER = 'krc721-data';
  private readonly KRC721_SWAP = 'krc721-egg-swap';
  private readonly KNS_DATA_CONTROLLER = 'kns-data';
  private readonly P2P_KNS_ACTIONS_CONTROLLER = 'kns-actions';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.BASEURL =
      this.configService.get<string>('BACKEND_API_BASE_URL') ||
      'https://api.kaspiano.com';
  }

  // === KRC20 Token Operations ===

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

  async getMintInfo(ticker: string): Promise<MintInfoResponseDto> {
    try {
      const url = `${this.BASEURL}/${this.KRC20CONTROLLER}/mint-info/${ticker}`;

      const response = await firstValueFrom(
        this.httpService.get<MintInfoResponseDto>(
          url,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get mint info for ${ticker}`, error);
      throw error;
    }
  }

  async deployToKaspiano(ticker: string, walletAddress: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.BASEURL}/${this.KRC20CONTROLLER}/deploy`,
          {
            ticker,
            walletAddress,
          },
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to deploy ${ticker} to Kaspiano`, error);
      throw error;
    }
  }

  // === KRC20 Metadata Operations ===

  async updateTokenMetadata(
    tokenDetails: FormData,
    isAdmin = false,
  ): Promise<any> {
    try {
      let url = `${this.BASEURL}/${this.KRC20METADATA_CONTROLLER}/update`;
      if (isAdmin) {
        url += '-admin';
      }

      const response = await firstValueFrom(
        this.httpService.post<any>(
          url,
          tokenDetails,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to update token metadata', error);
      throw error;
    }
  }

  async validateFormDetailsForUpdateTokenMetadata(
    tokenDetails: FormData,
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<any>(
          `${this.BASEURL}/${this.KRC20METADATA_CONTROLLER}/update-validate`,
          tokenDetails,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        'Failed to validate form details for update token metadata',
        error,
      );
      throw error;
    }
  }

  async recalculateRugScore(ticker: string): Promise<number> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ rugScore: number }>(
          `${this.BASEURL}/${this.KRC20METADATA_CONTROLLER}/update-rug-score`,
          { ticker },
          { withCredentials: true },
        ),
      );
      return response.data.rugScore;
    } catch (error) {
      this.logger.error(`Failed to recalculate rug score for ${ticker}`, error);
      return 0;
    }
  }

  async updateWalletSentiment(
    ticker: string,
    sentiment: keyof TokenSentiment | null,
  ): Promise<BackendTokenMetadata> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<BackendTokenMetadata>(
          `${this.BASEURL}/${this.KRC20METADATA_CONTROLLER}/set-sentiment`,
          { sentiment, ticker },
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to update wallet sentiment for ${ticker}`,
        error,
      );
      throw error;
    }
  }

  // === KRC721 Collection Operations ===

  async fetchAllCollections(
    limit: number = 50,
    skip: number = 0,
    timeInterval: string = '10m',
    order: string | null = null,
    direction: string | null = null,
    filterSoldOut?: boolean,
  ): Promise<BackendKrc721Response> {
    try {
      const params: any = {
        skip: skip.toString(),
        limit: limit.toString(),
        timeInterval,
      };

      if (order) params.order = order;
      if (direction) params.direction = direction;
      if (filterSoldOut) params.filterSoldOut = filterSoldOut;

      const response = await firstValueFrom(
        this.httpService.get<BackendKrc721Response>(
          `${this.BASEURL}/${this.KRC721CONTROLLER}`,
          { params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch all collections', error);
      return { collections: [], totalCount: 0 };
    }
  }

  async fetchCollectionByTicker(
    ticker: string,
    refresh = false,
  ): Promise<NFTCollectionDetails> {
    try {
      const params: any = {};
      if (refresh) params.refresh = 'true';

      const response = await firstValueFrom(
        this.httpService.get<NFTCollectionDetails>(
          `${this.BASEURL}/${this.KRC721CONTROLLER}/${ticker.toUpperCase()}`,
          { params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch collection by ticker: ${ticker}`,
        error,
      );
      throw error;
    }
  }

  async searchNFT(query: string): Promise<NFTCollectionSearch[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<NFTCollectionSearch[]>(
          `${this.BASEURL}/${this.KRC721CONTROLLER}/search`,
          { params: { query } },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to search NFT: ${query}`, error);
      return [];
    }
  }

  async fetchFilteredTokens(
    filterRequest: Krc721TokenFilterRequest,
  ): Promise<Krc721TokenResponse> {
    try {
      if (!filterRequest.ticker) {
        throw new Error('Ticker is required for fetching filtered tokens.');
      }

      const requestWithUpperCaseTicker = {
        ...filterRequest,
        ticker: filterRequest.ticker.toUpperCase(),
      };

      const response = await firstValueFrom(
        this.httpService.post<Krc721TokenResponse>(
          `${this.BASEURL}/${this.KRC721CONTROLLER}/tokens`,
          requestWithUpperCaseTicker,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch filtered tokens', error);
      return {
        items: [],
        totalCount: 0,
      };
    }
  }

  async getTokenRank(
    ticker: string,
    tokenId: string,
  ): Promise<{ rank: number }> {
    try {
      const params = {
        ticker,
        tokenId,
      };

      const response = await firstValueFrom(
        this.httpService.get<{ rank: number }>(
          `${this.BASEURL}/${this.KRC721CONTROLLER}/tokens/rank`,
          { params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get token rank for ${ticker}:${tokenId}`,
        error,
      );
      return { rank: 0 };
    }
  }

  async deployKrc721(deployData: { ticker: string }): Promise<any> {
    try {
      const url = `${this.BASEURL}/${this.KRC721CONTROLLER}/deploy`;
      const response = await firstValueFrom(
        this.httpService.post<any>(
          url,
          deployData,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to deploy KRC721: ${deployData.ticker}`, error);
      throw error;
    }
  }

  async mintKrc721(mintData: {
    ticker: string;
    mintAmount: string;
    revealTxn?: string;
  }): Promise<any> {
    try {
      const url = `${this.BASEURL}/${this.KRC721CONTROLLER}/mint`;
      const response = await firstValueFrom(
        this.httpService.post<any>(url, mintData, this.getAuthorizedOptions()),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to mint KRC721: ${mintData.ticker}`, error);
      throw error;
    }
  }

  async Krc721IsAllowedMint(ticker: string): Promise<{
    isAllowed: boolean;
    startDate?: Date;
    endDate?: Date;
    alreadyMinted?: boolean;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          isAllowed: boolean;
          startDate?: Date;
          endDate?: Date;
          alreadyMinted?: boolean;
        }>(
          `${this.BASEURL}/${this.KRC721CONTROLLER}/${ticker}/can-mint`,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to check if KRC721 mint is allowed: ${ticker}`,
        error,
      );
      throw error;
    }
  }

  async getTradeStatsKrc721(ticker: string, timeFrame: string): Promise<any> {
    try {
      const params = {
        ticker: ticker.toUpperCase(),
        timeFrame,
      };

      const response = await firstValueFrom(
        this.httpService.get<any>(
          `${this.BASEURL}/${this.KRC721_DATA_CONTROLLER}/trade-stats`,
          { params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get KRC721 trade stats for ${ticker}`,
        error,
      );
      return {
        totalTradesKaspiano: 0,
        totalVolumeKasKaspiano: 0.0,
        totalVolumeUsdKaspiano: 0.0,
        tokens: [],
      };
    }
  }

  async getSoldOrdersKrc721(ticker: string, tokenId?: string): Promise<any> {
    try {
      const params: any = { ticker };
      if (tokenId) {
        params.tokenId = tokenId;
      }

      const response = await firstValueFrom(
        this.httpService.get<any>(
          `${this.BASEURL}/${this.KRC721_DATA_CONTROLLER}/sold-orders`,
          { params },
        ),
      );

      if (Array.isArray(response.data)) {
        return { orders: response.data };
      }
      if (
        response.data &&
        typeof response.data === 'object' &&
        response.data.orders &&
        Array.isArray(response.data.orders)
      ) {
        return { orders: response.data.orders };
      }
      return { orders: [] };
    } catch (error) {
      this.logger.error(
        `Failed to get KRC721 sold orders for ${ticker}`,
        error,
      );
      return { orders: [] };
    }
  }

  async getCollectionPriceHistory(
    ticker: string,
    timeframe?: string,
  ): Promise<CollectionPriceHistory[]> {
    try {
      let url = `${this.BASEURL}/${this.KRC721CONTROLLER}/price-history/${ticker.toUpperCase()}`;

      if (timeframe && timeframe !== 'All') {
        url += `?timeframe=${timeframe}`;
      }

      const response = await firstValueFrom(
        this.httpService.get<{ data: CollectionPriceHistory[] }>(url),
      );
      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Failed to get collection price history for ${ticker}`,
        error,
      );
      return [];
    }
  }

  async getCollectionStats(
    ticker: string,
    timeframe?: string,
  ): Promise<DailyTradingVolume[]> {
    try {
      const params = { ticker };
      let url = `${this.BASEURL}/${this.KRC721_DATA_CONTROLLER}/graph-stats`;

      if (timeframe && timeframe !== 'All') {
        url += `?timeframe=${timeframe}`;
      }

      const response = await firstValueFrom(
        this.httpService.get<DailyTradingVolume[]>(url, { params }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get collection stats for ${ticker}`, error);
      return [];
    }
  }

  // === KRC721 Metadata Operations ===

  async updateCollectionMetadata(
    tokenDetails: FormData,
    isAdmin = false,
  ): Promise<any> {
    try {
      let url = `${this.BASEURL}/${this.KRC721METADATA_CONTROLLER}/update`;
      if (isAdmin) {
        url += '-admin';
      }

      const response = await firstValueFrom(
        this.httpService.post<any>(
          url,
          tokenDetails,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to update collection metadata', error);
      throw error;
    }
  }

  async patchCollectionMetadata(
    ticker: string,
    tokenDetails: FormData,
  ): Promise<any> {
    try {
      const url = `${this.BASEURL}/${this.KRC721METADATA_CONTROLLER}/${ticker}`;

      const response = await firstValueFrom(
        this.httpService.patch<any>(
          url,
          tokenDetails,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to patch collection metadata for ${ticker}`,
        error,
      );
      throw error;
    }
  }

  // === KRC721 Egg Swap ===

  async getKrc721EggSwap(ticker: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<any>(
          `${this.BASEURL}/${this.KRC721_SWAP}/${ticker}`,
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get KRC721 egg swap for ${ticker}`, error);
      throw error;
    }
  }

  async processKrc721EggSwap(swapId: string, tokenId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<any>(
          `${this.BASEURL}/${this.KRC721_SWAP}/process/${swapId}`,
          { tokenId },
          this.getAuthorizedOptions(),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to process KRC721 egg swap ${swapId}`, error);
      throw error;
    }
  }

  // === KNS Operations ===

  async getKnsSoldOrders(assetId?: string): Promise<KnsSoldOrdersResponse> {
    try {
      const params: any = {};
      if (assetId) params.assetId = assetId;

      const response = await firstValueFrom(
        this.httpService.get<KnsSoldOrdersResponse>(
          `${this.BASEURL}/${this.KNS_DATA_CONTROLLER}/sold-orders`,
          { params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get KNS sold orders', error);
      return { orders: [] };
    }
  }

  async getKnsGraphStats(timeframe?: string): Promise<KnsDailyTradeStats[]> {
    try {
      const params: any = {};
      if (timeframe && timeframe !== 'All') params.timeframe = timeframe;

      const response = await firstValueFrom(
        this.httpService.get<KnsDailyTradeStats[]>(
          `${this.BASEURL}/${this.KNS_DATA_CONTROLLER}/graph-stats`,
          { params },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get KNS graph stats', error);
      return [];
    }
  }

  async saveKnsActionOnBackend(result: any): Promise<{
    success: boolean;
    id: string;
  }> {
    try {
      const payload = {
        commitTx: result.commitTx,
        revealTx: result.revealTx,
        action: result.knsActionData,
      };

      const url = `${this.BASEURL}/${this.P2P_KNS_ACTIONS_CONTROLLER}/save-kns-action`;

      const response = await firstValueFrom(
        this.httpService.post<any>(url, payload, this.getAuthorizedOptions()),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to save KNS action on backend', error);
      throw error;
    }
  }

  private getAuthorizedOptions(options?: any): any {
    return {
      ...options,
      withCredentials: true,
    };
  }
}
