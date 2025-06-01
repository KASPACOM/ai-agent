import { Injectable, Logger } from '@nestjs/common';
import {
  CapabilityDetail,
  AgentMetadata,
} from '../multiagent/models/agent.model';
import { AgentFactory } from '../multiagent/agents/agent-factory.service';
import { BuiltAgent } from '../multiagent/models/agent.model';

interface AgentCapabilityGroup {
  agentMetadata: AgentMetadata;
  capabilities: CapabilityDetail[];
  agentInstance: BuiltAgent;
}

/**
 * MultiAgentService coordinates between specialized agents using the new factory pattern
 * This service is completely modular and agnostic - it discovers
 * agents and their capabilities dynamically with no hardcoded references
 */
@Injectable()
export class MultiAgentService {
  private readonly logger = new Logger(MultiAgentService.name);
  private readonly agents: BuiltAgent[];

  constructor(private readonly agentFactory: AgentFactory) {
    // Get all agents from the factory
    this.agents = this.agentFactory.createAllAgents();

    this.logger.log(
      `Initialized MultiAgentService with ${this.agents.length} factory-built agents`,
    );

    // Log agent summary
    const summary = this.agentFactory.getAgentSummary();
    for (const agent of summary) {
      this.logger.log(
        `[AGENT-REGISTRY] ${agent.name}: ${agent.capabilityCount} capabilities${agent.isInternalOnly ? ' (internal-only)' : ''}`,
      );
    }
  }

  // Get all available capabilities dynamically from factory-built agents
  getAllCapabilities(): AgentCapabilityGroup[] {
    const capabilityId = this.generateExecutionId();
    this.logger.log(
      `[CAPABILITY-DISCOVERY] ${capabilityId} - Discovering capabilities from ${this.agents.length} factory-built agents`,
    );

    const agentCapabilityGroups: AgentCapabilityGroup[] = [];

    // Discover capabilities from each factory-built agent
    for (const agent of this.agents) {
      try {
        const metadata = agent.metadata;
        const capabilities = agent.capabilities;

        // Filter out internal-only capabilities for LLM use
        const publicCapabilities = capabilities.filter(
          (cap) => !cap.isInternal,
        );

        // Skip internal-only agents
        if (agent.isInternalOnly && publicCapabilities.length === 0) {
          this.logger.debug(
            `[CAPABILITY-DISCOVERY] ${capabilityId} - ${metadata.name}: Skipping internal-only agent`,
          );
          continue;
        }

        agentCapabilityGroups.push({
          agentMetadata: metadata,
          capabilities: publicCapabilities,
          agentInstance: agent,
        });

        this.logger.log(
          `[CAPABILITY-DISCOVERY] ${capabilityId} - ${metadata.name}: ${publicCapabilities.length} capabilities discovered`,
        );
      } catch (error) {
        this.logger.error(
          `[CAPABILITY-DISCOVERY] ${capabilityId} - Failed to get capabilities from agent:`,
          error,
        );
      }
    }

    this.logger.log(
      `[CAPABILITY-DISCOVERY] ${capabilityId} - Total: ${agentCapabilityGroups.length} agents with capabilities`,
    );

    return agentCapabilityGroups;
  }

  // Get flat list of all capabilities (for backward compatibility)
  getAllCapabilitiesFlat(): CapabilityDetail[] {
    const capabilityGroups = this.getAllCapabilities();
    const flatCapabilities: CapabilityDetail[] = [];

    for (const group of capabilityGroups) {
      flatCapabilities.push(...group.capabilities);
    }

    return flatCapabilities;
  }

  // Get agent configurations dynamically from actual capabilities
  getAgentConfigurations() {
    const capabilityGroups = this.getAllCapabilities();
    const configurations: Record<string, any> = {};

    for (const group of capabilityGroups) {
      const agentKey = group.agentMetadata.name.replace('-', '');
      configurations[agentKey] = {
        name: group.agentMetadata.name
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        description: group.agentMetadata.description,
        version: group.agentMetadata.version,
        category: group.agentMetadata.category,
        capabilities: group.capabilities.map((cap) => cap.name),
        capabilityCount: group.capabilities.length,
      };
    }

    return configurations;
  }

