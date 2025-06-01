import { Injectable, Logger } from '@nestjs/common';
import {
  PromptTemplate,
  PromptContext,
  BuiltPrompt,
  DecisionPromptContext,
  SynthesisPromptContext,
  RoutingPromptContext,
} from './models/prompt.interfaces';

// Import prompt templates
import { DECISION_AGENT_PROMPT } from './prompts/orchestrator/decision-agent.prompt';
import { SYNTHESIS_AGENT_PROMPT } from './prompts/orchestrator/synthesis-agent.prompt';
import { ROUTING_AGENT_PROMPT } from './prompts/openserv/routing-agent.prompt';

@Injectable()
export class PromptBuilderService {
  private readonly logger = new Logger(PromptBuilderService.name);
  private readonly templates = new Map<string, PromptTemplate>();

  constructor() {
    this.loadTemplates();
  }

  private loadTemplates(): void {
    // Register all prompt templates
    const templates = [
      DECISION_AGENT_PROMPT,
      SYNTHESIS_AGENT_PROMPT,
      ROUTING_AGENT_PROMPT,
    ];

    templates.forEach((template) => {
      this.templates.set(template.name, template);
      this.logger.debug(`Loaded prompt template: ${template.name}`);
    });

    this.logger.log(`Loaded ${templates.length} prompt templates`);
  }

  /**
   * Build a prompt from template with context substitution
   */
  buildPrompt(templateName: string, context: PromptContext): BuiltPrompt {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Prompt template '${templateName}' not found`);
    }

    // Substitute variables in template
    let prompt = template.template;
    const usedVariables: Record<string, any> = {};

    template.variables.forEach((variable) => {
      const value = context[variable];
      if (value !== undefined) {
        const placeholder = `{{${variable}}}`;
        prompt = prompt.replace(new RegExp(placeholder, 'g'), String(value));
        usedVariables[variable] = value;
      } else {
        this.logger.warn(
          `Missing variable '${variable}' for template '${templateName}'`,
        );
      }
    });

    return {
      prompt,
      variables: usedVariables,
      templateName,
    };
  }

  /**
   * Build decision agent prompt for orchestrator
   */
  buildDecisionPrompt(context: DecisionPromptContext): BuiltPrompt {
    const capabilitiesText = context.agentCapabilities
      .map((agent) => {
        const caps = agent.capabilities
          .map((cap) => `  - ${cap.name}: ${cap.description}`)
          .join('\n');
        return `${agent.agent}:\n${caps}`;
      })
      .join('\n\n');

    const recentHistory = context.session.orchestrationFlows
      .slice(-3)
      .map(
        (flow) =>
          `User: ${flow.originalInput} -> Response: ${flow.synthesisStage.finalResponse}`,
      )
      .join('\n');

    return this.buildPrompt('decision-agent', {
      userInput: context.userInput,
      capabilitiesText,
      recentHistory,
    });
  }

  /**
   * Build synthesis agent prompt for orchestrator
   */
  buildSynthesisPrompt(context: SynthesisPromptContext): BuiltPrompt {
    const responsesText = context.agentResponses
      .map(
        (resp) =>
          `${resp.agent} (${resp.capability}): ${
            resp.success
              ? JSON.stringify(resp.response)
              : 'ERROR: ' + resp.error
          }`,
      )
      .join('\n\n');

    return this.buildPrompt('synthesis-agent', {
      originalInput: context.originalInput,
      responsesText,
    });
  }

  /**
   * Build routing agent prompt for openserv
   */
  buildRoutingPrompt(context: RoutingPromptContext): BuiltPrompt {
    const conversationHistory =
      context.context?.conversationHistory?.join('\n') || 'None';
    const userPreferences = JSON.stringify(
      context.context?.userPreferences || {},
    );
    const recentActions = context.context?.recentActions?.join('\n') || 'None';

    return this.buildPrompt('routing-agent', {
      message: context.message,
      capabilitiesText: 'To be populated by caller',
      conversationHistory,
      userPreferences,
      recentActions,
    });
  }

  /**
   * Get available template names
   */
  getAvailableTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get template details
   */
  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }
}
