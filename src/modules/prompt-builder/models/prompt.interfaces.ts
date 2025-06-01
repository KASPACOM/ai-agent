// Import types from openserv models
import type {
  AgentCapabilityInfo,
  CapabilityDetail,
  ParameterSchema,
  UserSession,
  AgentResponse,
  AgentDecision,
} from '../../integrations/openserv/models/openserv.model';

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

export interface RoutingPromptContext extends PromptContext {
  message: string;
  context?: {
    conversationHistory?: string[];
    userPreferences?: Record<string, any>;
    recentActions?: string[];
  };
}

// Re-export types for convenience
export type {
  AgentCapabilityInfo,
  CapabilityDetail,
  ParameterSchema,
  UserSession,
  AgentResponse,
  AgentDecision,
};
