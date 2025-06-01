import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { BuiltAgent } from './agent-builder.service';

// Import individual agent factories
import { TradingAgentFactory } from './factories/trading-agent.factory';
import { WalletAgentFactory } from './factories/wallet-agent.factory';
import { DeFiAgentFactory } from './factories/defi-agent.factory';
import { TokenRegistryAgentFactory } from './factories/token-registry-agent.factory';
import { UserManagementAgentFactory } from './factories/user-management-agent.factory';

/**
 * AgentFactory - Main factory that orchestrates all individual agent factories
 *
 * This factory coordinates the creation of all agents using specialized factories:
 * - Each agent type has its own dedicated factory
 * - Clean separation of concerns
 * - Easy to maintain and extend
 * - All capabilities are properly implemented
 */
@Injectable()
export class AgentFactory {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly tradingAgentFactory: TradingAgentFactory,
    private readonly walletAgentFactory: WalletAgentFactory,
    private readonly defiAgentFactory: DeFiAgentFactory,
    private readonly tokenRegistryAgentFactory: TokenRegistryAgentFactory,
    private readonly userManagementAgentFactory: UserManagementAgentFactory,
  ) {}

  /**
   * Create all agents and return them as an array
   */
  createAllAgents(): BuiltAgent[] {
    return [
      this.tradingAgentFactory.createAgent(),
      this.walletAgentFactory.createAgent(),
      this.defiAgentFactory.createAgent(),
      this.tokenRegistryAgentFactory.createAgent(),
      this.userManagementAgentFactory.createAgent(),
    ];
  }

  /**
   * Create individual agents by name
   */
  createTradingAgent(): BuiltAgent {
    return this.tradingAgentFactory.createAgent();
  }

  createWalletAgent(): BuiltAgent {
    return this.walletAgentFactory.createAgent();
  }

  createDeFiAgent(): BuiltAgent {
    return this.defiAgentFactory.createAgent();
  }

  createTokenRegistryAgent(): BuiltAgent {
    return this.tokenRegistryAgentFactory.createAgent();
  }

  createUserManagementAgent(): BuiltAgent {
    return this.userManagementAgentFactory.createAgent();
  }

  /**
   * Get agent by name
   */
  getAgentByName(name: string): BuiltAgent | null {
    switch (name) {
      case 'trading-agent':
        return this.createTradingAgent();
      case 'wallet-agent':
        return this.createWalletAgent();
      case 'defi-agent':
        return this.createDeFiAgent();
      case 'token-registry-agent':
        return this.createTokenRegistryAgent();
      case 'user-management-agent':
        return this.createUserManagementAgent();
      default:
        return null;
    }
  }

  /**
   * Get list of available agent names
   */
  getAvailableAgentNames(): string[] {
    return [
      'trading-agent',
      'wallet-agent',
      'defi-agent',
      'token-registry-agent',
      'user-management-agent',
    ];
  }

  /**
   * Get summary of all agents and their capability counts
   */
  getAgentSummary(): Array<{
    name: string;
    description: string;
    capabilityCount: number;
    isInternalOnly: boolean;
  }> {
    const agents = this.createAllAgents();
    return agents.map((agent) => ({
      name: agent.metadata.name,
      description: agent.metadata.description,
      capabilityCount: agent.capabilities.length,
      isInternalOnly: agent.isInternalOnly || false,
    }));
  }
}
