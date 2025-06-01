export interface OpenServAgentConfig {
  name: string;
  description: string;
  capabilities: OpenServCapability[];
  features: {
    memoryEnabled: boolean;
    contextAware: boolean;
    multiAgentCoordination: boolean;
    userStateManagement: boolean;
    crossSessionPersistence: boolean;
  };
  metadata: {
    version: string;
    category: string;
    priority: number;
    maxConcurrency: number;
  };
}

export interface OpenServCapability {
  name: string;
  description: string;
  parameters: {
    required: string[];
    optional: string[];
    schema: Record<string, any>;
  };
  examples: Array<{
    input: Record<string, any>;
    output: any;
    description: string;
  }>;
  features: {
    requiresWallet: boolean;
    requiresAuth: boolean;
    modifiesState: boolean;
    cacheable: boolean;
  };
}

export interface OpenServAdvancedConfig {
  memory: {
    maxContextLength: number;
    compressionThreshold: number;
    retentionPeriod: number;
    enableSemanticCompression: boolean;
  };
  orchestration: {
    maxConcurrentAgents: number;
    timeoutMs: number;
    retryAttempts: number;
    enableIntelligentRouting: boolean;
    enableWorkflowChaining: boolean;
    memoryManagement: {
      maxHistoryLength: number;
      contextCompression: boolean;
      sessionTimeout: number;
    };
  };
  performance: {
    enableCaching: boolean;
    cacheExpirationMs: number;
    enableParallelExecution: boolean;
    maxParallelTasks: number;
    caching: {
      enabled: boolean;
      ttl: number;
    };
  };
  security: {
    enableUserIsolation: boolean;
    enableRateLimiting: boolean;
    maxRequestsPerMinute: number;
    enableSensitiveDataHandling: boolean;
  };
}

export interface OpenServAction {
  type: 'do-task' | 'respond-chat-message';
  me?: { id: number; name: string };
  messages?: Array<{
    author: string;
    id: number;
    message: string;
    createdAt: string;
  }>;
  workspace?: {
    id: number;
    goal: string;
  };
  task?: {
    id: number;
    description: string;
    parameters?: Record<string, any>;
  };
}

export interface CapabilityRequest {
  capability: string;
  parameters: Record<string, any>;
  userId?: string;
  context?: Record<string, any>;
}

export interface AgentCapability {
  name: string;
  description: string;
  agent: string;
  schema: Record<string, any>;
}

export interface RoutingDecision {
  primaryAgent: string;
  capability: string;
  confidence: number;
  reasoning: string;
  fallbackAgents?: string[];
  parameters?: Record<string, any>;
}

export interface UserSession {
  id: string;
  userId: string;
  sessionId: string;
  context: ConversationContext;
  preferences: UserPreferences;
  state: UserState;
  createdAt: Date;
  lastActivity: Date;
  metadata: Record<string, any>;
  orchestrationFlows: OrchestrationFlow[];
}

export interface ConversationContext {
  messages: ContextMessage[];
  activeWorkflow?: MultiAgentWorkflow;
  userIntent?: string;
  currentFocus?: string;
  currentIntent?: string;
  userState?: Record<string, any>;
  recentActions?: ActionHistory[];
  metadata?: Record<string, any>;
}

export interface ContextMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface UserPreferences {
  preferredAgents?: string[];
  defaultParameters?: Record<string, any>;
  communicationStyle?: 'concise' | 'detailed' | 'casual' | 'professional';
  autoExecute?: boolean;
  confirmationRequired?: boolean;
  preferredNetwork?: string;
  defaultSlippage?: number;
  walletAddresses?: Record<string, string>;
  riskTolerance?: string;
  tradingStyle?: string;
  notifications?: {
    priceAlerts?: boolean;
    tradeExecutions?: boolean;
    marketUpdates?: boolean;
  };
}

export interface UserState {
  walletAddresses?: Record<string, string>;
  activeTokens?: string[];
  recentActivities?: string[];
  tradingPreferences?: Record<string, any>;
  riskProfile?: 'conservative' | 'moderate' | 'aggressive';
}

export interface ActionHistory {
  id: string;
  agent: string;
  action: string;
  parameters: Record<string, any>;
  result: any;
  timestamp: Date;
  success: boolean;
  error?: string;
}

export interface MultiAgentWorkflow {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'failed' | 'paused';
  steps: WorkflowStep[];
  currentStepIndex: number;
  currentStep?: number;
  results: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  agent: string;
  capability: string;
  parameters: Record<string, any>;
  dependencies?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface CapabilityExecution {
  agent: string;
  capability: string;
  parameters: Record<string, any>;
  priority?: number;
  dependencies?: string[];
}

export interface OpenServResponse {
  response: string;
  actions: ActionHistory[];
  suggestions?: string[];
  workflowStatus?: MultiAgentWorkflow;
}

// Task and Chat response types for OpenServ integration
export interface OpenServTaskResponse {
  type: 'task';
  workspaceId: number;
  taskId: number;
}

export interface OpenServChatResponse {
  type: 'chat';
  workspaceId: number;
  agentId: number;
}

export type OpenServIntegrationResponse =
  | OpenServTaskResponse
  | OpenServChatResponse;

export interface OrchestrationFlow {
  id: string;
  userId: string;
  originalInput: string;
  timestamp: Date;

  // Stage 1: Decision
  decisionStage: {
    status: 'pending' | 'completed' | 'failed';
    agentDecisions: AgentDecision[];
    reasoning: string;
    error?: string;
  };

  // Stage 2: Execution
  executionStage: {
    status: 'pending' | 'completed' | 'failed';
    agentResponses: AgentResponse[];
    errors: string[];
  };

  // Stage 3: Synthesis
  synthesisStage: {
    status: 'pending' | 'completed' | 'failed';
    finalResponse: string;
    reasoning: string;
    error?: string;
  };

  // Overall flow status
  overallStatus: 'pending' | 'completed' | 'failed';
  completedAt?: Date;
}

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

export interface AgentCapabilityInfo {
  agent: string;
  capabilities: CapabilityDetail[];
}

export interface CapabilityDetail {
  name: string;
  description: string;
  parameters: ParameterSchema[];
  examples: string[];
  isInternal?: boolean;
}

export interface ParameterSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: any;
}

export interface AgentMetadata {
  name: string;
  description: string;
  version?: string;
  category?: string;
}

export interface IAgent {
  getMetadata(): AgentMetadata;
  getCapabilities(): CapabilityDetail[];
  isInternalOnly?: boolean;
}
