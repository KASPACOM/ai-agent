// Simple session interface for task context
interface TaskContext {
  userId: string;
  sessionId: string;
  [key: string]: any;
}

export interface Task {
  name: string;
  description: string;
  requiredParameters: string[];
  optionalParameters: string[];
  run(params: Record<string, any>, context: TaskContext): Promise<TaskResult>;
}

export interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
}
