import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(KaspaApiService.name);
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
    const logId = `kaspa_price_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - getKaspaPrice started`);

    try {
      const url = `${this.baseurl}/info/price`;
      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);

      const response = await axios.get(url);

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        price: response.data.price,
      });

      return response.data.price;
    } catch (error) {
      this.logger.error(`[API-CALL] ${logId} - Failed to fetch Kaspa price`);
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
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
    const logId = `wallet_balance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - fetchWalletBalance started`);
    this.logger.debug(`[API-CALL] ${logId} - Parameters: address=${address}`);

    try {
      const url = `${this.baseurl}/addresses/${address}/balance`;
      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);

      const response = await axios.get(url);

      const balanceKas = response.data.balance / 1e8;

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        rawBalance: response.data.balance,
        balanceKas: balanceKas,
        address: address,
      });

      return balanceKas;
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to fetch wallet balance for ${address}`,
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
    const logId = `gas_estimator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - gasEstimator started`);
    this.logger.debug(`[API-CALL] ${logId} - Parameters: txType=${txType}`);

    try {
      let fee;
      if (txType === 'TRADE') {
        fee = await this.kaspaTradeFeeEstimate();
      } else {
        fee = await this.kaspaFeeEstimate();
      }

      let gasEstimate;
      if (txType === 'KASPA') {
        gasEstimate = this.KASPA_TRANSACTION_MASS * fee;
      } else if (txType === 'TRANSFER') {
        gasEstimate = this.KRC20_TRANSACTION_MASS * fee;
      } else {
        gasEstimate = this.TRADE_TRANSACTION_MASS * fee;
      }

      this.logger.log(`[API-CALL] ${logId} - Gas estimation completed`);
      this.logger.debug(`[API-CALL] ${logId} - Calculation:`, {
        txType: txType,
        feeRate: fee,
        mass:
          txType === 'KASPA'
            ? this.KASPA_TRANSACTION_MASS
            : txType === 'TRANSFER'
              ? this.KRC20_TRANSACTION_MASS
              : this.TRADE_TRANSACTION_MASS,
        gasEstimate: gasEstimate,
      });

      return gasEstimate;
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to estimate gas for ${txType}`,
      );
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
      });
      return 0;
    }
  }

  async getWalletUtxosCount(walletAddress: string): Promise<number> {
    const utxos = await this.getWalletUtxos(walletAddress);
    return utxos.length;
  }

  async getWalletUtxos(walletAddress: string): Promise<KaspaApiWalletUtxo[]> {
    const logId = `wallet_utxos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - getWalletUtxos started`);
    this.logger.debug(
      `[API-CALL] ${logId} - Parameters: walletAddress=${walletAddress}`,
    );

    try {
      const url = `${this.baseurl}/addresses/utxos`;
      const payload = {
        addresses: [walletAddress],
      };

      this.logger.debug(`[API-CALL] ${logId} - Making request to: ${url}`);
      this.logger.debug(`[API-CALL] ${logId} - Request payload:`, payload);

      const response = await axios.post(url, payload);

      this.logger.log(`[API-CALL] ${logId} - Request successful`);
      this.logger.debug(
        `[API-CALL] ${logId} - Response status: ${response.status}`,
      );
      this.logger.debug(`[API-CALL] ${logId} - Response data:`, {
        utxoCount: response.data.length,
        walletAddress: walletAddress,
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to fetch UTXOs for ${walletAddress}`,
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
    const logId = `validate_address_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`[API-CALL] ${logId} - isValidKaspaAddress started`);
    this.logger.debug(`[API-CALL] ${logId} - Parameters: address=${address}`);

    try {
      // Kaspa addresses start with 'kaspa:' and have specific format
      const isValid = address.startsWith('kaspa:') && address.length >= 61;

      this.logger.log(`[API-CALL] ${logId} - Address validation completed`);
      this.logger.debug(`[API-CALL] ${logId} - Validation result:`, {
        address: address,
        isValid: isValid,
        startsWithKaspa: address.startsWith('kaspa:'),
        correctLength: address.length >= 61,
      });

      return isValid;
    } catch (error) {
      this.logger.error(
        `[API-CALL] ${logId} - Failed to validate address ${address}`,
      );
      this.logger.error(`[API-CALL] ${logId} - Error details:`, {
        message: error.message,
      });
      return false;
    }
  }
}
