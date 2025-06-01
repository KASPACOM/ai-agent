import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OpenServConfigurationService,
  OpenServAdvancedConfig,
} from '../integrations/openserv/openserv.config';
import {
  UserSession,
  ContextMessage,
  UserPreferences,
  OpenServResponse,
  OrchestrationFlow,
  AgentDecision,
  AgentResponse,
  AgentCapabilityInfo,
} from '../integrations/openserv/models/openserv.model';

// Import orchestration services
import { SessionStorageService } from '../integrations/openserv/session-storage.service';
import { MultiAgentService } from './multi-agent.service';
import { PromptBuilderService } from '../prompt-builder/prompt-builder.service';

// Import agent services for capability discovery
import { DeFiAgentService } from '../integrations/openserv/agents/defi-agent.service';
import { TradingAgentService } from '../integrations/openserv/agents/trading-agent.service';
import { WalletAgentService } from '../integrations/openserv/agents/wallet-agent.service';
import { TokenRegistryAgentService } from '../integrations/openserv/agents/token-registry-agent.service';
import { UserManagementAgentService } from '../integrations/openserv/agents/user-management-agent.service';

// Import LLM service
import { OpenAiAdapter } from './llms/openai.service';
import { LlmConversation } from './llms/llm-adapter.interface';

/**
 * AdvancedOrchestratorService
 *
 * Unified orchestrator with 3-stage LLM processing:
 * - User session management with memory persistence
 * - Stage 1: Decision Agent (LLM) decides which agents to call
 * - Stage 2: Execute domain agents
 * - Stage 3: Response Synthesis Agent (LLM) combines responses
 */
