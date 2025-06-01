import { AgentSession } from '../orchestrator/agent/memory.implementation';

export interface Task {
  name: string;
  description: string;
  requiredParameters: string[];
  optionalParameters: string[];
  run(params: Record<string, any>, context: AgentSession): Promise<TaskResult>;
}

export interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
}
