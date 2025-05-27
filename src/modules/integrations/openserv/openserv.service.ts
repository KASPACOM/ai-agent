import { Injectable } from '@nestjs/common';
import { Agent } from '../../orchestrator/agent/agent.service';
import { InputEvent } from '../../orchestrator/models/message.model';
import axios from 'axios';

interface OpenServAction {
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

@Injectable()
export class OpenServService {
  private readonly apiClient = axios.create({
    baseURL: 'https://api.openserv.ai',
    headers: {
      'Authorization': `Bearer ${process.env.OPENSERV_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  constructor(private readonly agent: Agent) {}

  async handleTask(action: OpenServAction): Promise<void> {
    try {
      const { task, workspace } = action;
      if (!task || !workspace) {
        throw new Error('Missing task or workspace information');
      }

      // Convert OpenServ task to your existing InputEvent format
      const inputEvent: InputEvent = {
        chatId: `openserv-${workspace.id}`,
        content: task.description,
        userId: `openserv-user-${workspace.id}`,
        timestamp: new Date(),
        metadata: {
          source: 'openserv',
          taskId: task.id,
          workspaceId: workspace.id,
          parameters: task.parameters,
        },
      };

      // Use your existing agent to process the task
      await this.agent.processInput(inputEvent);

      // Report task completion to OpenServ
      await this.completeTask(workspace.id, task.id, 'Task completed successfully');
    } catch (error) {
      console.error('Error handling OpenServ task:', error);
      if (action.task && action.workspace) {
        await this.reportTaskError(
          action.workspace.id,
          action.task.id,
          error.message,
        );
      }
    }
  }

  async handleChatMessage(action: OpenServAction): Promise<void> {
    try {
      const { messages, workspace, me } = action;
      if (!messages?.length || !workspace || !me) {
        throw new Error('Missing required chat message information');
      }

      const latestMessage = messages[messages.length - 1];

      // Convert to your existing InputEvent format
      const inputEvent: InputEvent = {
        chatId: `openserv-chat-${workspace.id}`,
        content: latestMessage.message,
        userId: `openserv-user-${latestMessage.author}`,
        timestamp: new Date(latestMessage.createdAt),
        metadata: {
          source: 'openserv-chat',
          workspaceId: workspace.id,
          agentId: me.id,
          messageId: latestMessage.id,
        },
      };

      // Process through your existing agent
      await this.agent.processInput(inputEvent);

      // Note: Your agent's response will be sent via the existing publisher
      // We'll need to modify the publisher to also send to OpenServ API
    } catch (error) {
      console.error('Error handling OpenServ chat message:', error);
    }
  }

  private async completeTask(
    workspaceId: number,
    taskId: number,
    output: string,
  ): Promise<void> {
    try {
      await this.apiClient.put(
        `/workspaces/${workspaceId}/tasks/${taskId}/complete`,
        { output },
      );
    } catch (error) {
      console.error('Error completing task in OpenServ:', error);
    }
  }

  private async reportTaskError(
    workspaceId: number,
    taskId: number,
    error: string,
  ): Promise<void> {
    try {
      await this.apiClient.post(
        `/workspaces/${workspaceId}/tasks/${taskId}/error`,
        { error },
      );
    } catch (error) {
      console.error('Error reporting task error to OpenServ:', error);
    }
  }

  async sendChatMessage(
    workspaceId: number,
    agentId: number,
    message: string,
  ): Promise<void> {
    try {
      await this.apiClient.post(
        `/workspaces/${workspaceId}/agent-chat/${agentId}/message`,
        { message },
      );
    } catch (error) {
      console.error('Error sending chat message to OpenServ:', error);
    }
  }

  async uploadFile(
    workspaceId: number,
    taskId: number,
    content: string,
    filename: string,
  ): Promise<void> {
    try {
      const FormData = require('form-data');
      const form = new FormData();
      
      form.append('file', Buffer.from(content, 'utf-8'), {
        filename,
        contentType: 'text/plain',
      });
      form.append('path', filename);
      form.append('taskIds', taskId.toString());
      form.append('skipSummarizer', 'true');

      await this.apiClient.post(`/workspaces/${workspaceId}/file`, form, {
        headers: form.getHeaders(),
      });
    } catch (error) {
      console.error('Error uploading file to OpenServ:', error);
    }
  }
} 