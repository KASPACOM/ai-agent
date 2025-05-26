import { Module } from '@nestjs/common';
import { Agent } from './agent/Agent.service';
import { InMemoryAgentMemory } from './agent/memory.implementation';
import { OpenAiAdapter } from './llms/openai.service';
import { CoreModule } from '../core/core.module';
import { TelegramModule } from '../integrations/telegram/telegram.module';
import { PromptService } from './services/prompt.service';

@Module({
  imports: [CoreModule, TelegramModule],
  providers: [
    OpenAiAdapter,
    InMemoryAgentMemory,
    PromptService,
    {
      provide: 'LlmAdapter',
      useClass: OpenAiAdapter,
    },
    {
      provide: 'AgentMemory',
      useClass: InMemoryAgentMemory,
    },
    Agent,
  ],
  exports: [Agent],
})
export class OrchestratorModule {}
