/**
 * Core Agent Models
 *
 * These models define the structure for multi-agent system
 * independent of any specific integration platform.
 */

export interface AgentMetadata {
  name: string;
  description: string;
  version?: string;
  category?: string;
}

export interface ParameterSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: any;
}

export interface CapabilityDetail {
  name: string;
  description: string;
  parameters: ParameterSchema[];
  examples: string[];
  isInternal?: boolean;
}

export interface AgentCapabilityInfo {
  agent: string;
  capabilities: CapabilityDetail[];
}

export interface IAgent {
  getMetadata(): AgentMetadata;
  getCapabilities(): CapabilityDetail[];
  isInternalOnly?: boolean;
}

export interface AgentCapabilityConfig {
  name: string;
  description: string;
  parameters: ParameterSchema[];
  examples: string[];
  handler: CapabilityHandler;
  isInternal?: boolean;
}

export interface CapabilityHandler {
  (args: Record<string, any>): Promise<any>;
}

export interface BuiltAgent {
  metadata: AgentMetadata;
  capabilities: CapabilityDetail[];
  executeCapability: (name: string, args: any) => Promise<any>;
  getHealthStatus: () => any;
  getPerformanceMetrics: () => any;
  isInternalOnly?: boolean;
}

// Execution & Response Models
export interface AgentDecision {
  agent: string;
  capability: string;
  prompt: string;
  parameters: Record<string, any>;
  priority: number;
}

export interface AgentResponse {
  agent: string;
  capability: string;
  response: any;
  success: boolean;
  error?: string;
  executionTime: number;
}

export interface CapabilityRequest {
  capability: string;
  parameters: Record<string, any>;
  userId?: string;
  context?: Record<string, any>;
}

export interface RoutingDecision {
  primaryAgent: string;
  capability: string;
  confidence: number;
  reasoning: string;
  fallbackAgents?: string[];
  parameters?: Record<string, any>;
}
