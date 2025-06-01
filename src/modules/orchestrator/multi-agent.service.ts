import { Injectable, Logger } from '@nestjs/common';

// Import domain agents
import { DeFiAgentService } from '../integrations/openserv/agents/defi-agent.service';
import { TradingAgentService } from '../integrations/openserv/agents/trading-agent.service';
import { WalletAgentService } from '../integrations/openserv/agents/wallet-agent.service';
import { TokenRegistryAgentService } from '../integrations/openserv/agents/token-registry-agent.service';
import { UserManagementAgentService } from '../integrations/openserv/agents/user-management-agent.service';

interface LocalAgentCapability {
  name: string;
  description: string;
  agent: string;
  schema: any;
}

/**
 * MultiAgentService coordinates between specialized agents
 * This service routes requests to appropriate agents based on capability requirements
 */
@Injectable()
export class MultiAgentService {
  private readonly logger = new Logger(MultiAgentService.name);

  constructor(
    private readonly defiAgent: DeFiAgentService,
    private readonly tradingAgent: TradingAgentService,
    private readonly walletAgent: WalletAgentService,
    private readonly tokenRegistryAgent: TokenRegistryAgentService,
    private readonly userManagementAgent: UserManagementAgentService,
  ) {}

  // Get all available capabilities from all agents
  getAllCapabilities(): LocalAgentCapability[] {
    // Add capabilities for specialized agents
    const tradingCapabilities = [
      {
        name: 'trading_get_market_data',
        description: 'Get current market data and trading statistics',
        agent: 'trading-agent',
        schema: { ticker: 'string' }, // ticker is optional
      },
      {
        name: 'trading_create_sell_order',
        description: 'Create a sell order for tokens',
        agent: 'trading-agent',
        schema: {
          ticker: 'string',
          quantity: 'number',
          totalPrice: 'number',
          pricePerToken: 'number',
        },
      },
      {
        name: 'trading_buy_token',
        description: 'Buy tokens from marketplace',
        agent: 'trading-agent',
        schema: { orderId: 'string', walletAddress: 'string' },
      },
      {
        name: 'trading_get_floor_price',
        description: 'Get floor price for a token',
        agent: 'trading-agent',
        schema: { ticker: 'string' },
      },
    ];

    const walletCapabilities = [
      {
        name: 'wallet_get_portfolio',
        description: 'Get wallet token portfolio',
        agent: 'wallet-agent',
        schema: { address: 'string' },
      },
      {
        name: 'wallet_get_activity',
        description: 'Get wallet activity and points',
        agent: 'wallet-agent',
        schema: {},
      },
      {
        name: 'wallet_validate_address',
        description: 'Validate a Kaspa wallet address',
        agent: 'wallet-agent',
        schema: { address: 'string' },
      },
    ];

    const tokenCapabilities = [
      {
        name: 'token_search',
        description: 'Search for tokens by symbol or name',
        agent: 'token-registry-agent',
        schema: { query: 'string' },
      },
      {
        name: 'token_get_info',
        description: 'Get detailed token information',
        agent: 'token-registry-agent',
        schema: { ticker: 'string' },
      },
      {
        name: 'token_get_price_history',
        description: 'Get token price history',
        agent: 'token-registry-agent',
        schema: { ticker: 'string', timeframe: 'string' },
      },
    ];

    const defiCapabilities = [
      {
        name: 'defi_swap_tokens',
        description: 'Swap tokens on DEX',
        agent: 'defi-agent',
        schema: {
          fromToken: 'string',
          toToken: 'string',
          amount: 'string',
          slippage: 'number',
        },
      },
      {
        name: 'defi_get_swap_quote',
        description: 'Get price quote for token swap',
        agent: 'defi-agent',
        schema: {
          tokenIn: 'string',
          tokenOut: 'string',
          amountIn: 'string',
        },
      },
      {
        name: 'defi_add_liquidity',
        description: 'Add liquidity to DEX pool',
        agent: 'defi-agent',
        schema: {
          tokenA: 'string',
          tokenB: 'string',
          amountA: 'string',
          amountB: 'string',
        },
      },
      {
        name: 'defi_create_token',
        description: 'Create new ERC20 token',
        agent: 'defi-agent',
        schema: {
          symbol: 'string',
          name: 'string',
          decimals: 'number',
          chainId: 'number',
        },
      },
    ];

    return [
      ...tradingCapabilities,
      ...walletCapabilities,
      ...tokenCapabilities,
      ...defiCapabilities,
    ];
  }

