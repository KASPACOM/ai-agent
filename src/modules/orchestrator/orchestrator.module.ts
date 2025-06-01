import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

// === Core Orchestration Services ===
import { MultiAgentService } from './multi-agent.service';
import { AdvancedOrchestratorService } from './orchestrator.service';
import { WorkflowEngineService } from './workflow-engine.service';

// === LLM Services ===
import { OpenAiAdapter } from './llms/openai.service';

// === OpenServ Integration (provides AgentFactory and all agent services) ===
import { OpenServModule } from '../integrations/openserv/openserv.module';

// === Prompt Management ===
import { PromptBuilderModule } from '../prompt-builder/prompt-builder.module';

// === Core Configuration ===
import { AppConfigModule } from '../core/modules/config/app-config.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    AppConfigModule, // Import AppConfig for OpenAI configuration
    OpenServModule, // Import OpenServ for AgentFactory and all agent services
    PromptBuilderModule, // Import PromptBuilder for centralized prompt management
  ],
  providers: [
    // === LLM Services ===
    OpenAiAdapter,

    // === Core Orchestration ===
    MultiAgentService,
    AdvancedOrchestratorService,
    WorkflowEngineService,
  ],
  exports: [
    // === LLM Services ===
    OpenAiAdapter,

    // === Primary Orchestration Service ===
    AdvancedOrchestratorService,

    // === Multi-Agent Coordination ===
    MultiAgentService,
    WorkflowEngineService,
  ],
})
export class OrchestratorModule {}
