import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OpenServConfigurationService,
  OpenServAdvancedConfig,
  OpenServAgentConfig,
} from '../integrations/openserv/openserv.config';
import { MultiAgentService } from './multi-agent.service';
import {
  UserSession,
  ConversationContext,
  ContextMessage,
  UserPreferences,
  UserState,
  ActionHistory,
  MultiAgentWorkflow,
  WorkflowStep,
  CapabilityExecution,
  OpenServResponse,
} from '../integrations/openserv/models/openserv.model';

// Import orchestration services
import { SessionStorageService } from '../integrations/openserv/session-storage.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { IntentRecognitionService } from '../integrations/openserv/intent-recognition.service';

/**
 * AdvancedOrchestratorService
 *
 * Provides sophisticated multi-agent orchestration with:
 * - User session management with memory persistence
 * - Intelligent intent recognition and routing
 * - Multi-agent workflow coordination
 * - Context-aware conversation handling
 * - Result synthesis and workflow management
 */
@Injectable()
export class AdvancedOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(AdvancedOrchestratorService.name);
  private readonly sessions = new Map<string, UserSession>();
  private readonly config: OpenServAdvancedConfig;
  private readonly agentConfigs: OpenServAgentConfig[];

  // Cache for performance optimization
  private readonly resultCache = new Map<
    string,
    { data: any; timestamp: Date; ttl: number }
  >();
  private readonly intentPatterns = new Map<
    string,
    { agents: string[]; confidence: number }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly openServConfig: OpenServConfigurationService,
    private readonly multiAgentService: MultiAgentService,
    private readonly sessionStorageService: SessionStorageService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly intentRecognitionService: IntentRecognitionService,
  ) {
    this.config = this.openServConfig.getAdvancedConfig();
    this.agentConfigs = this.openServConfig.getAgentConfigurations();
  }

  async onModuleInit() {
    this.logger.log('Initializing Advanced OpenServ Orchestrator...');
    await this.initializeIntentPatterns();
    this.startSessionCleanup();
    this.logger.log('Advanced Orchestrator initialized successfully');
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

      // Intelligent intent recognition and routing
      const intent = await this.recognizeIntent(message, session.context);

      // Check if this continues an existing workflow
      if (session.context.activeWorkflow) {
        return await this.continueWorkflow(session, message, intent);
      }

      // Determine if this requires multi-agent coordination
      const executionPlan = await this.planExecution(intent, message);

      if (executionPlan.requiresMultiAgent) {
        return await this.executeMultiAgentWorkflow(session, executionPlan);
      } else {
        return await this.executeSingleCapability(
          session,
          executionPlan.primary,
        );
      }
    } catch (error) {
      this.logger.error('Error processing message:', error);
      return {
        response:
          'I encountered an error processing your request. Please try again.',
        actions: [],
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

  // === Intent Recognition & Intelligent Routing ===
  private async recognizeIntent(
    message: string,
    _context: ConversationContext,
  ): Promise<string> {
    const lowerMessage = message.toLowerCase();

    let bestMatch = 'general';
    let highestConfidence = 0;

    for (const [intent, pattern] of Object.entries(this.intentPatterns)) {
      const matches = pattern.keywords.filter((keyword) =>
        lowerMessage.includes(keyword.toLowerCase()),
      );
      const confidence =
        (matches.length / pattern.keywords.length) * pattern.confidence;

      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = intent;
      }
    }

    return bestMatch;
  }

  // === Execution Planning ===
  private async planExecution(
    intent: string,
    message: string,
  ): Promise<{
    requiresMultiAgent: boolean;
    primary: CapabilityExecution;
    secondary?: CapabilityExecution[];
  }> {
    const pattern = this.intentPatterns.get(intent);
    const primaryAgent = pattern?.agents[0] || 'defi-agent';

    // Simple capability mapping for now
    const capability = await this.mapMessageToCapability(message, primaryAgent);

    return {
      requiresMultiAgent: false,
      primary: {
        agent: primaryAgent,
        capability: capability.name,
        parameters: capability.parameters,
      },
    };
  }

  // === Multi-Agent Workflow Execution ===
  private async executeMultiAgentWorkflow(
    session: UserSession,
    executionPlan: any,
  ): Promise<OpenServResponse> {
    const workflow = executionPlan.workflow;
    session.context.activeWorkflow = workflow;

    const results: Record<string, any> = {};
    const actions: ActionHistory[] = [];

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      workflow.currentStep = i;

      try {
        // Check dependencies
        if (step.dependsOn) {
          const missingDeps = step.dependsOn.filter((dep) => !results[dep]);
          if (missingDeps.length > 0) {
            throw new Error(`Missing dependencies: ${missingDeps.join(', ')}`);
          }
        }

        // Execute step
        const stepResult = await this.executeCapability(
          step.capability,
          step.agent,
          step.parameters,
          session,
        );

        results[step.capability] = stepResult;
        actions.push({
          id: this.generateId(),
          action: step.capability,
          agent: step.agent,
          parameters: step.parameters,
          result: stepResult,
          timestamp: new Date(),
          success: true,
        });

        // Map outputs for next steps
        if (step.outputMapping) {
          Object.entries(step.outputMapping).forEach(([from, to]) => {
            if (stepResult[from as keyof typeof stepResult]) {
              results[to as string] =
                stepResult[from as keyof typeof stepResult];
            }
          });
        }
      } catch (error) {
        this.logger.error(`Workflow step failed: ${step.capability}`, error);
        workflow.status = 'failed';
        actions.push({
          id: this.generateId(),
          action: step.capability,
          agent: step.agent,
          parameters: step.parameters,
          result: { error: error.message },
          timestamp: new Date(),
          success: false,
        });
        break;
      }
    }

    workflow.status =
      workflow.currentStep >= workflow.steps.length - 1
        ? 'completed'
        : 'failed';
    workflow.results = results;

    // Clear active workflow if completed
    if (workflow.status === 'completed') {
      session.context.activeWorkflow = undefined;
    }

    const response = await this.synthesizeWorkflowResponse(
      workflow,
      results,
      actions,
    );

    return {
      response,
      actions,
      workflowStatus: workflow,
    };
  }

  // === Single Capability Execution ===
  private async executeSingleCapability(
    session: UserSession,
    execution: CapabilityExecution,
  ): Promise<OpenServResponse> {
    try {
      const result = await this.executeCapability(
        execution.capability,
        execution.agent,
        execution.parameters,
        session,
      );

      const action: ActionHistory = {
        id: this.generateId(),
        agent: execution.agent,
        action: execution.capability,
        parameters: execution.parameters,
        result,
        timestamp: new Date(),
        success: true,
      };

      // Add response to context
      this.addMessageToContext(session, {
        id: this.generateId(),
        role: 'agent',
        content: await this.formatResult(result),
        timestamp: new Date(),
      });

      return {
        response: await this.formatResult(result),
        actions: [action],
      };
    } catch (error) {
      this.logger.error('Single capability execution failed:', error);
      const action: ActionHistory = {
        id: this.generateId(),
        agent: execution.agent,
        action: execution.capability,
        parameters: execution.parameters,
        result: null,
        timestamp: new Date(),
        success: false,
        error: error.message,
      };

      return {
        response:
          'I encountered an error executing that request. Please try again.',
        actions: [action],
      };
    }
  }

  // === Core Capability Execution ===
  private async executeCapability(
    capability: string,
    agent: string,
    parameters: Record<string, any>,
    session: UserSession,
  ): Promise<any> {
    // Check cache first
    if (this.config.performance.caching.enabled) {
      const cacheKey = this.generateCacheKey(capability, agent, parameters);
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for ${capability}`);
        return cached;
      }
    }

    // Execute via multi-agent service
    const result = await this.multiAgentService.executeCapability(capability, {
      ...parameters,
      userId: session.userId,
      sessionContext: session.context,
      userPreferences: session.preferences,
    });

    // Cache result if enabled
    if (this.config.performance.caching.enabled) {
      const cacheKey = this.generateCacheKey(capability, agent, parameters);
      this.cacheResult(cacheKey, result, this.config.performance.caching.ttl);
    }

    return result;
  }

  // === Workflow Continuation ===
  private async continueWorkflow(
    session: UserSession,
    message: string,
    intent: string,
  ): Promise<OpenServResponse> {
    const workflow = session.context.activeWorkflow!;

    // Handle user responses in workflow context
    if (this.isUserConfirmation(message)) {
      return await this.resumeWorkflow(session);
    } else if (this.isUserCancellation(message)) {
      workflow.status = 'paused';
      return {
        response:
          'Workflow paused. You can resume it later or start a new request.',
        actions: [],
        workflowStatus: workflow,
      };
    } else {
      // User provided additional input - incorporate into workflow
      return await this.updateWorkflowWithUserInput(session, message, intent);
    }
  }

  // === Utility Methods ===
  private async initializeIntentPatterns(): Promise<void> {
    // Initialize with basic patterns - could be enhanced with ML
    this.intentPatterns.set('swap', {
      agents: ['defi-agent'],
      confidence: 0.95,
    });
    this.intentPatterns.set('portfolio', {
      agents: ['wallet-agent'],
      confidence: 0.9,
    });
    this.intentPatterns.set('trade', {
      agents: ['trading-agent'],
      confidence: 0.85,
    });
  }

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

  private generateCacheKey(
    capability: string,
    agent: string,
    parameters: Record<string, any>,
  ): string {
    return `${agent}:${capability}:${JSON.stringify(parameters)}`;
  }

  private getCachedResult(key: string): any {
    const cached = this.resultCache.get(key);
    if (
      cached &&
      new Date().getTime() - cached.timestamp.getTime() < cached.ttl
    ) {
      return cached.data;
    }
    this.resultCache.delete(key);
    return null;
  }

  private cacheResult(key: string, data: any, ttl: number): void {
    this.resultCache.set(key, {
      data,
      timestamp: new Date(),
      ttl,
    });
  }

  // Placeholder methods - would need full implementation
  private async loadUserPreferences(_userId: string): Promise<UserPreferences> {
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

  private isComplexQuery(message: string): boolean {
    const complexIndicators = [
      'and then',
      'after that',
      'also',
      'analyze',
      'compare',
      'optimize',
    ];
    return complexIndicators.some((indicator) =>
      message.toLowerCase().includes(indicator),
    );
  }

  private async mapMessageToCapability(
    message: string,
    agent: string,
  ): Promise<{ name: string; parameters: Record<string, any> }> {
    // Basic mapping - would need sophisticated NLP in production
    if (agent === 'defi-agent' && message.includes('swap')) {
      return { name: 'swap_tokens', parameters: {} };
    }
    return { name: 'get_info', parameters: {} };
  }

  private async createWorkflow(
    intent: any,
    message: string,
  ): Promise<MultiAgentWorkflow> {
    return {
      id: this.generateId(),
      name: `${intent.primary}_workflow`,
      steps: [], // Would be populated based on intent
      currentStepIndex: 0,
      currentStep: 0,
      status: 'active',
      results: {},
      metadata: { intent, originalMessage: message },
    };
  }

  private async synthesizeWorkflowResponse(
    workflow: MultiAgentWorkflow,
    results: Record<string, any>,
    actions: ActionHistory[],
  ): Promise<string> {
    return `Completed ${workflow.name} with ${actions.length} steps. ${workflow.status === 'completed' ? 'All operations successful.' : 'Some operations failed.'}`;
  }

  private async formatResult(result: any): Promise<string> {
    return typeof result === 'string'
      ? result
      : JSON.stringify(result, null, 2);
  }

  private isUserConfirmation(message: string): boolean {
    const confirmWords = ['yes', 'confirm', 'proceed', 'continue', 'ok', 'y'];
    return confirmWords.some((word) => message.toLowerCase().includes(word));
  }

  private isUserCancellation(message: string): boolean {
    const cancelWords = ['no', 'cancel', 'stop', 'abort', 'exit', 'n'];
    return cancelWords.some((word) => message.toLowerCase().includes(word));
  }

  private async resumeWorkflow(
    _session: UserSession,
  ): Promise<OpenServResponse> {
    // Resume paused workflow
    return { response: 'Resuming workflow...', actions: [] };
  }

  private async updateWorkflowWithUserInput(
    _session: UserSession,
    _message: string,
    _intent: any,
  ): Promise<OpenServResponse> {
    // Update workflow with new user input
    return { response: 'Updated workflow with your input...', actions: [] };
  }
}
