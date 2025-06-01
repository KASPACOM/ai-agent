import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

// === OpenServ Configuration ===
import { OpenServConfigurationService } from './openserv.config';

// === Session & Memory Management ===
import { SessionStorageService } from './session-storage.service';
import { IntentRecognitionService } from './intent-recognition.service';

// === Communication Services ===
import { OpenServSubscriberService } from './subscriber.service';
import { OpenServPublisherService } from './publisher.service';

// === LLM Services ===
import { LLMRouterService } from './llm-router.service';
import { OpenAiAdapter } from '../../orchestrator/llms/openai.service';

// === Agent Services ===
import { DeFiAgentService } from './agents/defi-agent.service';
import { TradingAgentService } from './agents/trading-agent.service';
import { WalletAgentService } from './agents/wallet-agent.service';
import { TokenRegistryAgentService } from './agents/token-registry-agent.service';
import { UserManagementAgentService } from './agents/user-management-agent.service';

// === Infrastructure API Services ===
import { KaspaApiService } from './services/kaspa-api.service';
import { KasplexKrc20Service } from './services/kasplex-krc20.service';
import { BackendApiService } from './services/backend-api.service';

// === External Dependencies ===
import { PromptBuilderModule } from '../../prompt-builder/prompt-builder.module';
import { AppConfigModule } from '../../core/modules/config/app-config.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    AppConfigModule, // Import for OpenAI configuration
    PromptBuilderModule, // Import for LLMRouterService dependency
  ],
  providers: [
    // === OpenServ Configuration ===
    OpenServConfigurationService,

    // === OpenServ Session & Memory Management ===
    SessionStorageService,
    IntentRecognitionService,

    // === OpenServ Communication Layer ===
    OpenServSubscriberService,
    OpenServPublisherService,

    // === LLM Services ===
    OpenAiAdapter,
    LLMRouterService,

    // === Agent Services ===
    DeFiAgentService,
    TradingAgentService,
    WalletAgentService,
    TokenRegistryAgentService,
    UserManagementAgentService,

    // === Infrastructure API Services ===
    KaspaApiService,
    KasplexKrc20Service,
    BackendApiService,
  ],
  exports: [
    // === Configuration ===
    OpenServConfigurationService,

    // === Session & Workflow Management ===
    SessionStorageService,
    IntentRecognitionService,

    // === Communication Services ===
    OpenServSubscriberService,
    OpenServPublisherService,

    // === LLM Services ===
    OpenAiAdapter,
    LLMRouterService,

    // === Agent Services ===
    DeFiAgentService,
    TradingAgentService,
    WalletAgentService,
    TokenRegistryAgentService,
    UserManagementAgentService,

    // === Infrastructure API Services ===
    KaspaApiService,
    KasplexKrc20Service,
    BackendApiService,
  ],
})
export class OpenServModule {}
