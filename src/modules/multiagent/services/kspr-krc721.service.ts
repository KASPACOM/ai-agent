import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface KRC721CollectionResponse {
  tick: string;
  name?: string;
  description?: string;
  totalSupply?: number;
  holders?: number;
  floorPrice?: number;
  volume24h?: number;
  imageUrl?: string;
  website?: string;
  social?: {
    twitter?: string;
    telegram?: string;
    discord?: string;
  };
}

export interface KRC721TokenResponse {
  tick: string;
  tokenId: string;
  owner?: string;
  metadata?: any;
  imageUrl?: string;
  traits?: any[];
}

export interface KRC721OperationResponse {
  txId: string;
  operation: string;
  tick: string;
  tokenId?: string;
  from?: string;
  to?: string;
  timestamp: string;
  blockHeight: number;
}

/**
 * KsprKrc721Service
 *
 * Handles KRC721 NFT operations via KRC721 Stream API including:
 * - Collection information and metadata
 * - Token details and ownership
 * - Operations and transfer history
 * - Holder information and statistics
 */
@Injectable()
export class KsprKrc721Service {
  private readonly logger = new Logger(KsprKrc721Service.name);
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('KRC721_API_BASE_URL') ||
      'https://mainnet.krc721.stream/api/v1/krc721/mainnet';
  }

  async fetchAllCollections(
    offset = 0,
    limit = 50,
    direction = 'desc',
  ): Promise<KRC721CollectionResponse[]> {
    const logId = `nft_collections_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - fetchAllCollections started`);
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: offset=${offset}, limit=${limit}, direction=${direction}`,
    );

    try {
      const url = `${this.baseUrl}/nfts`;
      const params = { offset, limit, direction };

      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);
      this.logger.debug(`[API-CALL] ${logId} - Request params:`, params);

      const response = await axios.get(url, { params });

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        collectionsCount: response.data?.length || 0,
      });

      return response.data || [];
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to fetch NFT collections`,
      );
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      return [];
    }
  }

  async fetchCollectionDetails(
    ticker: string,
  ): Promise<KRC721CollectionResponse> {
    const logId = `nft_collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - fetchCollectionDetails started`);
    this.logger.debug(`[API-CALL] ${logId} - Parameters: ticker=${ticker}`);

    try {
      const url = `${this.baseUrl}/nfts/${ticker}`;
      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);

      const response = await axios.get(url);

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        ticker: response.data?.tick,
        name: response.data?.name,
        totalSupply: response.data?.totalSupply,
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to fetch collection details for ${ticker}`,
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

  async fetchTokenDetails(
    ticker: string,
    tokenId: string,
  ): Promise<KRC721TokenResponse> {
    const logId = `nft_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - fetchTokenDetails started`);
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: ticker=${ticker}, tokenId=${tokenId}`,
    );

    try {
      const url = `${this.baseUrl}/nfts/${ticker}/${tokenId}`;
      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);

      const response = await axios.get(url);

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        ticker: response.data?.tick,
        tokenId: response.data?.tokenId,
        owner: response.data?.owner,
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to fetch token details for ${ticker}/${tokenId}`,
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

  async fetchCollectionOwners(ticker: string): Promise<any[]> {
    const logId = `nft_owners_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - fetchCollectionOwners started`);
    this.logger.debug(`[API-CALL] ${logId} - Parameters: ticker=${ticker}`);

    try {
      const url = `${this.baseUrl}/nfts/${ticker}/owners`;
      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);

      const response = await axios.get(url);

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        ownersCount: response.data?.length || 0,
      });

      return response.data || [];
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to fetch collection owners for ${ticker}`,
      );
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      return [];
    }
  }

  async fetchAddressHoldings(
    address: string,
    ticker?: string,
  ): Promise<KRC721TokenResponse[]> {
    const logId = `nft_holdings_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - fetchAddressHoldings started`);
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: address=${address}, ticker=${ticker}`,
    );

    try {
      const url = ticker
        ? `${this.baseUrl}/address/${address}/nfts/${ticker}`
        : `${this.baseUrl}/address/${address}/nfts`;

      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);

      const response = await axios.get(url);

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        holdingsCount: response.data?.length || 0,
      });

      return response.data || [];
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to fetch address holdings for ${address}`,
      );
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      return [];
    }
  }

  async fetchOperations(
    address?: string,
    ticker?: string,
    offset = 0,
    limit = 50,
  ): Promise<KRC721OperationResponse[]> {
    const logId = `nft_operations_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - fetchOperations started`);
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: address=${address}, ticker=${ticker}, offset=${offset}, limit=${limit}`,
    );

    try {
      const url = `${this.baseUrl}/operations`;
      const params: any = { offset, limit };
      if (address) params.address = address;
      if (ticker) params.tick = ticker;

      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);
      this.logger.debug(`[API-CALL] ${logId} - Request params:`, params);

      const response = await axios.get(url, { params });

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        operationsCount: response.data?.length || 0,
      });

      return response.data || [];
    } catch (error) {
      this.logger.error(`[API-CALL] ${logId} - Failed to fetch operations`);
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      return [];
    }
  }

  async fetchOwnershipHistory(
    ticker: string,
    tokenId: string,
  ): Promise<KRC721OperationResponse[]> {
    const logId = `nft_history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - fetchOwnershipHistory started`);
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: ticker=${ticker}, tokenId=${tokenId}`,
    );

    try {
      const url = `${this.baseUrl}/nfts/${ticker}/${tokenId}/ownership-history`;
      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);

      const response = await axios.get(url);

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        historyCount: response.data?.length || 0,
      });

      return response.data || [];
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to fetch ownership history for ${ticker}/${tokenId}`,
      );
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      return [];
    }
  }
}
