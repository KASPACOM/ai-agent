import { Injectable, Logger } from '@nestjs/common';
import {
  MultiAgentWorkflow,
  WorkflowStep,
  ActionHistory,
  UserSession,
} from '../integrations/openserv/models/openserv.model';
import { MultiAgentService } from './multi-agent.service';

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);
  private readonly activeWorkflows = new Map<string, MultiAgentWorkflow>();

  constructor(private readonly multiAgentService: MultiAgentService) {}

  async createWorkflow(
    name: string,
    steps: WorkflowStep[],
    session: UserSession,
  ): Promise<MultiAgentWorkflow> {
    const workflow: MultiAgentWorkflow = {
      id: this.generateId(),
      name,
      status: 'active',
      steps,
      currentStepIndex: 0,
      results: {},
      metadata: {
        userId: session.userId,
        sessionId: session.id,
        createdAt: new Date(),
      },
    };

    this.activeWorkflows.set(workflow.id, workflow);
    this.logger.log(`Created workflow ${workflow.id}: ${name}`);

    return workflow;
  }

  async executeWorkflow(
    workflow: MultiAgentWorkflow,
    session: UserSession,
  ): Promise<{ workflow: MultiAgentWorkflow; actions: ActionHistory[] }> {
    const actions: ActionHistory[] = [];

    try {
      workflow.status = 'active';

      for (let i = workflow.currentStepIndex; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        workflow.currentStepIndex = i;

        this.logger.log(
          `Executing step ${i + 1}/${workflow.steps.length}: ${step.name}`,
        );

        // Check dependencies
        if (step.dependencies?.length) {
          const missingDeps = this.checkDependencies(step, workflow.results);
          if (missingDeps.length > 0) {
            throw new Error(`Missing dependencies: ${missingDeps.join(', ')}`);
          }
        }

        // Execute step
        step.status = 'running';
        const stepResult = await this.executeStep(
          step,
          workflow.results,
          session,
        );

        // Record action
        const action: ActionHistory = {
          id: this.generateId(),
          agent: step.agent,
          action: step.capability,
          parameters: step.parameters,
          result: stepResult,
          timestamp: new Date(),
          success: true,
        };
        actions.push(action);

        // Update step and workflow
        step.status = 'completed';
        step.result = stepResult;
        workflow.results[step.id] = stepResult;

        this.logger.debug(`Step ${step.name} completed successfully`);
      }

      workflow.status = 'completed';
      this.logger.log(`Workflow ${workflow.id} completed successfully`);
    } catch (error) {
      workflow.status = 'failed';
      const currentStep = workflow.steps[workflow.currentStepIndex];
      if (currentStep) {
        currentStep.status = 'failed';
        currentStep.error = error.message;
      }

      // Record failed action
      const failedAction: ActionHistory = {
        id: this.generateId(),
        agent: currentStep?.agent || 'unknown',
        action: currentStep?.capability || 'unknown',
        parameters: currentStep?.parameters || {},
        result: null,
        timestamp: new Date(),
        success: false,
        error: error.message,
      };
      actions.push(failedAction);

      this.logger.error(`Workflow ${workflow.id} failed:`, error);
    }

    // Update stored workflow
    this.activeWorkflows.set(workflow.id, workflow);

    return { workflow, actions };
  }

  async pauseWorkflow(workflowId: string): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow) {
      workflow.status = 'paused';
      this.logger.log(`Workflow ${workflowId} paused`);
    }
  }

  async resumeWorkflow(
    workflowId: string,
    session: UserSession,
  ): Promise<{ workflow: MultiAgentWorkflow; actions: ActionHistory[] }> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (workflow.status !== 'paused') {
      throw new Error(`Workflow ${workflowId} is not paused`);
    }

    this.logger.log(`Resuming workflow ${workflowId}`);
    return await this.executeWorkflow(workflow, session);
  }

  private async executeStep(
    step: WorkflowStep,
    workflowResults: Record<string, any>,
    session: UserSession,
  ): Promise<any> {
    try {
      // Resolve parameters from workflow results
      const resolvedParameters = this.resolveParameters(
        step.parameters,
        workflowResults,
      );

      // Add session context to parameters
      const parametersWithContext = {
        ...resolvedParameters,
        userId: session.userId,
        sessionContext: session.context,
        userPreferences: session.preferences,
      };

      // Execute capability through multi-agent service
      const result = await this.multiAgentService.executeCapability(
        step.capability,
        parametersWithContext,
      );

      return result;
    } catch (error) {
      this.logger.error(`Step execution failed: ${step.name}`, error);
      throw error;
    }
  }

  private resolveParameters(
    parameters: Record<string, any>,
    workflowResults: Record<string, any>,
  ): Record<string, any> {
    const resolved = { ...parameters };

    // Replace parameter references with actual values from workflow results
    for (const [key, value] of Object.entries(resolved)) {
      if (
        typeof value === 'string' &&
        value.startsWith('${') &&
        value.endsWith('}')
      ) {
        const resultKey = value.slice(2, -1);
        if (workflowResults[resultKey] !== undefined) {
          resolved[key] = workflowResults[resultKey];
        }
      }
    }

    return resolved;
  }

  private checkDependencies(
    step: WorkflowStep,
    workflowResults: Record<string, any>,
  ): string[] {
    const missingDeps: string[] = [];

    step.dependencies?.forEach((dep) => {
      if (workflowResults[dep] === undefined) {
        missingDeps.push(dep);
      }
    });

    return missingDeps;
  }

  async createComplexWorkflow(
    userMessage: string,
    intent: string,
    session: UserSession,
  ): Promise<MultiAgentWorkflow> {
    // TODO: IMPLEMENT - AI-powered workflow generation
    // Analyze user message and intent to create appropriate workflow steps

    let steps: WorkflowStep[] = [];

    switch (intent) {
      case 'portfolio-analysis':
        steps = await this.createPortfolioAnalysisWorkflow(
          userMessage,
          session,
        );
        break;
      case 'token-research':
        steps = await this.createTokenResearchWorkflow(userMessage, session);
        break;
      case 'trading-strategy':
        steps = await this.createTradingStrategyWorkflow(userMessage, session);
        break;
      default:
        steps = await this.createGeneralWorkflow(userMessage, session);
        break;
    }

    return await this.createWorkflow(`${intent}-workflow`, steps, session);
  }

  private async createPortfolioAnalysisWorkflow(
    _userMessage: string,
    _session: UserSession,
  ): Promise<WorkflowStep[]> {
    // TODO: IMPLEMENT - Intelligent workflow generation
    return [
      {
        id: 'get-portfolio',
        name: 'Get Portfolio Data',
        agent: 'wallet-agent',
        capability: 'wallet_get_portfolio',
        parameters: {
          address: '${walletAddress}', // Will be resolved from user preferences
        },
        status: 'pending',
      },
      {
        id: 'analyze-portfolio',
        name: 'Analyze Portfolio Performance',
        agent: 'wallet-agent',
        capability: 'wallet_get_activity',
        parameters: {},
        dependencies: ['get-portfolio'],
        status: 'pending',
      },
      {
        id: 'generate-insights',
        name: 'Generate Portfolio Insights',
        agent: 'wallet-agent',
        capability: 'wallet_generate_insights',
        parameters: {
          portfolioData: '${get-portfolio}',
          activityData: '${analyze-portfolio}',
        },
        dependencies: ['get-portfolio', 'analyze-portfolio'],
        status: 'pending',
      },
    ];
  }

  private async createTokenResearchWorkflow(
    userMessage: string,
    _session: UserSession,
  ): Promise<WorkflowStep[]> {
    // Extract token from message
    const tokenMatch = userMessage.match(/\b[A-Z]{2,10}\b/);
    const token = tokenMatch ? tokenMatch[0] : 'KASPA';

    return [
      {
        id: 'get-token-info',
        name: 'Get Token Information',
        agent: 'token-registry-agent',
        capability: 'token_get_info',
        parameters: { ticker: token },
        status: 'pending',
      },
      {
        id: 'get-price-history',
        name: 'Get Price History',
        agent: 'token-registry-agent',
        capability: 'token_get_price_history',
        parameters: { ticker: token, timeframe: '7d' },
        status: 'pending',
      },
      {
        id: 'get-market-data',
        name: 'Get Market Data',
        agent: 'trading-agent',
        capability: 'trading_get_market_data',
        parameters: { ticker: token },
        status: 'pending',
      },
    ];
  }

  private async createTradingStrategyWorkflow(
    _userMessage: string,
    _session: UserSession,
  ): Promise<WorkflowStep[]> {
    return [
      {
        id: 'analyze-market',
        name: 'Analyze Market Conditions',
        agent: 'trading-agent',
        capability: 'trading_get_market_data',
        parameters: {},
        status: 'pending',
      },
      {
        id: 'get-portfolio',
        name: 'Get Current Portfolio',
        agent: 'wallet-agent',
        capability: 'wallet_get_portfolio',
        parameters: {
          address: '${walletAddress}',
        },
        status: 'pending',
      },
      {
        id: 'generate-strategy',
        name: 'Generate Trading Strategy',
        agent: 'trading-agent',
        capability: 'trading_generate_strategy',
        parameters: {
          marketData: '${analyze-market}',
          portfolio: '${get-portfolio}',
          riskProfile: '${userRiskProfile}',
        },
        dependencies: ['analyze-market', 'get-portfolio'],
        status: 'pending',
      },
    ];
  }

  private async createGeneralWorkflow(
    userMessage: string,
    session: UserSession,
  ): Promise<WorkflowStep[]> {
    // Simple single-step workflow for general queries
    return [
      {
        id: 'general-response',
        name: 'Generate General Response',
        agent: 'defi-agent',
        capability: 'defi_general_query',
        parameters: {
          query: userMessage,
          context: session.context,
        },
        status: 'pending',
      },
    ];
  }

  getWorkflow(workflowId: string): MultiAgentWorkflow | undefined {
    return this.activeWorkflows.get(workflowId);
  }

  deleteWorkflow(workflowId: string): void {
    this.activeWorkflows.delete(workflowId);
    this.logger.debug(`Workflow ${workflowId} deleted`);
  }

  private generateId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
} 