  // Get agent configurations for OpenServ registration
  getAgentConfigurations() {
    return {
      tradingAgent: {
        name: 'Trading Agent',
        description:
          'Handles P2P trading, marketplace operations, and KNS trading',
        capabilities: ['trading', 'marketplace', 'orders', 'kns'],
      },
      walletAgent: {
        name: 'Wallet Agent',
        description:
          'Manages wallet portfolios, activity tracking, and balances',
        capabilities: ['portfolio', 'activity', 'balances', 'validation'],
      },
      tokenRegistryAgent: {
        name: 'Token Registry Agent',
        description: 'Handles token information, NFT collections, and metadata',
        capabilities: ['tokens', 'nfts', 'metadata', 'search'],
      },
      defiAgent: {
        name: 'DeFi Agent',
        description: 'Manages DeFi operations, swaps, and liquidity pools',
        capabilities: ['swaps', 'liquidity', 'defi', 'tokens'],
      },
    };
  }

  // Route capability execution to the appropriate agent
  async executeCapability(capabilityName: string, args: any): Promise<any> {
    try {
      // Route based on capability prefix
      if (capabilityName.startsWith('trading_')) {
        return await this.executeTradingCapability(capabilityName, args);
      } else if (capabilityName.startsWith('wallet_')) {
        return await this.executeWalletCapability(capabilityName, args);
      } else if (capabilityName.startsWith('token_')) {
        return await this.executeTokenCapability(capabilityName, args);
      } else if (capabilityName.startsWith('defi_')) {
        return await this.executeDeFiCapability(capabilityName, args);
      } else {
        throw new Error(`Unknown capability: ${capabilityName}`);
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute capability ${capabilityName}: ${error.message}`,
        agent: 'multi-agent-coordinator',
      };
    }
  }

  // Execute trading capabilities
  private async executeTradingCapability(
    capabilityName: string,
    args: any,
  ): Promise<any> {
    switch (capabilityName) {
      case 'trading_get_market_data':
        // If ticker is provided, get specific analytics, otherwise get general stats
        if (args.ticker) {
          return await this.tradingAgent.getTradingAnalytics(args.ticker);
        } else {
          return await this.tradingAgent.getTradeStats();
        }
      case 'trading_create_sell_order':
        return await this.tradingAgent.createSellOrderV2(
          args.ticker,
          args.quantity,
          args.totalPrice,
          args.pricePerToken,
          args.psktSeller,
        );
      case 'trading_buy_token':
        return await this.tradingAgent.buyToken(
          args.orderId,
          args.walletAddress,
        );
      case 'trading_get_floor_price':
        return await this.tradingAgent.getFloorPrice(args.ticker);
      default:
        throw new Error(`Unknown trading capability: ${capabilityName}`);
    }
  }

  // Execute wallet capabilities
  private async executeWalletCapability(
    capabilityName: string,
    args: any,
  ): Promise<any> {
    switch (capabilityName) {
      case 'wallet_get_portfolio':
        return await this.walletAgent.fetchWalletKRC20TokensBalance(
          args.address,
        );
      case 'wallet_get_activity':
        return await this.walletAgent.getWalletPoints();
      case 'wallet_validate_address':
        return await this.walletAgent.validateWalletAddress(args.address);
      default:
        throw new Error(`Unknown wallet capability: ${capabilityName}`);
    }
  }

  // Execute token capabilities
  private async executeTokenCapability(
    capabilityName: string,
    args: any,
  ): Promise<any> {
    switch (capabilityName) {
      case 'token_search':
        return await this.tokenRegistryAgent.searchToken(args.query);
      case 'token_get_info':
        return await this.tokenRegistryAgent.fetchTokenByTicker(args.ticker);
      case 'token_get_price_history':
        return await this.tokenRegistryAgent.getTokenPriceHistory(
          args.ticker,
          args.timeframe,
        );
      default:
        throw new Error(`Unknown token capability: ${capabilityName}`);
    }
  }

  // Execute DeFi capabilities
  private async executeDeFiCapability(
    capabilityName: string,
    args: any,
  ): Promise<any> {
    switch (capabilityName) {
      case 'defi_swap_tokens':
        return await this.defiAgent.executeCompleteSwap(
          args.fromToken,
          args.toToken,
          args.amount,
          args.slippage,
        );
      case 'defi_get_swap_quote':
        return await this.defiAgent.getSwapQuote(
          args.tokenIn,
          args.tokenOut,
          args.amountIn,
        );
      case 'defi_add_liquidity':
        return await this.defiAgent.addLiquidityWithAutoApprovals(
          args.tokenA,
          args.tokenB,
          args.amountA,
          args.amountB,
        );
      case 'defi_create_token':
        const formData = new FormData();
        formData.append('symbol', args.symbol);
        formData.append('name', args.name);
        formData.append('decimals', args.decimals.toString());
        formData.append('chain_id', args.chainId.toString());
        formData.append('address', args.address);
        return await this.defiAgent.createToken(formData);
      default:
        throw new Error(`Unknown DeFi capability: ${capabilityName}`);
    }
  }

  // Determine if a capability belongs to the market agent (no longer used)
  private isMarketCapability(): boolean {
    return false; // No market agent capabilities
  }

  // Get capability by name across all agents
  getCapabilityInfo(capabilityName: string): LocalAgentCapability | null {
    const allCapabilities = this.getAllCapabilities();
    return allCapabilities.find((cap) => cap.name === capabilityName) || null;
  }

  // Get capabilities by agent
  getCapabilitiesByAgent(agentName: string): LocalAgentCapability[] {
    return this.getAllCapabilities().filter((cap) => cap.agent === agentName);
  }

  // Enhanced capability suggestions with better routing
  suggestCapabilities(intent: string): LocalAgentCapability[] {
    const allCapabilities = this.getAllCapabilities();
    const lowerIntent = intent.toLowerCase();

    // Enhanced keyword matching for suggestions
    return allCapabilities.filter((cap) => {
      // DeFi operations
      if (
        lowerIntent.includes('swap') ||
        lowerIntent.includes('liquidity') ||
        lowerIntent.includes('dex') ||
        lowerIntent.includes('defi')
      ) {
        return cap.agent === 'defi-agent';
      }

      // Trading operations
      if (
        lowerIntent.includes('trade') ||
        lowerIntent.includes('buy') ||
        lowerIntent.includes('sell') ||
        lowerIntent.includes('order')
      ) {
        return cap.agent === 'trading-agent';
      }

      // Wallet operations
      if (
        lowerIntent.includes('wallet') ||
        lowerIntent.includes('balance') ||
        lowerIntent.includes('portfolio') ||
        lowerIntent.includes('activity')
      ) {
        return cap.agent === 'wallet-agent';
      }

      // Token operations
      if (
        lowerIntent.includes('token') ||
        lowerIntent.includes('nft') ||
        lowerIntent.includes('collection') ||
        lowerIntent.includes('search')
      ) {
        return cap.agent === 'token-registry-agent';
      }

      return false;
    });
  }

  // Get comprehensive agent status
  getAgentStatus() {
    return {
      tradingAgent: {
        name: 'Trading Agent',
        status: 'active',
        capabilities: 3,
        lastUpdated: new Date().toISOString(),
      },
      walletAgent: {
        name: 'Wallet Agent',
        status: 'active',
        capabilities: 3,
        lastUpdated: new Date().toISOString(),
      },
      tokenRegistryAgent: {
        name: 'Token Registry Agent',
        status: 'active',
        capabilities: 3,
        lastUpdated: new Date().toISOString(),
      },
      defiAgent: {
        name: 'DeFi Agent',
        status: 'active',
        capabilities: 4,
        lastUpdated: new Date().toISOString(),
      },
      userManagementAgent: {
        name: 'User Management Agent',
        status: 'active',
        capabilities: 0, // Internal only
        lastUpdated: new Date().toISOString(),
        isInternalOnly: this.userManagementAgent.isInternalOnly,
      },
      coordinator: {
        name: 'Multi-Agent Coordinator',
        status: 'active',
        totalCapabilities: this.getAllCapabilities().length,
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  // Enhanced smart routing with comprehensive agent coverage
  async smartRoute(userMessage: string): Promise<any> {
    const lowerMessage = userMessage.toLowerCase();

    // DeFi operations
    if (
      lowerMessage.includes('swap') ||
      lowerMessage.includes('exchange') ||
      lowerMessage.includes('liquidity')
    ) {
      if (lowerMessage.includes('quote') || lowerMessage.includes('price')) {
        // Extract tokens if possible
        return await this.executeCapability('defi_get_swap_quote', {
          tokenIn: '0x123...', // Would need better parsing
          tokenOut: '0x456...',
          amountIn: '1000000000000000000',
        });
      }
    }

    // Trading operations
    if (lowerMessage.includes('floor price')) {
      const tickerMatch = userMessage.match(/\b([A-Z]{2,10})\b/);
      if (tickerMatch) {
        return await this.executeCapability('trading_get_floor_price', {
          ticker: tickerMatch[1],
        });
      }
    }

    // Wallet operations
    if (
      lowerMessage.includes('portfolio') ||
      lowerMessage.includes('balance')
    ) {
      const addressMatch = userMessage.match(/kaspa:[a-zA-Z0-9]+/);
      if (addressMatch) {
        return await this.executeCapability('wallet_get_portfolio', {
          address: addressMatch[0],
        });
      }
    }

    // Token search
    if (
      lowerMessage.includes('search') ||
      lowerMessage.includes('find token')
    ) {
      const queryMatch = userMessage.match(/search for (.+)/);
      if (queryMatch) {
        return await this.executeCapability('token_search', {
          query: queryMatch[1],
        });
      }
    }

    // If no specific routing, return suggestions
    return {
      success: false,
      message:
        'Could not determine specific action. Here are available capabilities:',
      suggestions: this.suggestCapabilities(userMessage),
      agent: 'multi-agent-coordinator',
    };
  }

  // Execute multiple capabilities in parallel (for complex workflows)
  async executeMultipleCapabilities(
    requests: Array<{ capability: string; args: any }>,
  ): Promise<any[]> {
    const promises = requests.map((request) =>
      this.executeCapability(request.capability, request.args),
    );

    return await Promise.all(promises);
  }
}
