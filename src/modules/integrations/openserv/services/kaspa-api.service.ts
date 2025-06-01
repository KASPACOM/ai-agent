import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface FeeEstimate {
  priorityBucket: {
    feerate: number;
    estimatedSeconds: number;
  };
  normalBuckets: Array<{
    feerate: number;
    estimatedSeconds: number;
  }>;
  lowBuckets: Array<{
    feerate: number;
    estimatedSeconds: number;
  }>;
}

export interface KaspaApiWalletUtxo {
  outpoint: {
    transactionId: string;
    index: number;
  };
  utxoEntry: {
    amount: string;
    scriptPublicKey: {
      scriptPublicKey: string;
    };
    blockDaaScore: string;
    isCoinbase: boolean;
  };
}

const MOCK_FEE_ESTIMATE: FeeEstimate = {
  priorityBucket: { feerate: 1, estimatedSeconds: 10 },
  normalBuckets: [{ feerate: 1, estimatedSeconds: 30 }],
  lowBuckets: [{ feerate: 1, estimatedSeconds: 60 }],
};

/**
 * KaspaApiService
 *
 * Handles Kaspa blockchain API operations including:
 * - Price data and fee estimation
 * - Wallet balance and UTXO management
 * - Transaction handling and gas estimation
 * - Network and blockchain information
 */
@Injectable()
export class KaspaApiService {
  private readonly baseurl: string;
  private readonly KASPA_TRANSACTION_MASS = 3000;
  private readonly KRC20_TRANSACTION_MASS = 3370;
  private readonly TRADE_TRANSACTION_MASS = 11000;
  private readonly CANCEL_LIMIT_KAS = 0.5;
  private readonly WARNING_LIMIT_KAS = 0.2;

  constructor(private readonly configService: ConfigService) {
    this.baseurl =
      this.configService.get<string>('KASPA_API_BASE_URL') ||
      'https://api.kaspa.org';
  }

  async getKaspaPrice(): Promise<number> {
    try {
      const response = await axios.get(`${this.baseurl}/info/price`);
      return response.data.price;
    } catch (error) {
      console.error('Error fetching Kaspa price:', error);
      throw error;
    }
  }

  async getFeeEstimate(): Promise<FeeEstimate> {
    try {
      const response = await axios.get(`${this.baseurl}/info/fee-estimate`);
      return response.data;
    } catch (error) {
      console.error('Error fetching fee estimate:', error);
      return MOCK_FEE_ESTIMATE;
    }
  }

  async fetchWalletBalance(address: string): Promise<number> {
    try {
      const response = await axios.get(
        `${this.baseurl}/addresses/${address}/balance`,
      );
      return response.data.balance / 1e8;
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      return 0;
    }
  }

  async kaspaFeeEstimate(): Promise<number> {
    try {
      const response = await axios.get(`${this.baseurl}/info/fee-estimate`);
      const feeRate = response.data.lowBuckets[0].feerate;
      return feeRate;
    } catch (error) {
      console.error('Error fetching kaspa fee estimate:', error);
      return 0;
    }
  }

  async getPriorityFee(
    txType: 'KASPA' | 'TRANSFER' | 'TRADE',
  ): Promise<number | undefined> {
    try {
      let priorityFee = await this.kaspaFeeEstimate();

      if (priorityFee === 1) {
        return undefined;
      } else {
        priorityFee = await this.gasEstimator(txType);
        return priorityFee;
      }
    } catch (error) {
      console.error('Error calculating priority fee:', error);
      return undefined;
    }
  }

  async kaspaTradeFeeEstimate(): Promise<number> {
    try {
      const response = await axios.get(`${this.baseurl}/info/fee-estimate`);
      const feeRate = response.data.priorityBucket.feerate;
      return feeRate;
    } catch (error) {
      console.error('Error fetching kaspa trade fee estimate:', error);
      return 0;
    }
  }

  async gasEstimator(txType: 'KASPA' | 'TRANSFER' | 'TRADE'): Promise<number> {
    try {
      let fee;
      if (txType === 'TRADE') {
        fee = await this.kaspaTradeFeeEstimate();
      } else {
        fee = await this.kaspaFeeEstimate();
      }

      if (txType === 'KASPA') {
        return this.KASPA_TRANSACTION_MASS * fee;
      } else if (txType === 'TRANSFER') {
        return this.KRC20_TRANSACTION_MASS * fee;
      } else {
        return this.TRADE_TRANSACTION_MASS * fee;
      }
    } catch (error) {
      console.error('Error estimating gas:', error);
      return 0;
    }
  }

  async getWalletUtxosCount(walletAddress: string): Promise<number> {
    const utxos = await this.getWalletUtxos(walletAddress);
    return utxos.length;
  }

  async getWalletUtxos(walletAddress: string): Promise<KaspaApiWalletUtxo[]> {
    try {
      const payload = {
        addresses: [walletAddress],
      };

      const response = await axios.post(
        `${this.baseurl}/addresses/utxos`,
        payload,
      );

      return response.data;
    } catch (error) {
      console.error('Error fetching UTXOs:', error);
      throw error;
    }
  }

  async getNetworkInfo(): Promise<any> {
    try {
      const response = await axios.get(`${this.baseurl}/info/network`);
      return response.data;
    } catch (error) {
      console.error('Error fetching network info:', error);
      throw error;
    }
  }

  async getBlockDagInfo(): Promise<any> {
    try {
      const response = await axios.get(`${this.baseurl}/info/blockdag`);
      return response.data;
    } catch (error) {
      console.error('Error fetching blockdag info:', error);
      throw error;
    }
  }

  async getTransactionsByAddress(
    address: string,
    limit: number = 10,
  ): Promise<any[]> {
    try {
      const response = await axios.get(
        `${this.baseurl}/addresses/${address}/transactions?limit=${limit}`,
      );
      return response.data.transactions || [];
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }

  // Address validation
  isValidKaspaAddress(address: string): boolean {
    // Basic Kaspa address validation
    if (!address.startsWith('kaspa:')) return false;
    if (address.length < 65) return false;

    // Check for valid characters (base58-like)
    const validChars = /^kaspa:[a-km-z0-9]+$/i;
    return validChars.test(address);
  }
}
