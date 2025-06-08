import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { OrchestratorService } from '../../../src/modules/orchestrator/orchestrator.service';
import { OpenServConfigurationService } from '../../../src/modules/integrations/openserv/openserv.config';
import { SessionStorageService } from '../../../src/modules/integrations/openserv/session-storage.service';
import { MultiAgentService } from '../../../src/modules/orchestrator/multi-agent.service';
import { PromptBuilderService } from '../../../src/modules/prompt-builder/prompt-builder.service';
import { DeFiAgentService } from '../../../src/modules/integrations/openserv/agents/defi-agent.service';
import { TradingAgentService } from '../../../src/modules/integrations/openserv/agents/trading-agent.service';
import { WalletAgentService } from '../../../src/modules/integrations/openserv/agents/wallet-agent.service';
import { TokenRegistryAgentService } from '../../../src/modules/integrations/openserv/agents/token-registry-agent.service';
import { UserManagementAgentService } from '../../../src/modules/integrations/openserv/agents/user-management-agent.service';

describe('Advanced Orchestrator (Three-Stage Architecture)', () => {
  let orchestrator: OrchestratorService;
  let promptBuilder: PromptBuilderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule, ConfigModule],
      providers: [
        OrchestratorService,
        OpenServConfigurationService,
        SessionStorageService,
        MultiAgentService,
        PromptBuilderService,
        DeFiAgentService,
        TradingAgentService,
        WalletAgentService,
        TokenRegistryAgentService,
        UserManagementAgentService,
      ],
    }).compile();

    orchestrator = module.get<OrchestratorService>(OrchestratorService);
    promptBuilder = module.get<PromptBuilderService>(PromptBuilderService);
  });

  describe('Three-Stage Orchestration', () => {
    it('should have processMessage method', () => {
      expect(orchestrator.processMessage).toBeDefined();
      expect(typeof orchestrator.processMessage).toBe('function');
    });

    it('should discover agent capabilities dynamically', async () => {
      // Test that the orchestrator can discover capabilities from all agents
      const response = await orchestrator.processMessage(
        'test-user',
        'What is the current price of KAS?',
      );

      expect(response).toBeDefined();
      expect(response.response).toBeDefined();
      expect(Array.isArray(response.actions)).toBe(true);
    });

    it('should use PromptBuilder for decision stage', () => {
      expect(promptBuilder).toBeDefined();
      expect(promptBuilder.buildDecisionPrompt).toBeDefined();
      expect(typeof promptBuilder.buildDecisionPrompt).toBe('function');
    });

    it('should use PromptBuilder for synthesis stage', () => {
      expect(promptBuilder.buildSynthesisPrompt).toBeDefined();
      expect(typeof promptBuilder.buildSynthesisPrompt).toBe('function');
    });

    it('should track orchestration flows in session', async () => {
      const userId = 'test-user-flows';
      const message = 'Show me my portfolio';

      const response = await orchestrator.processMessage(userId, message);

      expect(response).toBeDefined();
      expect(response.response).toBeDefined();
      // Additional assertions would require access to session state
    });
  });

  describe('PromptBuilder Integration', () => {
    it('should load prompt templates', () => {
      const templates = promptBuilder.getAvailableTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates).toContain('decision-agent');
      expect(templates).toContain('synthesis-agent');
    });

    it('should build decision prompts correctly', () => {
      const mockContext = {
        userInput: 'Test query',
        agentCapabilities: [
          {
            agent: 'test-agent',
            capabilities: [
              {
                name: 'test_capability',
                description: 'Test capability',
                parameters: [],
                examples: ['test example'],
              },
            ],
          },
        ],
        session: {
          orchestrationFlows: [],
        } as any,
      };

      const result = promptBuilder.buildDecisionPrompt(mockContext);
      expect(result.prompt).toContain('Test query');
      expect(result.templateName).toBe('decision-agent');
    });
  });
});
