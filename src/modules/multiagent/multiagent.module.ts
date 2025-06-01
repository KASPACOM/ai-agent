import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// === Agent Factory & Builder Services ===
import { AgentFactory } from './agents/agent-factory.service';
import { AgentBuilder } from './agents/agent-builder.service';

// === Agent Factories ===
import { DeFiAgentFactory } from './agents/factories/defi-agent.factory';
import { TradingAgentFactory } from './agents/factories/trading-agent.factory';
import { WalletAgentFactory } from './agents/factories/wallet-agent.factory';
import { TokenRegistryAgentFactory } from './agents/factories/token-registry-agent.factory';
import { UserManagementAgentFactory } from './agents/factories/user-management-agent.factory';

// === API Services ===
import { BackendApiService } from './services/backend-api.service';
import { KaspaApiService } from './services/kaspa-api.service';
import { KasplexKrc20Service } from './services/kasplex-krc20.service';

/**
 * MultiAgentModule
 *
 * Core multi-agent system for Kaspa ecosystem operations.
 * Contains all agent factories, capabilities, and API services
 * independent of any specific integration platform.
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [
    // === Core Agent System ===
    AgentFactory,
    AgentBuilder,

    // === Agent Factories ===
    DeFiAgentFactory,
    TradingAgentFactory,
    WalletAgentFactory,
    TokenRegistryAgentFactory,
    UserManagementAgentFactory,

    // === API Services ===
    BackendApiService,
    KaspaApiService,
    KasplexKrc20Service,
  ],
  exports: [
    // === Core Agent System ===
    AgentFactory,
    AgentBuilder,

    // === Agent Factories ===
    DeFiAgentFactory,
    TradingAgentFactory,
    WalletAgentFactory,
    TokenRegistryAgentFactory,
    UserManagementAgentFactory,

    // === API Services ===
    BackendApiService,
    KaspaApiService,
    KasplexKrc20Service,
  ],
})
export class MultiAgentModule {}
