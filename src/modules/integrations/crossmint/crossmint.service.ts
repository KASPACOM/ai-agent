import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCrossmint, CrossmintAuth } from '@crossmint/server-sdk';
import {
  CrossmintResponse,
  CrossmintHealthStatus,
} from './models/crossmint.model';
import {
  CrossmintEnvironment,
  BlockchainNetwork,
  Currency,
  ServiceName,
  HealthStatus,
} from './models/enums/crossmint.enums';

/**
 * CrossmintService - Real integration with Crossmint APIs
 *
 * This service provides access to Crossmint's actual capabilities:
 * - Authentication and session management
 * - Wallet creation (custodial)
 * - NFT minting and collections
 * - Checkout and payments for real-world items
 * - Order management
 *
 * Note: Many functions previously implemented were imaginary.
 * This version only implements what Crossmint actually provides.
 */
@Injectable()
export class CrossmintService {
  private readonly logger = new Logger(CrossmintService.name);
  private crossmint: any;
  private crossmintAuth: CrossmintAuth;
  private readonly apiKey: string;
  private readonly environment: CrossmintEnvironment;
  private readonly projectId: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('CROSSMINT_API_KEY') || '';
    this.environment =
      this.configService.get<CrossmintEnvironment>('CROSSMINT_ENVIRONMENT') ||
      CrossmintEnvironment.STAGING;
    this.projectId =
      this.configService.get<string>('CROSSMINT_PROJECT_ID') || '';

    // Set base URL based on environment
    this.baseUrl =
      this.environment === CrossmintEnvironment.PRODUCTION
        ? 'https://www.crossmint.com'
        : 'https://staging.crossmint.com';

    // Initialize real Crossmint SDK
    this.crossmint = createCrossmint({
      apiKey: this.apiKey,
    });

    this.crossmintAuth = CrossmintAuth.from(this.crossmint);
  }

  /**
   * Create a custodial wallet for a user
   * This is a REAL Crossmint API
   */
  async createCustodialWallet(
    email: string,
    chain: BlockchainNetwork = BlockchainNetwork.ETHEREUM,
  ): Promise<CrossmintResponse<{ chain: string; publicKey: string }>> {
    try {
      this.logger.log(
        `Creating custodial wallet for email: ${email} on chain: ${chain}`,
      );

      const response = await fetch(`${this.baseUrl}/api/v1-alpha1/wallets`, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          chain,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        data,
        message: 'Custodial wallet created successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to create custodial wallet: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create custodial wallet',
      };
    }
  }

  /**
   * Create and mint an NFT
   * This is a REAL Crossmint API
   */
  async mintNFT(params: {
    recipient: string;
    metadata: {
      name: string;
      description: string;
      image: string;
    };
    chain?: BlockchainNetwork;
  }): Promise<CrossmintResponse<any>> {
    try {
      this.logger.log(`Minting NFT for recipient: ${params.recipient}`);

      const chain = params.chain || BlockchainNetwork.POLYGON_AMOY;
      const collectionName =
        chain === BlockchainNetwork.SOLANA ? 'default-solana' : 'default';

      const response = await fetch(
        `${this.baseUrl}/api/2022-06-09/collections/${collectionName}/nfts`,
        {
          method: 'POST',
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: `email:${params.recipient}:${chain}`,
            metadata: params.metadata,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        data,
        message: 'NFT minting started successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to mint NFT: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Failed to mint NFT',
      };
    }
  }

  /**
   * Create an order for purchasing real-world items
   * This is a REAL Crossmint API (Amazon/Shopify integration)
   */
  async createOrder(params: {
    recipient: {
      email: string;
      physicalAddress?: {
        name: string;
        line1: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
    };
    payment: {
      method: string;
      currency: Currency;
    };
    lineItems: Array<{
      productLocator: string; // e.g., "amazon:B01DFKC2SO" or "shopify:url:variant-id"
    }>;
  }): Promise<CrossmintResponse<any>> {
    try {
      this.logger.log(
        `Creating order for recipient: ${params.recipient.email}`,
      );

      const response = await fetch(`${this.baseUrl}/api/2022-06-09/orders`, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        data,
        message: 'Order created successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to create order: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create order',
      };
    }
  }

  /**
   * Get order status
   * This is a REAL Crossmint API
   */
  async getOrderStatus(orderId: string): Promise<CrossmintResponse<any>> {
    try {
      this.logger.log(`Getting order status for: ${orderId}`);

      const response = await fetch(
        `${this.baseUrl}/api/2022-06-09/orders/${orderId}`,
        {
          method: 'GET',
          headers: {
            'X-API-KEY': this.apiKey,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        data,
        message: 'Order status retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get order status: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get order status',
      };
    }
  }

  /**
   * Check action status (minting, orders, etc.)
   * This is a REAL Crossmint API
   */
  async getActionStatus(actionId: string): Promise<CrossmintResponse<any>> {
    try {
      this.logger.log(`Getting action status for: ${actionId}`);

      const response = await fetch(
        `${this.baseUrl}/api/2022-06-09/actions/${actionId}`,
        {
          method: 'GET',
          headers: {
            'X-API-KEY': this.apiKey,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        data,
        message: 'Action status retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get action status: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get action status',
      };
    }
  }

  /**
   * Authentication methods using real Crossmint SDK
   */
  async validateSession(
    jwt?: string,
    refreshToken?: string,
  ): Promise<CrossmintResponse<{ jwt: string; userId: string }>> {
    try {
      const session = await this.crossmintAuth.getSession({
        jwt,
        refreshToken,
      });

      return {
        success: true,
        data: session,
        message: 'Session validated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to validate session: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Failed to validate session',
      };
    }
  }

  async getUserProfile(userId: string): Promise<CrossmintResponse<any>> {
    try {
      const user = await this.crossmintAuth.getUser(userId);

      return {
        success: true,
        data: user,
        message: 'User profile retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get user profile: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get user profile',
      };
    }
  }

  /**
   * Health check for the service
   */
  async getHealthStatus(): Promise<CrossmintResponse<CrossmintHealthStatus>> {
    try {
      // Simple health check - try to validate configuration
      const isConfigured = !!(this.apiKey && this.environment);

      const healthStatus: CrossmintHealthStatus = {
        service: ServiceName.CROSSMINT,
        status: isConfigured ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        timestamp: new Date(),
        environment: this.environment,
        version: '2022-06-09', // API version we're using
      };

      return {
        success: true,
        data: healthStatus,
        message: 'Health status retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get health status: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get health status',
      };
    }
  }
}
