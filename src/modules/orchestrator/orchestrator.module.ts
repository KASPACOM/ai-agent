import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

// === Core Orchestration Services ===
import { MultiAgentService } from './multi-agent.service';
import { AdvancedOrchestratorService } from './orchestrator.service';
import { WorkflowEngineService } from './workflow-engine.service';

// === LLM Services ===
import { OpenAiAdapter } from './llms/openai.service';

// === Prompt Management ===
import { PromptBuilderModule } from '../prompt-builder/prompt-builder.module';

// === Core Configuration ===
import { AppConfigModule } from '../core/modules/config/app-config.module';

// === MultiAgent Integration (provides AgentFactory and all agent services) ===
import { MultiAgentModule } from '../multiagent/multiagent.module';

// === OpenServ Integration (just pub/sub) ===
import { OpenServModule } from '../integrations/openserv/openserv.module';

// === Orchestrator Intelligence Services ===
import { IntentRecognitionService } from './intent-recognition.service';
import { LLMRouterService } from './llm-router.service';
import { SessionStorageService } from './session-storage.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    AppConfigModule, // Import AppConfig for OpenAI configuration
    PromptBuilderModule, // Import PromptBuilder for centralized prompt management
    MultiAgentModule, // Import MultiAgent for AgentFactory and all agent services
    OpenServModule, // Import OpenServ for pub/sub only
  ],
  providers: [
    // === LLM Services ===
    OpenAiAdapter,

    // === Core Orchestration ===
    MultiAgentService,
    AdvancedOrchestratorService,
    WorkflowEngineService,

    // === Orchestrator Intelligence Services ===
    IntentRecognitionService,
    LLMRouterService,
    SessionStorageService,
  ],
  exports: [
    // === LLM Services ===
    OpenAiAdapter,

    // === Primary Orchestration Service ===
    AdvancedOrchestratorService,

    // === Multi-Agent Coordination ===
    MultiAgentService,
    WorkflowEngineService,

    // === Orchestrator Intelligence Services ===
    IntentRecognitionService,
    LLMRouterService,
    SessionStorageService,
  ],
})
export class OrchestratorModule {}
