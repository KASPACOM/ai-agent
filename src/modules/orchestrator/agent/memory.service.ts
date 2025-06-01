import { Message } from '../models/message.model';

interface AgentMemory {
  getOrCreateSession(chatId: string): Promise<AgentSession>;
  updateSession(session: AgentSession): Promise<void>;
  getFullHistory(chatId: string): Promise<Message[]>;
}

interface AgentSession {
  chatId: string;
  messages: Message[];
  context: Record<string, any>;
  addMessage(message: Message): void;
  updateContext(key: string, value: any): void;
}
