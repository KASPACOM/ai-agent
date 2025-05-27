import { Injectable } from '@nestjs/common';
import { Message } from '../models/message.model';

export interface AgentMemory {
  getOrCreateSession(chatId: string): Promise<AgentSession>;
  updateSession(session: AgentSession): Promise<void>;
  getFullHistory(chatId: string): Promise<Message[]>;
}

export interface AgentSession {
  chatId: string;
  messages: Message[];
  context: Record<string, any>;
  addMessage(message: Message): void;
  updateContext(key: string, value: any): void;
}

class AgentSessionImpl implements AgentSession {
  constructor(
    public readonly chatId: string,
    public messages: Message[] = [],
    public context: Record<string, any> = {},
  ) {}

  addMessage(message: Message): void {
    this.messages.push(message);

    // Keep only last 20 messages to prevent context overflow
    if (this.messages.length > 20) {
      this.messages = this.messages.slice(this.messages.length - 20);
    }
  }

  updateContext(key: string, value: any): void {
    this.context[key] = value;
  }
}

@Injectable()
export class InMemoryAgentMemory implements AgentMemory {
  private sessions: Map<string, AgentSession> = new Map();

  async getOrCreateSession(chatId: string): Promise<AgentSession> {
    if (!this.sessions.has(chatId)) {
      this.sessions.set(chatId, new AgentSessionImpl(chatId));
    }
    return this.sessions.get(chatId)!;
  }

  async updateSession(session: AgentSession): Promise<void> {
    this.sessions.set(session.chatId, session);
  }

  async getFullHistory(chatId: string): Promise<Message[]> {
    const session = await this.getOrCreateSession(chatId);
    return [...session.messages];
  }
}
