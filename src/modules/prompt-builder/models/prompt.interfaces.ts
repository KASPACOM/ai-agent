// Import types from multiagent models
import type {
  AgentCapabilityInfo,
  CapabilityDetail,
  ParameterSchema,
  AgentResponse,
  AgentDecision,
} from '../../multiagent/models/agent.model';

import { UserSession } from '../../integrations/openserv/models/openserv.model';

export interface PromptTemplate {
  name: string;
  template: string;
  variables: string[];
  description?: string;
}

export interface PromptContext {
  [key: string]: any;
}

export interface BuiltPrompt {
  prompt: string;
  variables: Record<string, any>;
  templateName: string;
}

// Orchestrator Prompt Types
export interface DecisionPromptContext extends PromptContext {
  userInput: string;
  agentCapabilities: AgentCapabilityInfo[];
  session: UserSession;
}

export interface SynthesisPromptContext extends PromptContext {
  originalInput: string;
  agentResponses: AgentResponse[];
  session: UserSession;
}

// Re-export types for convenience
export type {
  CapabilityDetail,
  ParameterSchema,
  UserSession,
  AgentResponse,
  AgentDecision,
};