  // Route capability execution to the appropriate agent dynamically
  async executeCapability(capabilityName: string, args: any): Promise<any> {
    const executionId = this.generateExecutionId();
    this.logger.log(
      `[MULTI-AGENT] ${executionId} - Executing capability: ${capabilityName}`,
    );
    this.logger.debug(
      `[MULTI-AGENT] ${executionId} - Parameters:`,
      JSON.stringify(args, null, 2),
    );

    try {
      // Find the agent that owns this capability
      const capabilityGroups = this.getAllCapabilities();
      let targetAgent: BuiltAgent | null = null;
      let targetMetadata: AgentMetadata | null = null;

      for (const group of capabilityGroups) {
        const hasCapability = group.capabilities.some(
          (cap) => cap.name === capabilityName,
        );
        if (hasCapability) {
          targetAgent = group.agentInstance;
          targetMetadata = group.agentMetadata;
          break;
        }
      }

      if (!targetAgent || !targetMetadata) {
        throw new Error(`No agent found for capability: ${capabilityName}`);
      }

      this.logger.log(
        `[MULTI-AGENT] ${executionId} - Routing to agent: ${targetMetadata.name}`,
      );

      // Execute capability using the factory-built agent's unified execution method
      const result = await targetAgent.executeCapability(capabilityName, args);

      this.logger.log(
        `[MULTI-AGENT] ${executionId} - Capability executed successfully`,
      );
      this.logger.debug(
        `[MULTI-AGENT] ${executionId} - Result:`,
        JSON.stringify(result, null, 2),
      );

      return result;
    } catch (error) {
      this.logger.error(
        `[MULTI-AGENT] ${executionId} - Capability execution failed:`,
        error,
      );
      this.logger.error(
        `[MULTI-AGENT] ${executionId} - Error stack:`,
        error.stack,
      );

      return {
        success: false,
        error: `Failed to execute capability ${capabilityName}: ${error.message}`,
        agent: 'multi-agent-coordinator',
        executionId,
      };
    }
  }

  // Dynamic capability execution based on capability naming conventions
  private async executeAgentCapability(
    agent: any,
    metadata: AgentMetadata,
    capabilityName: string,
    args: any,
    executionId: string,
  ): Promise<any> {
    this.logger.log(
      `[${metadata.name.toUpperCase()}] ${executionId} - Executing: ${capabilityName}`,
    );

    try {
      // This is where the routing logic is based on capability prefix
      // This maintains backward compatibility with existing method names
      if (capabilityName.startsWith('trading_')) {
        return await this.executeTradingCapability(
          agent as any,
          capabilityName,
          args,
          executionId,
        );
      } else if (capabilityName.startsWith('wallet_')) {
        return await this.executeWalletCapability(
          agent as any,
          capabilityName,
          args,
          executionId,
        );
      } else if (capabilityName.startsWith('token_')) {
        return await this.executeTokenCapability(
          agent as any,
          capabilityName,
          args,
          executionId,
        );
      } else if (capabilityName.startsWith('defi_')) {
        return await this.executeDeFiCapability(
          agent as any,
          capabilityName,
          args,
          executionId,
        );
      } else {
        throw new Error(`Unknown capability pattern: ${capabilityName}`);
      }
    } catch (error) {
      this.logger.error(
        `[${metadata.name.toUpperCase()}] ${executionId} - ${capabilityName} failed:`,
        error,
      );
      throw error;
    }
  }

