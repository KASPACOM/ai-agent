export interface TaskDefinition {
  name: string;
  description: string;
  requiredParameters: string[];
  optionalParameters: string[];
}

export interface TaskPlan {
  tasks: string[];
  reasoning: string;
}

export interface ParameterExtraction {
  parameters: Record<string, any>;
}

export interface TaskResult {
  result?: any;
  error?: string;
}

export interface TaskResults {
  [taskName: string]: TaskResult;
}

export interface PlannerPrompt {
  system: string;
  schema: {
    type: 'object';
    properties: {
      tasks: {
        type: 'array';
        items: { type: 'string' };
        description: string;
      };
      reasoning: {
        type: 'string';
        description: string;
      };
    };
    required: ['tasks', 'reasoning'];
  };
}

export interface GathererPrompt {
  system: string;
  schema: {
    type: 'object';
    properties: {
      parameters: {
        type: 'object';
        additionalProperties: true;
        description: string;
      };
    };
    required: ['parameters'];
  };
}

export interface ResponderPrompt {
  system: string;
  guidelines: string[];
} 