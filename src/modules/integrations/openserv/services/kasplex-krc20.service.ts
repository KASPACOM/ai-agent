import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface GetKrc20ApiTokenResponse {
  message: string;
  result: any[];
}

export interface GetTokenWalletInfoDto {
  address: string;
  balance: number;
  ticker: string;
}

export interface GetTokenListResponse {
  result: any[];
  next: string | null;
  prev: string | null;
}

export interface TokenRowActivityItem {
  ticker: string;
  amount: string;
  type: string;
  time: string;
}

export interface FetchWalletActivityResponse {
  activityItems: TokenRowActivityItem[];
  next: string | null;
  prev: string | null;
}

export interface GetOrderAPIResponse {
  result: any[];
}

/**
 * KasplexKrc20Service
 *
 * Handles KRC20 token operations via Kasplex API including:
 * - Token information and metadata
 * - Wallet token balances and activity
 * - Token mint status and deployment tracking
 * - Order management and operations
 */
@Injectable()
export class KasplexKrc20Service {
  private readonly baseurl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseurl =
      this.configService.get<string>('KASPLEX_API_BASE_URL') ||
      'https://api.kasplex.org/v1';
  }

  async fetchTokenInfo(
    ticker: string,
    holders: boolean,
  ): Promise<GetKrc20ApiTokenResponse> {
    try {
      const response = await axios.get(
        `${this.baseurl}/krc20/token/${ticker}?holders=${holders}`,
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching token info:', error);
      throw error;
    }
  }

  async getBurntKRC20Balance(ticker: string): Promise<number | null> {
    try {
      const burntAddress =
        this.configService.get<string>('KASPA_BURNT_ADDRESS') ||
        'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';

      const response = await this.getTokenWalletBalanceInfo(
        burntAddress,
        ticker,
      );
      return response && response.balance ? response.balance / 1e8 : null;
    } catch (error) {
      console.error('Error fetching burnt balance:', error);
      return null;
    }
  }

  async getWalletTokenList(
    address: string,
    paginationKey: string | null = null,
    direction: 'next' | 'prev' | null = null,
  ): Promise<GetTokenListResponse> {
    try {
      let queryParam = '';
      if (paginationKey && direction) {
        queryParam = `?${direction}=${paginationKey}`;
      }

      const url = `${this.baseurl}/krc20/address/${address}/tokenlist${queryParam}`;
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error(`Error fetching token list for address ${address}:`, error);
      return { result: [], next: null, prev: null };
    }
  }

  async getTokenWalletBalanceInfo(
    address: string,
    ticker: string,
  ): Promise<GetTokenWalletInfoDto | null> {
    try {
      const url = `${this.baseurl}/krc20/address/${address}/token/${ticker}`;
      const response = await axios.get(url);

      const results = response.data.result;
      return results.length > 0
        ? {
            address,
            ...results[0],
            balance: results[0].balance / 1e8,
          }
        : null;
    } catch (error) {
      console.error(
        `Error fetching token info for ${ticker} at address ${address}:`,
        error,
      );
      return null;
    }
  }

  async getTokenMintsLeft(ticker: string): Promise<boolean> {
    try {
      const url = `${this.baseurl}/krc20/token/${ticker}`;
      const response = await axios.get(url);

      const tickerData = response.data.result && response.data.result[0];
      if (!tickerData) {
        throw new Error(
          `Failed to fetch information about the token ${ticker}`,
        );
      }
      return tickerData.state === 'finished';
    } catch (error) {
      console.error(`Error fetching token mint info for ${ticker}:`, error);
      return false;
    }
  }

  async getDevWalletBalance(
    devWallet: string,
    ticker: string,
  ): Promise<number> {
    try {
      const url = `${this.baseurl}/krc20/address/${devWallet}/token/${ticker}`;
      const response = await axios.get(url);

      const balance = response.data.result?.[0]?.balance || '0';
      return parseFloat(balance) / 1e8;
    } catch (error) {
      console.error('Error fetching dev wallet balance:', error);
      return 0;
    }
  }

  async getWalletActivity(
    address: string,
    paginationKey: string | null = null,
    direction: string | null = null,
  ): Promise<FetchWalletActivityResponse> {
    try {
      let queryParam = '';
      if (paginationKey && direction) {
        queryParam = `&${direction}=${paginationKey}`;
      }

      const url = `${this.baseurl}/krc20/oplist?address=${address}${queryParam}`;
      const response = await axios.get(url);

      const operations = response.data.result;

      if (operations.length === 0) {
        return {
          activityItems: [],
          next: null,
          prev: null,
        };
      }

      const activityItems: TokenRowActivityItem[] = operations
        .filter((op: any) => op.opAccept !== '-1')
        .map((op: any) => {
          let type: string;
          switch (op.op) {
            case 'transfer':
              type = 'Transfer';
              break;
            case 'mint':
              type = 'Mint';
              break;
            case 'deploy':
              type = 'Deploy';
              break;
            case 'list':
              type = 'PSKT List';
              break;
            case 'send':
              type = 'PSKT Send';
              break;
            default:
              type = 'Unknown';
              break;
          }

          const amount = op.amt
            ? (parseInt(op.amt) / 100000000).toFixed(2)
            : '---';

          return {
            ticker: op.tick,
            amount,
            type,
            time: new Date(parseInt(op.mtsAdd)).toLocaleString(),
          };
        });

      return {
        activityItems,
        next: response.data.next || null,
        prev: response.data.prev || null,
      };
    } catch (error) {
      console.error('Error fetching wallet activity:', error);
      return { activityItems: [], next: null, prev: null };
    }
  }

  async checkTokenDeployment(ticker: string): Promise<boolean> {
    const maxRetries = 7;
    const retryDelay = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const token = await this.fetchTokenInfo(ticker, true);
        if (token?.message === 'successful') {
          return true; // Token is deployed
        }
      } catch (error) {
        console.error('Error fetching token info:', error);
      }

      if (attempt < maxRetries - 1) {
        await this.delay(retryDelay);
      }
    }

    return false; // Token was not deployed after max retries
  }

  async getOrder(
    ticker: string,
    address: string,
    txId?: string,
  ): Promise<GetOrderAPIResponse> {
    try {
      const txidString = txId ? `&txid=${txId}` : '';
      const url = `${this.baseurl}/krc20/market/${ticker}?address=${address}${txidString}`;
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching order:', error);
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