  // Execute trading capabilities
  private async executeTradingCapability(
    agent: any,
    capabilityName: string,
    args: any,
    executionId: string,
  ): Promise<any> {
    this.logger.log(
      `[TRADING-AGENT] ${executionId} - Executing: ${capabilityName}`,
    );

    try {
      let result: any;

      switch (capabilityName) {
        case 'trading_get_market_data':
          // If ticker is provided, get specific analytics, otherwise get general stats
          if (args.ticker) {
            this.logger.log(
              `[TRADING-AGENT] ${executionId} - Getting analytics for ticker: ${args.ticker}`,
            );
            result = await agent.getTradingAnalytics(args.ticker);
          } else {
            this.logger.log(
              `[TRADING-AGENT] ${executionId} - Getting general trade stats`,
            );
            result = await agent.getTradeStats();
          }
          break;

        case 'trading_create_sell_order':
          this.logger.log(
            `[TRADING-AGENT] ${executionId} - Creating sell order for ${args.ticker}`,
          );
          result = await agent.createSellOrderV2(
            args.ticker,
            args.quantity,
            args.totalPrice,
            args.pricePerToken,
            args.psktSeller,
          );
          break;

        case 'trading_buy_token':
          this.logger.log(
            `[TRADING-AGENT] ${executionId} - Buying token with order ID: ${args.orderId}`,
          );
          result = await agent.buyToken(args.orderId, args.walletAddress);
          break;

        case 'trading_get_floor_price':
          this.logger.log(
            `[TRADING-AGENT] ${executionId} - Getting floor price for: ${args.ticker}`,
          );
          result = await agent.getFloorPrice(args.ticker);
          break;

        default:
          throw new Error(`Unknown trading capability: ${capabilityName}`);
      }

      this.logger.log(
        `[TRADING-AGENT] ${executionId} - ${capabilityName} completed successfully`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[TRADING-AGENT] ${executionId} - ${capabilityName} failed:`,
        error,
      );
      throw error;
    }
  }

  // Execute wallet capabilities
  private async executeWalletCapability(
    agent: any,
    capabilityName: string,
    args: any,
    executionId: string,
  ): Promise<any> {
    this.logger.log(
      `[WALLET-AGENT] ${executionId} - Executing: ${capabilityName}`,
    );

    try {
      let result: any;

      switch (capabilityName) {
        case 'wallet_get_portfolio':
          this.logger.log(
            `[WALLET-AGENT] ${executionId} - Getting portfolio for address: ${args.address}`,
          );
          result = await agent.fetchWalletKRC20TokensBalance(args.address);
          break;

        case 'wallet_get_activity':
          this.logger.log(
            `[WALLET-AGENT] ${executionId} - Getting wallet activity points`,
          );
          result = await agent.getWalletPoints();
          break;

        case 'wallet_validate_address':
          this.logger.log(
            `[WALLET-AGENT] ${executionId} - Validating address: ${args.address}`,
          );
          result = await agent.validateWalletAddress(args.address);
          break;

        default:
          throw new Error(`Unknown wallet capability: ${capabilityName}`);
      }

      this.logger.log(
        `[WALLET-AGENT] ${executionId} - ${capabilityName} completed successfully`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[WALLET-AGENT] ${executionId} - ${capabilityName} failed:`,
        error,
      );
      throw error;
    }
  }

  // Execute token capabilities
  private async executeTokenCapability(
    agent: any,
    capabilityName: string,
    args: any,
    executionId: string,
  ): Promise<any> {
    this.logger.log(
      `[TOKEN-AGENT] ${executionId} - Executing: ${capabilityName}`,
    );

    try {
      let result: any;

      switch (capabilityName) {
        case 'token_search':
          this.logger.log(
            `[TOKEN-AGENT] ${executionId} - Searching for: ${args.query}`,
          );
          result = await agent.searchToken(args.query);
          break;

        case 'token_get_info':
          this.logger.log(
            `[TOKEN-AGENT] ${executionId} - Getting info for ticker: ${args.ticker}`,
          );
          result = await agent.fetchTokenByTicker(args.ticker);
          break;

        case 'token_get_price_history':
          this.logger.log(
            `[TOKEN-AGENT] ${executionId} - Getting price history for ${args.ticker}, timeframe: ${args.timeframe}`,
          );
          result = await agent.getTokenPriceHistory(
            args.ticker,
            args.timeframe,
          );
          break;

        default:
          throw new Error(`Unknown token capability: ${capabilityName}`);
      }

      this.logger.log(
        `[TOKEN-AGENT] ${executionId} - ${capabilityName} completed successfully`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[TOKEN-AGENT] ${executionId} - ${capabilityName} failed:`,
        error,
      );
      throw error;
    }
  }

  // Execute DeFi capabilities
  private async executeDeFiCapability(
    agent: any,
    capabilityName: string,
    args: any,
    executionId: string,
  ): Promise<any> {
    this.logger.log(
      `[DEFI-AGENT] ${executionId} - Executing: ${capabilityName}`,
    );

    try {
      let result: any;

      switch (capabilityName) {
        case 'defi_swap_tokens':
          this.logger.log(
            `[DEFI-AGENT] ${executionId} - Swapping ${args.amount} ${args.fromToken} to ${args.toToken}`,
          );
          result = await agent.executeCompleteSwap(
            args.fromToken,
            args.toToken,
            args.amount,
            args.slippage,
          );
          break;

        case 'defi_get_swap_quote':
          this.logger.log(
            `[DEFI-AGENT] ${executionId} - Getting swap quote: ${args.amountIn} ${args.tokenIn} to ${args.tokenOut}`,
          );
          result = await agent.getSwapQuote(
            args.tokenIn,
            args.tokenOut,
            args.amountIn,
          );
          break;

        case 'defi_add_liquidity':
          this.logger.log(
            `[DEFI-AGENT] ${executionId} - Adding liquidity: ${args.amountA} ${args.tokenA} + ${args.amountB} ${args.tokenB}`,
          );
          result = await agent.addLiquidityWithAutoApprovals(
            args.tokenA,
            args.tokenB,
            args.amountA,
            args.amountB,
          );
          break;

        case 'defi_create_token':
          this.logger.log(
            `[DEFI-AGENT] ${executionId} - Creating token: ${args.symbol} (${args.name})`,
          );
          const formData = new FormData();
          formData.append('symbol', args.symbol);
          formData.append('name', args.name);
          formData.append('decimals', args.decimals.toString());
          formData.append('chain_id', args.chainId.toString());
          formData.append('address', args.address);
          result = await agent.createToken(formData);
          break;

        default:
          throw new Error(`Unknown DeFi capability: ${capabilityName}`);
      }

      this.logger.log(
        `[DEFI-AGENT] ${executionId} - ${capabilityName} completed successfully`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[DEFI-AGENT] ${executionId} - ${capabilityName} failed:`,
        error,
      );
      throw error;
    }
  }

