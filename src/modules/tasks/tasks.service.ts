import { AgentSession } from '../orchestrator/agent/memory.implementation';

interface Task {
  name: string;
  description: string;
  requiredParameters: string[];
  optionalParameters: string[];
  run(params: Record<string, any>, context: AgentSession): Promise<TaskResult>;
}

interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
}
