import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import {
  OpenServAgentConfig,
  OpenServCapability,
  OpenServAdvancedConfig,
} from './models/openserv.model';

// Export types for external use
export { OpenServAgentConfig, OpenServAdvancedConfig };

/**
 * OpenServConfigurationService
 *
 * Provides comprehensive configuration for OpenServ integration including:
 * - Agent capability definitions and parameters
 * - Advanced orchestration settings (memory, multi-agent coordination)
 * - Performance optimization settings (caching, parallel execution)
 * - Security controls (rate limiting, user isolation)
 */
@Injectable()
export class OpenServConfigurationService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get configurations for all available agents
   */
  getAgentConfigurations(): OpenServAgentConfig[] {
    return [
      {
        name: 'defi-agent',
        description:
          'Advanced DeFi operations including swaps, liquidity management, and token creation across multiple L2 networks',
        capabilities: this.getDeFiCapabilities(),
        features: {
          memoryEnabled: true,
          contextAware: true,
          multiAgentCoordination: true,
          userStateManagement: true,
          crossSessionPersistence: true,
        },
        metadata: {
          version: '2.0.0',
          category: 'defi',
          priority: 1,
          maxConcurrency: 3,
        },
      },
      {
        name: 'trading-agent',
        description:
          'Trading operations including order management, market analysis, and portfolio optimization',
        capabilities: this.getTradingCapabilities(),
        features: {
          memoryEnabled: true,
          contextAware: true,
          multiAgentCoordination: true,
          userStateManagement: true,
          crossSessionPersistence: true,
        },
        metadata: {
          version: '2.0.0',
          category: 'trading',
          priority: 2,
          maxConcurrency: 3,
        },
      },
      {
        name: 'wallet-agent',
        description:
          'Wallet portfolio management, analytics, and transaction tracking',
        capabilities: this.getWalletCapabilities(),
        features: {
          memoryEnabled: true,
          contextAware: true,
          multiAgentCoordination: false,
          userStateManagement: true,
          crossSessionPersistence: true,
        },
        metadata: {
          version: '2.0.0',
          category: 'wallet',
          priority: 3,
          maxConcurrency: 2,
        },
      },
      {
        name: 'token-registry-agent',
        description:
          'Token information, pricing, and metadata management across multiple networks',
        capabilities: this.getTokenRegistryCapabilities(),
        features: {
          memoryEnabled: false,
          contextAware: false,
          multiAgentCoordination: false,
          userStateManagement: false,
          crossSessionPersistence: false,
        },
        metadata: {
          version: '2.0.0',
          category: 'utility',
          priority: 4,
          maxConcurrency: 5,
        },
      },
      {
        name: 'user-management-agent',
        description:
          'Internal user management including authentication, preferences, and activity tracking',
        capabilities: this.getUserManagementCapabilities(),
        features: {
          memoryEnabled: true,
          contextAware: false,
          multiAgentCoordination: false,
          userStateManagement: true,
          crossSessionPersistence: true,
        },
        metadata: {
          version: '2.0.0',
          category: 'internal',
          priority: 5,
          maxConcurrency: 2,
        },
      },
    ];
  }

  /**
   * Get advanced orchestration configuration
   */
  getAdvancedConfiguration(): OpenServAdvancedConfig {
    return {
      memory: {
        maxContextLength: 10000,
        compressionThreshold: 8000,
        retentionPeriod: 86400000, // 24 hours in ms
        enableSemanticCompression: true,
      },
      orchestration: {
        maxConcurrentAgents: 5,
        timeoutMs: 30000,
        retryAttempts: 3,
        enableIntelligentRouting: true,
        enableWorkflowChaining: true,
        memoryManagement: {
          maxHistoryLength: 50,
          contextCompression: true,
          sessionTimeout: 3600000, // 1 hour in ms
        },
      },
      performance: {
        enableCaching: true,
        cacheExpirationMs: 300000, // 5 minutes
        enableParallelExecution: true,
        maxParallelTasks: 3,
        caching: {
          enabled: true,
          ttl: 300000, // 5 minutes
        },
      },
      security: {
        enableUserIsolation: true,
        enableRateLimiting: true,
        maxRequestsPerMinute: 60,
        enableSensitiveDataHandling: true,
      },
    };
  }

  /**
   * Alias for getAdvancedConfiguration (for compatibility)
   */
  getAdvancedConfig(): OpenServAdvancedConfig {
    return this.getAdvancedConfiguration();
  }

  private getDeFiCapabilities(): OpenServCapability[] {
    return [
      {
        name: 'swap_tokens',
        description:
          'Execute token swaps on DEX with slippage protection and optimal routing',
        parameters: {
          required: ['fromToken', 'toToken', 'amount', 'walletAddress'],
          optional: ['slippage', 'network'],
          schema: {
            fromToken: {
              type: 'string',
              description: 'Source token address or symbol',
            },
            toToken: {
              type: 'string',
              description: 'Destination token address or symbol',
            },
            amount: {
              type: 'string',
              description: 'Amount to swap (in source token units)',
            },
            slippage: {
              type: 'number',
              description: 'Maximum slippage percentage (0.1-50)',
              minimum: 0.1,
              maximum: 50,
            },
            network: {
              type: 'string',
              enum: ['kasplex', 'igra'],
              description: 'Target network',
            },
            walletAddress: {
              type: 'string',
              description: 'User wallet address',
            },
          },
        },
        examples: [
          {
            input: {
              fromToken: 'KASPA',
              toToken: 'USDT',
              amount: '1000',
              slippage: 1.0,
              network: 'kasplex',
              walletAddress: '0x123...',
            },
            output: { transactionHash: '0xabc...', expectedOutput: '500.0' },
            description: 'Swap 1000 KASPA for USDT with 1% slippage',
          },
        ],
        features: {
          requiresWallet: true,
          requiresAuth: true,
          modifiesState: true,
          cacheable: false,
        },
      },
      {
        name: 'get_swap_quote',
        description: 'Get real-time price quote for token swap',
        parameters: {
          required: ['tokenIn', 'tokenOut', 'amountIn'],
          optional: ['network'],
          schema: {
            tokenIn: {
              type: 'string',
              description: 'Input token address or symbol',
            },
            tokenOut: {
              type: 'string',
              description: 'Output token address or symbol',
            },
            amountIn: { type: 'string', description: 'Input amount' },
            network: { type: 'string', enum: ['kasplex', 'igra'] },
          },
        },
        examples: [
          {
            input: {
              tokenIn: 'KASPA',
              tokenOut: 'USDT',
              amountIn: '500',
              network: 'kasplex',
            },
            output: { expectedOutput: '250.0', priceImpact: 0.2 },
            description: 'Get quote for swapping 500 KASPA to USDT',
          },
        ],
        features: {
          requiresWallet: false,
          requiresAuth: false,
          modifiesState: false,
          cacheable: true,
        },
      },
      {
        name: 'add_liquidity',
        description: 'Add liquidity to DEX pool and receive LP tokens',
        parameters: {
          required: ['tokenA', 'tokenB', 'amountA', 'amountB', 'walletAddress'],
          optional: ['network'],
          schema: {
            tokenA: {
              type: 'string',
              description: 'First token address or symbol',
            },
            tokenB: {
              type: 'string',
              description: 'Second token address or symbol',
            },
            amountA: { type: 'string', description: 'Amount of token A' },
            amountB: { type: 'string', description: 'Amount of token B' },
            network: { type: 'string', enum: ['kasplex', 'igra'] },
            walletAddress: {
              type: 'string',
              description: 'User wallet address',
            },
          },
        },
        examples: [
          {
            input: {
              tokenA: 'KASPA',
              tokenB: 'USDT',
              amountA: '1000',
              amountB: '500',
              network: 'kasplex',
              walletAddress: '0x123...',
            },
            output: { lpTokens: '707.1', pairAddress: '0xdef...' },
            description: 'Add liquidity to KASPA/USDT pool',
          },
        ],
        features: {
          requiresWallet: true,
          requiresAuth: true,
          modifiesState: true,
          cacheable: false,
        },
      },
      {
        name: 'create_token',
        description: 'Deploy new ERC20 token on L2 network',
        parameters: {
          required: [
            'name',
            'symbol',
            'decimals',
            'initialSupply',
            'walletAddress',
          ],
          optional: ['network'],
          schema: {
            name: { type: 'string', description: 'Token name' },
            symbol: { type: 'string', description: 'Token symbol' },
            decimals: {
              type: 'number',
              description: 'Token decimals',
              minimum: 0,
              maximum: 18,
            },
            initialSupply: {
              type: 'string',
              description: 'Initial token supply',
            },
            network: { type: 'string', enum: ['kasplex', 'igra'] },
            walletAddress: {
              type: 'string',
              description: 'Deployer wallet address',
            },
          },
        },
        examples: [
          {
            input: {
              name: 'My Token',
              symbol: 'MYTOKEN',
              decimals: 18,
              initialSupply: '1000000',
              network: 'kasplex',
              walletAddress: '0x123...',
            },
            output: { tokenAddress: '0xnew...', transactionHash: '0xabc...' },
            description: 'Create MYTOKEN with 1M supply',
          },
        ],
        features: {
          requiresWallet: true,
          requiresAuth: true,
          modifiesState: true,
          cacheable: false,
        },
      },
    ];
  }

  private getTradingCapabilities(): OpenServCapability[] {
    return [
      {
        name: 'create_sell_order',
        description: 'Create a sell order on the marketplace',
        parameters: {
          required: ['ticker', 'quantity', 'pricePerToken', 'walletAddress'],
          optional: [],
          schema: {
            ticker: { type: 'string', description: 'Token ticker symbol' },
            quantity: {
              type: 'number',
              description: 'Quantity to sell',
              minimum: 0,
            },
            pricePerToken: {
              type: 'number',
              description: 'Price per token',
              minimum: 0,
            },
            walletAddress: {
              type: 'string',
              description: 'Seller wallet address',
            },
          },
        },
        examples: [
          {
            input: {
              ticker: 'KASPA',
              quantity: 1000,
              pricePerToken: 0.15,
              walletAddress: 'kaspa:abc123...',
            },
            output: { orderId: 'order_123', status: 'created' },
            description: 'Sell 1000 KASPA at 0.15 per token',
          },
        ],
        features: {
          requiresWallet: true,
          requiresAuth: true,
          modifiesState: true,
          cacheable: false,
        },
      },
      {
        name: 'get_market_data',
        description: 'Get comprehensive market data for tokens',
        parameters: {
          required: [],
          optional: ['ticker', 'timeframe', 'includeVolume', 'includeOrders'],
          schema: {
            ticker: {
              type: 'string',
              description: 'Token ticker (optional for all tokens)',
            },
            timeframe: {
              type: 'string',
              enum: ['1h', '24h', '7d', '30d'],
              description: 'Data timeframe',
            },
            includeVolume: {
              type: 'boolean',
              description: 'Include volume data',
            },
            includeOrders: {
              type: 'boolean',
              description: 'Include order book data',
            },
          },
        },
        examples: [
          {
            input: {
              ticker: 'KASPA',
              timeframe: '24h',
              includeVolume: true,
              includeOrders: true,
            },
            output: { price: 0.15, volume24h: 50000, orders: [] },
            description: 'Get 24h market data for KASPA',
          },
        ],
        features: {
          requiresWallet: false,
          requiresAuth: false,
          modifiesState: false,
          cacheable: true,
        },
      },
    ];
  }

  private getWalletCapabilities(): OpenServCapability[] {
    return [
      {
        name: 'get_portfolio',
        description: 'Get comprehensive wallet portfolio with analytics',
        parameters: {
          required: ['walletAddress'],
          optional: ['includePerformance', 'includeInsights'],
          schema: {
            walletAddress: {
              type: 'string',
              description: 'Wallet address to analyze',
            },
            includePerformance: {
              type: 'boolean',
              description: 'Include performance metrics',
            },
            includeInsights: {
              type: 'boolean',
              description: 'Include AI-powered insights',
            },
          },
        },
        examples: [
          {
            input: {
              walletAddress: 'kaspa:abc123...',
              includePerformance: true,
              includeInsights: true,
            },
            output: { totalValue: 1000, tokens: [], performance: {} },
            description: 'Get complete portfolio analysis',
          },
        ],
        features: {
          requiresWallet: false,
          requiresAuth: false,
          modifiesState: false,
          cacheable: true,
        },
      },
      {
        name: 'validate_address',
        description: 'Validate wallet address format and type',
        parameters: {
          required: ['address'],
          optional: [],
          schema: {
            address: {
              type: 'string',
              description: 'Wallet address to validate',
            },
          },
        },
        examples: [
          {
            input: {
              address: 'kaspa:abc123...',
            },
            output: { isValid: true, type: 'kaspa' },
            description: 'Validate Kaspa wallet address',
          },
        ],
        features: {
          requiresWallet: false,
          requiresAuth: false,
          modifiesState: false,
          cacheable: true,
        },
      },
    ];
  }

  private getTokenRegistryCapabilities(): OpenServCapability[] {
    return [
      {
        name: 'get_token_info',
        description: 'Get detailed token information and metadata',
        parameters: {
          required: ['identifier'],
          optional: ['includePrice', 'includeMetrics'],
          schema: {
            identifier: {
              type: 'string',
              description: 'Token address or symbol',
            },
            includePrice: {
              type: 'boolean',
              description: 'Include current price data',
            },
            includeMetrics: {
              type: 'boolean',
              description: 'Include trading metrics',
            },
          },
        },
        examples: [
          {
            input: {
              identifier: 'KASPA',
              includePrice: true,
              includeMetrics: true,
            },
            output: { name: 'Kaspa', symbol: 'KASPA', price: 0.15 },
            description: 'Get comprehensive KASPA token information',
          },
        ],
        features: {
          requiresWallet: false,
          requiresAuth: false,
          modifiesState: false,
          cacheable: true,
        },
      },
      {
        name: 'search_tokens',
        description: 'Search tokens by name, symbol, or address',
        parameters: {
          required: ['query'],
          optional: ['limit', 'verified'],
          schema: {
            query: { type: 'string', description: 'Search query' },
            limit: {
              type: 'number',
              description: 'Maximum results',
              minimum: 1,
              maximum: 100,
            },
            verified: {
              type: 'boolean',
              description: 'Only include verified tokens',
            },
          },
        },
        examples: [
          {
            input: {
              query: 'kas',
              limit: 10,
              verified: true,
            },
            output: { tokens: [], count: 5 },
            description: 'Search for tokens containing "kas"',
          },
        ],
        features: {
          requiresWallet: false,
          requiresAuth: false,
          modifiesState: false,
          cacheable: true,
        },
      },
    ];
  }

  private getUserManagementCapabilities(): OpenServCapability[] {
    return [
      {
        name: 'get_notifications',
        description: 'Get user notifications and alerts',
        parameters: {
          required: ['userId'],
          optional: ['limit', 'unreadOnly'],
          schema: {
            userId: { type: 'string', description: 'User identifier' },
            limit: {
              type: 'number',
              description: 'Maximum notifications',
              minimum: 1,
              maximum: 100,
            },
            unreadOnly: {
              type: 'boolean',
              description: 'Only unread notifications',
            },
          },
        },
        examples: [
          {
            input: {
              userId: 'user_123',
              limit: 20,
              unreadOnly: false,
            },
            output: { notifications: [], count: 5 },
            description: 'Get user notifications',
          },
        ],
        features: {
          requiresWallet: false,
          requiresAuth: true,
          modifiesState: false,
          cacheable: false,
        },
      },
      {
        name: 'verify_user',
        description: 'Verify user wallet signature for authentication',
        parameters: {
          required: ['signature', 'message', 'address'],
          optional: [],
          schema: {
            signature: { type: 'string', description: 'Wallet signature' },
            message: { type: 'string', description: 'Signed message' },
            address: { type: 'string', description: 'Wallet address' },
          },
        },
        examples: [
          {
            input: {
              signature: '0xabc...',
              message: 'Authentication challenge',
              address: 'kaspa:def...',
            },
            output: { verified: true, userId: 'user_123' },
            description: 'Verify wallet signature for authentication',
          },
        ],
        features: {
          requiresWallet: true,
          requiresAuth: false,
          modifiesState: true,
          cacheable: false,
        },
      },
    ];
  }
}
