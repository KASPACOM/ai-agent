import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

// === Core Orchestration Services ===
import { MultiAgentService } from './multi-agent.service';
import { AdvancedOrchestratorService } from './advanced-orchestrator.service';
import { WorkflowEngineService } from './workflow-engine.service';

// === Domain Agents (OpenServ-agnostic) ===
import { DeFiAgentService } from '../integrations/openserv/agents/defi-agent.service';
import { TradingAgentService } from '../integrations/openserv/agents/trading-agent.service';
import { WalletAgentService } from '../integrations/openserv/agents/wallet-agent.service';
import { TokenRegistryAgentService } from '../integrations/openserv/agents/token-registry-agent.service';
import { UserManagementAgentService } from '../integrations/openserv/agents/user-management-agent.service';

// === Infrastructure API Services ===
import { KaspaApiService } from '../integrations/openserv/services/kaspa-api.service';
import { KasplexKrc20Service } from '../integrations/openserv/services/kasplex-krc20.service';
import { BackendApiService } from '../integrations/openserv/services/backend-api.service';

// === OpenServ Integration (for communication only) ===
import { OpenServModule } from '../integrations/openserv/openserv.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    OpenServModule, // Import OpenServ for communication layer
  ],
  providers: [
    // === Infrastructure Services ===
    KaspaApiService,
    KasplexKrc20Service,
    BackendApiService,

    // === Domain Agents ===
    DeFiAgentService,
    TradingAgentService,
    WalletAgentService,
    TokenRegistryAgentService,
    UserManagementAgentService,

    // === Core Orchestration ===
    MultiAgentService,
    AdvancedOrchestratorService,
    WorkflowEngineService,
  ],
  exports: [
    // === Primary Orchestration Service ===
    AdvancedOrchestratorService,

    // === Individual Agents ===
    DeFiAgentService,
    TradingAgentService,
    WalletAgentService,
    TokenRegistryAgentService,
    UserManagementAgentService,

    // === Multi-Agent Coordination ===
    MultiAgentService,
    WorkflowEngineService,

    // === Infrastructure Services ===
    KaspaApiService,
    KasplexKrc20Service,
    BackendApiService,
  ],
})
export class OrchestratorModule {}