  // Determine if a capability belongs to the market agent (no longer used)
  private isMarketCapability(): boolean {
    return false; // No market agent capabilities
  }

  // Get capability by name across all agents
  getCapabilityInfo(capabilityName: string): CapabilityDetail | null {
    const capabilityGroups = this.getAllCapabilities();

    for (const group of capabilityGroups) {
      const capability = group.capabilities.find(
        (cap) => cap.name === capabilityName,
      );
      if (capability) {
        return capability;
      }
    }

    return null;
  }

  // Get capabilities by agent
  getCapabilitiesByAgent(agentName: string): CapabilityDetail[] {
    const capabilityGroups = this.getAllCapabilities();
    const targetGroup = capabilityGroups.find(
      (group) => group.agentMetadata.name === agentName,
    );
    return targetGroup ? targetGroup.capabilities : [];
  }

  // Suggest capabilities based on user intent
  suggestCapabilities(intent: string): CapabilityDetail[] {
    const allCapabilities = this.getAllCapabilitiesFlat();
    const suggestions: CapabilityDetail[] = [];
    const keywords = intent.toLowerCase().split(' ');

    for (const capability of allCapabilities) {
      const searchText = [
        capability.name,
        capability.description,
        ...capability.examples,
      ]
        .join(' ')
        .toLowerCase();

      const matches = keywords.filter((keyword) =>
        searchText.includes(keyword),
      );

      if (matches.length > 0) {
        suggestions.push(capability);
      }
    }

    // Sort by relevance (number of matching keywords)
    suggestions.sort((a, b) => {
      const aMatches = keywords.filter((keyword) =>
        [a.name, a.description, ...a.examples]
          .join(' ')
          .toLowerCase()
          .includes(keyword),
      ).length;
      const bMatches = keywords.filter((keyword) =>
        [b.name, b.description, ...b.examples]
          .join(' ')
          .toLowerCase()
          .includes(keyword),
      ).length;
      return bMatches - aMatches;
    });

    return suggestions.slice(0, 5); // Return top 5 suggestions
  }

  // Get agent status
  getAgentStatus() {
    const summary = this.agentFactory.getAgentSummary();
    return {
      totalAgents: summary.length,
      totalCapabilities: summary.reduce(
        (sum, agent) => sum + agent.capabilityCount,
        0,
      ),
      agentDetails: summary.map((agent) => ({
        name: agent.name,
        status: 'healthy',
        capabilities: agent.capabilityCount,
        isInternalOnly: agent.isInternalOnly,
        description: agent.description,
      })),
      lastUpdated: new Date().toISOString(),
    };
  }

  // Execute multiple capabilities in parallel
  async executeMultipleCapabilities(
    requests: Array<{ capability: string; args: any }>,
  ): Promise<any[]> {
    const executionId = this.generateExecutionId();
    this.logger.log(
      `[MULTI-AGENT] ${executionId} - Executing ${requests.length} capabilities in parallel`,
    );

    const promises = requests.map((request) =>
      this.executeCapability(request.capability, request.args),
    );

    try {
      const results = await Promise.all(promises);
      this.logger.log(
        `[MULTI-AGENT] ${executionId} - All capabilities executed successfully`,
      );
      return results;
    } catch (error) {
      this.logger.error(
        `[MULTI-AGENT] ${executionId} - Parallel execution failed:`,
        error,
      );
      throw error;
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