@Injectable()
export class AdvancedOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(AdvancedOrchestratorService.name);
  private readonly sessions = new Map<string, UserSession>();
  private readonly config: OpenServAdvancedConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly openServConfig: OpenServConfigurationService,
    private readonly sessionStorageService: SessionStorageService,
    private readonly multiAgentService: MultiAgentService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly openaiAdapter: OpenAiAdapter,
    // Agent services for dynamic capability discovery
    private readonly defiAgent: DeFiAgentService,
    private readonly tradingAgent: TradingAgentService,
    private readonly walletAgent: WalletAgentService,
    private readonly tokenRegistryAgent: TokenRegistryAgentService,
    private readonly userManagementAgent: UserManagementAgentService,
  ) {
    this.config = this.openServConfig.getAdvancedConfig();
  }

  async onModuleInit() {
    this.logger.log('Initializing Advanced 3-Stage Orchestrator...');
    this.startSessionCleanup();
    this.logger.log('Advanced 3-Stage Orchestrator initialized successfully');
  }

  // === Main Orchestration Entry Point ===
  async processMessage(
    userId: string,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<OpenServResponse> {
    try {
      // Get or create user session with memory
      const session = await this.getOrCreateSession(userId, metadata);

      // Add user message to context
      this.addMessageToContext(session, {
        id: this.generateId(),
        role: 'user',
        content: message,
        timestamp: new Date(),
        metadata,
      });

      // Execute 3-stage orchestration
      const response = await this.processUserInputWithThreeStages(
        message,
        session,
      );

      // Add response to context
      this.addMessageToContext(session, {
        id: this.generateId(),
        role: 'agent',
        content: response.response,
        timestamp: new Date(),
      });

      return response;
    } catch (error) {
      this.logger.error('Error processing message:', error);
      return {
        response:
          'I encountered an error processing your request. Please try again.',
        actions: [],
      };
    }
  }

  // === Three-Stage Orchestration Logic ===
  async processUserInputWithThreeStages(
    userInput: string,
    session: UserSession,
  ): Promise<OpenServResponse> {
    const flow: OrchestrationFlow = {
      id: this.generateId(),
      userId: session.userId,
      originalInput: userInput,
      timestamp: new Date(),
      decisionStage: {
        status: 'pending',
        agentDecisions: [],
        reasoning: '',
      },
      executionStage: {
        status: 'pending',
        agentResponses: [],
        errors: [],
      },
      synthesisStage: {
        status: 'pending',
        finalResponse: '',
        reasoning: '',
      },
      overallStatus: 'pending',
    };

    // Add flow to session
    session.orchestrationFlows.push(flow);

    try {
      // Stage 1: Decision Agent
      await this.executeDecisionStage(flow, session);

      // Stage 2: Agent Execution
      await this.executeAgentStage(flow, session);

      // Stage 3: Response Synthesis
      await this.executeSynthesisStage(flow, session);

      flow.overallStatus = 'completed';
      flow.completedAt = new Date();

      return {
        response: flow.synthesisStage.finalResponse,
        actions: flow.executionStage.agentResponses.map((resp) => ({
          id: this.generateId(),
          agent: resp.agent,
          action: resp.capability,
          parameters: {},
          result: resp.response,
          timestamp: new Date(),
          success: resp.success,
          error: resp.error,
        })),
      };
    } catch (error) {
      this.logger.error('3-stage orchestration flow failed:', error);
      flow.overallStatus = 'failed';

      return {
        response:
          'I encountered an error processing your request. Please try again.',
        actions: [],
      };
    }
  }

  /**
   * Stage 1: Decision Agent - Uses LLM to decide which agents to call
   */
  private async executeDecisionStage(
    flow: OrchestrationFlow,
    session: UserSession,
  ): Promise<void> {
    try {
      // Get all available agent capabilities
      const agentCapabilities = await this.getAvailableAgentCapabilities();

      // Build decision prompt using PromptBuilder
      const builtPrompt = this.promptBuilder.buildDecisionPrompt({
        userInput: flow.originalInput,
        agentCapabilities,
        session,
      });

      // Call LLM for decision
      const decisionResponse = await this.callDecisionLLM(builtPrompt.prompt);

      flow.decisionStage.agentDecisions = decisionResponse.decisions;
      flow.decisionStage.reasoning = decisionResponse.reasoning;
      flow.decisionStage.status = 'completed';

      this.logger.log(
        `Decision Stage completed: ${flow.decisionStage.agentDecisions.length} agents selected`,
      );
    } catch (error) {
      flow.decisionStage.status = 'failed';
      flow.decisionStage.error = error.message;
      throw error;
    }
  }

  /**
   * Stage 2: Execute calls to domain agents
   */
  private async executeAgentStage(
    flow: OrchestrationFlow,
    session: UserSession,
  ): Promise<void> {
    try {
      const responses: AgentResponse[] = [];
      const errors: string[] = [];

      // Execute agent calls in parallel
      const agentPromises = flow.decisionStage.agentDecisions.map(
        async (decision) => {
          const startTime = Date.now();

          try {
            const response = await this.multiAgentService.executeCapability(
              decision.capability,
              {
                ...decision.parameters,
                prompt: decision.prompt,
                userId: session.userId,
                sessionContext: session.context,
              },
            );

            return {
              agent: decision.agent,
              capability: decision.capability,
              response,
              success: true,
              executionTime: Date.now() - startTime,
            };
          } catch (error) {
            this.logger.error(`Agent ${decision.agent} failed:`, error);

            return {
              agent: decision.agent,
              capability: decision.capability,
              response: null,
              success: false,
              error: error.message,
              executionTime: Date.now() - startTime,
            };
          }
        },
      );

      const results = await Promise.all(agentPromises);

      results.forEach((result) => {
        responses.push(result);
        if (!result.success && result.error) {
          errors.push(`${result.agent}: ${result.error}`);
        }
      });

      flow.executionStage.agentResponses = responses;
      flow.executionStage.errors = errors;
      flow.executionStage.status = 'completed';

      this.logger.log(
        `Execution Stage completed: ${responses.filter((r) => r.success).length}/${responses.length} agents succeeded`,
      );
    } catch (error) {
      flow.executionStage.status = 'failed';
      throw error;
    }
  }

  /**
   * Stage 3: Response Synthesis - Uses LLM to combine agent responses
   */
  private async executeSynthesisStage(
    flow: OrchestrationFlow,
    session: UserSession,
  ): Promise<void> {
    try {
      // Build synthesis prompt using PromptBuilder
      const builtPrompt = this.promptBuilder.buildSynthesisPrompt({
        originalInput: flow.originalInput,
        agentResponses: flow.executionStage.agentResponses,
        session,
      });

      // Call LLM for synthesis
      const synthesisResponse = await this.callSynthesisLLM(builtPrompt.prompt);

      flow.synthesisStage.finalResponse = synthesisResponse.response;
      flow.synthesisStage.reasoning = synthesisResponse.reasoning;
      flow.synthesisStage.status = 'completed';

      this.logger.log('Synthesis Stage completed');
    } catch (error) {
      flow.synthesisStage.status = 'failed';
      flow.synthesisStage.error = error.message;
      throw error;
    }
  }

  /**
   * Dynamically discover agent capabilities
   */
  private async getAvailableAgentCapabilities(): Promise<
    AgentCapabilityInfo[]
  > {
    const agentCapabilities: AgentCapabilityInfo[] = [];

    const agents = [
      { name: 'defi-agent', service: this.defiAgent },
      { name: 'trading-agent', service: this.tradingAgent },
      { name: 'wallet-agent', service: this.walletAgent },
      { name: 'token-registry-agent', service: this.tokenRegistryAgent },
      { name: 'user-management-agent', service: this.userManagementAgent },
    ];

    for (const agent of agents) {
      try {
        const capabilities = agent.service.getCapabilities();

        // Filter out internal-only capabilities for external use
        const publicCapabilities = capabilities.filter(
          (cap) => !cap.isInternal,
        );

        if (publicCapabilities.length > 0) {
          agentCapabilities.push({
            agent: agent.name,
            capabilities: publicCapabilities,
          });
        }

        this.logger.debug(
          `Discovered ${publicCapabilities.length} public capabilities for ${agent.name}`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to get capabilities from ${agent.name}:`,
          error.message,
        );
      }
    }

    this.logger.log(
      `Dynamically discovered capabilities from ${agentCapabilities.length} agents`,
    );

    return agentCapabilities;
  }

  /**
   * Call Decision LLM using OpenAI
   */
  private async callDecisionLLM(prompt: string): Promise<{
    decisions: AgentDecision[];
    reasoning: string;
  }> {
    try {
      const conversation: LlmConversation = {
        messages: [
          {
            role: 'system',
            content:
              'You are a Decision Agent for a multi-agent DeFi platform. Respond only with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      };

      const response = await this.openaiAdapter.generateStructuredOutput<{
        decisions: AgentDecision[];
        reasoning: string;
      }>(
        conversation,
        {
          type: 'object',
          properties: {
            decisions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  agent: { type: 'string' },
                  capability: { type: 'string' },
                  prompt: { type: 'string' },
                  parameters: { type: 'object' },
                  priority: { type: 'number' },
                },
                required: [
                  'agent',
                  'capability',
                  'prompt',
                  'parameters',
                  'priority',
                ],
              },
            },
            reasoning: { type: 'string' },
          },
          required: ['decisions', 'reasoning'],
        },
        {
          temperature: 0.3,
          maxTokens: 1000,
        },
      );

      return response;
    } catch (error) {
      this.logger.error('Decision LLM call failed:', error);
      // Fallback to simple routing
      return {
        decisions: [
          {
            agent: 'defi-agent',
            capability: 'defi_general_query',
            prompt: 'Handle this general query',
            parameters: {},
            priority: 1,
          },
        ],
        reasoning: 'Fallback routing due to LLM error',
      };
    }
  }

  /**
   * Call Synthesis LLM using OpenAI
   */
  private async callSynthesisLLM(prompt: string): Promise<{
    response: string;
    reasoning: string;
  }> {
    try {
      const conversation: LlmConversation = {
        messages: [
          {
            role: 'system',
            content:
              'You are a Response Synthesis Agent. Create natural, helpful responses and respond only with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      };

      const response = await this.openaiAdapter.generateStructuredOutput<{
        response: string;
        reasoning: string;
      }>(
        conversation,
        {
          type: 'object',
          properties: {
            response: { type: 'string' },
            reasoning: { type: 'string' },
          },
          required: ['response', 'reasoning'],
        },
        {
          temperature: 0.7,
          maxTokens: 800,
        },
      );

      return response;
    } catch (error) {
      this.logger.error('Synthesis LLM call failed:', error);
      // Fallback to simple response
      return {
        response:
          'I apologize, but I encountered an issue processing your request. Please try again.',
        reasoning: 'Fallback response due to LLM error',
      };
    }
  }

  // === Session & Memory Management ===
  private async getOrCreateSession(
    userId: string,
    metadata?: Record<string, any>,
  ): Promise<UserSession> {
    let session = this.sessions.get(userId);

    if (!session) {
      session = {
        id: this.generateId(),
        userId,
        sessionId: this.generateId(),
        context: {
          messages: [],
          userState: {},
          recentActions: [],
        },
        preferences: await this.loadUserPreferences(userId),
        state: { walletAddresses: {}, activeTokens: [], recentActivities: [] },
        createdAt: new Date(),
        lastActivity: new Date(),
        metadata: metadata || {},
        orchestrationFlows: [], // Initialize empty flows array
      };
      this.sessions.set(userId, session);
    } else {
      session.lastActivity = new Date();
      if (metadata) {
        session.metadata = { ...session.metadata, ...metadata };
      }
    }

    // Clean old context if needed
    if (
      session.context.messages.length >
      this.config.orchestration.memoryManagement.maxHistoryLength
    ) {
      await this.compressContext(session);
    }

    return session;
  }

  private addMessageToContext(
    session: UserSession,
    message: ContextMessage,
  ): void {
    session.context.messages.push(message);
    session.lastActivity = new Date();
  }

  private async compressContext(session: UserSession): Promise<void> {
    if (!this.config.orchestration.memoryManagement.contextCompression) return;

    const messages = session.context.messages;
    const keepRecent = Math.floor(
      this.config.orchestration.memoryManagement.maxHistoryLength * 0.3,
    );
    const compress = messages.slice(0, -keepRecent);

    // Create compressed summary
    const summary = await this.createContextSummary(compress, session);

    // Keep only recent messages plus summary
    session.context.messages = [
      {
        id: this.generateId(),
        role: 'system',
        content: `[Context Summary]: ${summary}`,
        timestamp: new Date(),
        metadata: { compressed: true },
      },
      ...messages.slice(-keepRecent),
    ];
  }

  // === Utility Methods ===
  private startSessionCleanup(): void {
    const interval =
      this.config.orchestration.memoryManagement.sessionTimeout / 4;
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, interval);
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    const timeout = this.config.orchestration.memoryManagement.sessionTimeout;

    for (const [userId, session] of this.sessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > timeout) {
        this.sessions.delete(userId);
        this.logger.debug(`Cleaned up expired session for user ${userId}`);
      }
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  // Placeholder methods - would need full implementation
  private async loadUserPreferences(userId: string): Promise<UserPreferences> {
    // TODO: Implement actual user preference loading from database
    // For now, return default preferences based on userId
    this.logger.debug(`Loading default preferences for user: ${userId}`);

    return {
      preferredNetwork: 'kasplex',
      defaultSlippage: 1.0,
      walletAddresses: {},
      riskTolerance: 'medium',
      tradingStyle: 'moderate',
      notifications: {
        priceAlerts: true,
        tradeExecutions: true,
        marketUpdates: false,
      },
    };
  }

  private async createContextSummary(
    messages: ContextMessage[],
    session: UserSession,
  ): Promise<string> {
    return `User has been discussing ${session.context.currentIntent || 'general topics'} with recent activity in portfolio management.`;
  }
}
