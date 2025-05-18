export interface Message {
  id: string;
  chatId: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface InputEvent {
  chatId: string;
  content: string;
  userId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface OutputResponse {
  chatId: string;
  content: string;
  metadata?: Record<string, any>;
} 