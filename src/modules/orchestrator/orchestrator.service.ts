import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// === Import configurations ===
import {
  OpenServConfigurationService,
  OpenServAdvancedConfig,
} from '../integrations/openserv/openserv.config';

// === OpenServ Models (for communication protocol) ===
import {
  OpenServResponse,
  UserSession,
  ContextMessage,
  UserPreferences,
  OrchestrationFlow,
} from '../integrations/openserv/models/openserv.model';

// === MultiAgent Models (for internal types) ===
import {
  AgentDecision,
  AgentResponse,
  AgentCapabilityInfo,
} from '../multiagent/models/agent.model';

// === Core Services ===
import { SessionStorageService } from './session-storage.service';
import { MultiAgentService } from './multi-agent.service';
import { PromptBuilderService } from '../prompt-builder/prompt-builder.service';

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
    this.logger.log(`[ORCHESTRATOR] Processing message from user: ${userId}`);
    this.logger.debug(`[ORCHESTRATOR] User message: "${message}"`);

    try {
      // Get or create user session with memory
      const session = await this.getOrCreateSession(userId, metadata);
      this.logger.log(
        `[ORCHESTRATOR] Session loaded for user: ${userId}, messages: ${session.context.messages.length}`,
      );

      // Add user message to context
      this.addMessageToContext(session, {
        id: this.generateId(),
        role: 'user',
        content: message,
        timestamp: new Date(),
        metadata,
      });

      // Execute 3-stage orchestration
      this.logger.log(
        `[ORCHESTRATOR] Starting 3-stage processing for: "${message}"`,
      );
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

      this.logger.log(
        `[ORCHESTRATOR] Successfully processed message, response length: ${response.response.length} characters`,
      );
      return response;
    } catch (error) {
      this.logger.error(
        `[ORCHESTRATOR] Error processing message for user ${userId}:`,
        error,
      );
      this.logger.error(`[ORCHESTRATOR] Error stack:`, error.stack);
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
    const flowId = this.generateId();
    this.logger.log(
      `[3-STAGE] Starting 3-stage flow ${flowId} for input: "${userInput}"`,
    );

    const flow: OrchestrationFlow = {
      id: flowId,
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
      this.logger.log(`[3-STAGE] ${flowId} - Starting Stage 1: Decision Agent`);
      await this.executeDecisionStage(flow, session);

      // Stage 2: Agent Execution
      this.logger.log(
        `[3-STAGE] ${flowId} - Starting Stage 2: Agent Execution`,
      );
      await this.executeAgentStage(flow, session);

      // Stage 3: Response Synthesis
      this.logger.log(
        `[3-STAGE] ${flowId} - Starting Stage 3: Response Synthesis`,
      );
      await this.executeSynthesisStage(flow, session);

      flow.overallStatus = 'completed';
      flow.completedAt = new Date();

      this.logger.log(`[3-STAGE] ${flowId} - Flow completed successfully`);
      this.logger.debug(
        `[3-STAGE] ${flowId} - Final response: "${flow.synthesisStage.finalResponse}"`,
      );

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
      this.logger.error(`[3-STAGE] ${flowId} - Flow failed:`, error);
      this.logger.error(`[3-STAGE] ${flowId} - Error stack:`, error.stack);
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
    const stageId = `${flow.id}-DECISION`;
    this.logger.log(`[DECISION] ${stageId} - Starting decision stage`);

    try {
      // Get all available agent capabilities
      this.logger.log(`[DECISION] ${stageId} - Discovering agent capabilities`);
      const agentCapabilities = await this.getAvailableAgentCapabilities();
      this.logger.log(
        `[DECISION] ${stageId} - Discovered ${agentCapabilities.length} agent groups with capabilities`,
      );

      // Build decision prompt using PromptBuilder
      this.logger.log(`[DECISION] ${stageId} - Building decision prompt`);
      const builtPrompt = this.promptBuilder.buildDecisionPrompt({
        userInput: flow.originalInput,
        agentCapabilities,
        session,
      });
      this.logger.debug(
        `[DECISION] ${stageId} - Built prompt length: ${builtPrompt.prompt.length} characters`,
      );

      // Call LLM for decision
      this.logger.log(
        `[DECISION] ${stageId} - Calling LLM for decision making`,
      );
      const decisionResponse = await this.callDecisionLLM(builtPrompt.prompt);

      flow.decisionStage.agentDecisions = decisionResponse.decisions;
      flow.decisionStage.reasoning = decisionResponse.reasoning;
      flow.decisionStage.status = 'completed';

      this.logger.log(
        `[DECISION] ${stageId} - Decision stage completed: ${flow.decisionStage.agentDecisions.length} agents selected`,
      );

      // Log each decision made
      flow.decisionStage.agentDecisions.forEach((decision, index) => {
        this.logger.log(
          `[DECISION] ${stageId} - Decision ${index + 1}: Agent=${decision.agent}, Capability=${decision.capability}`,
        );
        this.logger.debug(
          `[DECISION] ${stageId} - Decision ${index + 1} parameters:`,
          decision.parameters,
        );
      });

      this.logger.debug(
        `[DECISION] ${stageId} - LLM reasoning: "${decisionResponse.reasoning}"`,
      );
    } catch (error) {
      this.logger.error(
        `[DECISION] ${stageId} - Decision stage failed:`,
        error,
      );
      this.logger.error(`[DECISION] ${stageId} - Error stack:`, error.stack);
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
    const stageId = `${flow.id}-EXECUTION`;
    this.logger.log(
      `[EXECUTION] ${stageId} - Starting agent execution stage with ${flow.decisionStage.agentDecisions.length} agents`,
    );

    try {
      const responses: AgentResponse[] = [];
      const errors: string[] = [];

      // Execute agent calls in parallel
      const agentPromises = flow.decisionStage.agentDecisions.map(
        async (decision, index) => {
          const executionId = `${stageId}-Agent${index + 1}`;
          const startTime = Date.now();

          this.logger.log(
            `[EXECUTION] ${executionId} - Executing ${decision.agent}.${decision.capability}`,
          );
          this.logger.debug(
            `[EXECUTION] ${executionId} - Parameters:`,
            decision.parameters,
          );

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

            const executionTime = Date.now() - startTime;
            this.logger.log(
              `[EXECUTION] ${executionId} - Completed successfully in ${executionTime}ms`,
            );
            this.logger.debug(
              `[EXECUTION] ${executionId} - Response:`,
              response,
            );

            return {
              agent: decision.agent,
              capability: decision.capability,
              response,
              success: true,
              executionTime,
            };
          } catch (error) {
            const executionTime = Date.now() - startTime;
            this.logger.error(
              `[EXECUTION] ${executionId} - Failed after ${executionTime}ms:`,
              error,
            );
            this.logger.error(
              `[EXECUTION] ${executionId} - Error stack:`,
              error.stack,
            );

            return {
              agent: decision.agent,
              capability: decision.capability,
              response: null,
              success: false,
              error: error.message,
              executionTime,
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

      const successCount = responses.filter((r) => r.success).length;
      this.logger.log(
        `[EXECUTION] ${stageId} - Execution stage completed: ${successCount}/${responses.length} agents succeeded`,
      );

      if (errors.length > 0) {
        this.logger.warn(
          `[EXECUTION] ${stageId} - Errors encountered:`,
          errors,
        );
      }
    } catch (error) {
      this.logger.error(
        `[EXECUTION] ${stageId} - Execution stage failed:`,
        error,
      );
      this.logger.error(`[EXECUTION] ${stageId} - Error stack:`, error.stack);
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
    const stageId = `${flow.id}-SYNTHESIS`;
    this.logger.log(
      `[SYNTHESIS] ${stageId} - Starting response synthesis stage`,
    );

    try {
      // Build synthesis prompt using PromptBuilder
      this.logger.log(`[SYNTHESIS] ${stageId} - Building synthesis prompt`);
      const builtPrompt = this.promptBuilder.buildSynthesisPrompt({
        originalInput: flow.originalInput,
        agentResponses: flow.executionStage.agentResponses,
        session,
      });
      this.logger.debug(
        `[SYNTHESIS] ${stageId} - Built prompt length: ${builtPrompt.prompt.length} characters`,
      );

      // Call LLM for synthesis
      this.logger.log(
        `[SYNTHESIS] ${stageId} - Calling LLM for response synthesis`,
      );
      const synthesisResponse = await this.callSynthesisLLM(builtPrompt.prompt);

      flow.synthesisStage.finalResponse = synthesisResponse.response;
      flow.synthesisStage.reasoning = synthesisResponse.reasoning;
      flow.synthesisStage.status = 'completed';

      this.logger.log(`[SYNTHESIS] ${stageId} - Synthesis stage completed`);
      this.logger.debug(
        `[SYNTHESIS] ${stageId} - Final response length: ${synthesisResponse.response.length} characters`,
      );
      this.logger.debug(
        `[SYNTHESIS] ${stageId} - LLM reasoning: "${synthesisResponse.reasoning}"`,
      );
    } catch (error) {
      this.logger.error(
        `[SYNTHESIS] ${stageId} - Synthesis stage failed:`,
        error,
      );
      this.logger.error(`[SYNTHESIS] ${stageId} - Error stack:`, error.stack);
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
    try {
      // Use the MultiAgentService to get all capability groups
      const capabilityGroups = this.multiAgentService.getAllCapabilities();

      // Convert AgentCapabilityGroup[] to AgentCapabilityInfo[] format
      const agentCapabilities: AgentCapabilityInfo[] = [];

      for (const group of capabilityGroups) {
        // Filter out internal-only capabilities for external use
        const publicCapabilities = group.capabilities.filter(
          (cap) => !cap.isInternal,
        );

        if (publicCapabilities.length > 0) {
          agentCapabilities.push({
            agent: group.agentMetadata.name,
            capabilities: publicCapabilities,
          });
        }

        this.logger.debug(
          `Discovered ${publicCapabilities.length} public capabilities for ${group.agentMetadata.name}`,
        );
      }

      this.logger.log(
        `Dynamically discovered capabilities from ${agentCapabilities.length} agents`,
      );

      return agentCapabilities;
    } catch (error) {
      this.logger.error('Failed to get agent capabilities:', error);
      return [];
    }
  }

  /**
   * Call Decision LLM using OpenAI
   */
  private async callDecisionLLM(prompt: string): Promise<{
    decisions: AgentDecision[];
    reasoning: string;
  }> {
    const llmCallId = this.generateId();
    this.logger.log(`[LLM-DECISION] ${llmCallId} - Starting decision LLM call`);
    this.logger.debug(
      `[LLM-DECISION] ${llmCallId} - Prompt length: ${prompt.length} characters`,
    );

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

      this.logger.log(
        `[LLM-DECISION] ${llmCallId} - Calling OpenAI with ${conversation.messages.length} messages`,
      );

      const startTime = Date.now();
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

      const duration = Date.now() - startTime;
      this.logger.log(
        `[LLM-DECISION] ${llmCallId} - OpenAI call completed in ${duration}ms`,
      );
      this.logger.log(
        `[LLM-DECISION] ${llmCallId} - Received ${response.decisions.length} decisions`,
      );
      this.logger.debug(
        `[LLM-DECISION] ${llmCallId} - Response:`,
        JSON.stringify(response, null, 2),
      );

      return response;
    } catch (error) {
      this.logger.error(
        `[LLM-DECISION] ${llmCallId} - Decision LLM call failed:`,
        error,
      );
      this.logger.error(
        `[LLM-DECISION] ${llmCallId} - Error stack:`,
        error.stack,
      );

      // Fallback to simple routing
      this.logger.warn(`[LLM-DECISION] ${llmCallId} - Using fallback routing`);
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
    const llmCallId = this.generateId();
    this.logger.log(
      `[LLM-SYNTHESIS] ${llmCallId} - Starting synthesis LLM call`,
    );
    this.logger.debug(
      `[LLM-SYNTHESIS] ${llmCallId} - Prompt length: ${prompt.length} characters`,
    );

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

      this.logger.log(
        `[LLM-SYNTHESIS] ${llmCallId} - Calling OpenAI with ${conversation.messages.length} messages`,
      );

      const startTime = Date.now();
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

      const duration = Date.now() - startTime;
      this.logger.log(
        `[LLM-SYNTHESIS] ${llmCallId} - OpenAI call completed in ${duration}ms`,
      );
      this.logger.log(
        `[LLM-SYNTHESIS] ${llmCallId} - Response length: ${response.response.length} characters`,
      );
      this.logger.debug(
        `[LLM-SYNTHESIS] ${llmCallId} - Final response: "${response.response}"`,
      );
      this.logger.debug(
        `[LLM-SYNTHESIS] ${llmCallId} - LLM reasoning: "${response.reasoning}"`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `[LLM-SYNTHESIS] ${llmCallId} - Synthesis LLM call failed:`,
        error,
      );
      this.logger.error(
        `[LLM-SYNTHESIS] ${llmCallId} - Error stack:`,
        error.stack,
      );

      // Fallback to simple response
      this.logger.warn(
        `[LLM-SYNTHESIS] ${llmCallId} - Using fallback response`,
      );
      return {
        response:
          'I was able to process your request but encountered an issue generating the final response. Please try again.',
        reasoning: 'Fallback response due to synthesis LLM error',
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
