import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { OutputResponse } from '../../orchestrator/models/message.model';
import { OpenServIntegrationResponse } from './models/openserv.model';

@Injectable()
export class OpenServPublisherService {
  private readonly logger = new Logger(OpenServPublisherService.name);

  private readonly apiClient = axios.create({
    baseURL: 'https://api.openserv.ai',
    headers: {
      Authorization: `Bearer ${process.env.OPENSERV_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  async sendMessage(chatId: string, message: string): Promise<void> {
    try {
      // Extract metadata from chatId to determine response type
      const metadata = this.parseChatId(chatId);

      if (!metadata) {
        console.warn(
          'Cannot send OpenServ message: invalid chatId format',
          chatId,
        );
        return;
      }

      switch (metadata.type) {
        case 'task':
          await this.completeTask(
            metadata.workspaceId,
            metadata.taskId,
            message,
          );
          break;
        case 'chat':
          await this.sendChatMessage(
            metadata.workspaceId,
            metadata.agentId,
            message,
          );
          break;
        default:
          console.warn('Unknown OpenServ message type:', metadata.type);
      }
    } catch (error) {
      console.error('Error sending OpenServ message:', error);
    }
  }

  private parseChatId(chatId: string): {
    type: string;
    workspaceId: number;
    taskId?: number;
    agentId?: number;
  } | null {
    // Parse chatId formats:
    // "openserv-task-{workspaceId}" -> extract workspaceId for task completion
    // "openserv-chat-{workspaceId}" -> extract workspaceId for chat message

    if (chatId.startsWith('openserv-task-')) {
      const workspaceId = parseInt(chatId.replace('openserv-task-', ''));
      return { type: 'task', workspaceId, taskId: 0 }; // taskId will be from metadata
    }

    if (chatId.startsWith('openserv-chat-')) {
      const workspaceId = parseInt(chatId.replace('openserv-chat-', ''));
      return { type: 'chat', workspaceId, agentId: 0 }; // agentId will be from metadata
    }

    return null;
  }

  private async completeTask(
    workspaceId: number,
    taskId: number,
    output: string,
  ): Promise<void> {
    try {
      await this.apiClient.put(
        `/workspaces/${workspaceId}/tasks/${taskId}/complete`,
        {
          output,
        },
      );
    } catch (error) {
      console.error('Error completing OpenServ task:', error);
    }
  }

  private async sendChatMessage(
    workspaceId: number,
    agentId: number,
    message: string,
  ): Promise<void> {
    try {
      await this.apiClient.post(
        `/workspaces/${workspaceId}/agent-chat/${agentId}/message`,
        {
          message,
        },
      );
    } catch (error) {
      console.error('Error sending OpenServ chat message:', error);
    }
  }

  async reportTaskError(
    workspaceId: number,
    taskId: number,
    error: string,
  ): Promise<void> {
    try {
      await this.apiClient.post(
        `/workspaces/${workspaceId}/tasks/${taskId}/error`,
        {
          error,
        },
      );
    } catch (error) {
      console.error('Error reporting task error to OpenServ:', error);
    }
  }

  async uploadFile(
    workspaceId: number,
    taskId: number,
    content: string,
    filename: string,
  ): Promise<void> {
    try {
      const form = new FormData();
      form.append('file', new Blob([Buffer.from(content, 'utf-8')]), filename);
      form.append('path', filename);
      form.append('taskIds', taskId.toString());
      form.append('skipSummarizer', 'true');

      await this.apiClient.post(`/workspaces/${workspaceId}/file`, form);
    } catch (error) {
      console.error('Error uploading file to OpenServ:', error);
    }
  }

  async publishResponse(
    response: OutputResponse,
  ): Promise<OpenServIntegrationResponse> {
    try {
      this.logger.log(
        `Publishing response to OpenServ for chat ${response.chatId}`,
      );

      // TODO: IMPLEMENT - Real OpenServ API integration
      // Required components:
      // 1. OpenServ REST API client integration
      // 2. Proper response formatting for OpenServ
      // 3. Error handling and retry logic
      // 4. Response validation and confirmation
      throw new Error(
        'OpenServ publishing not implemented - requires OpenServ API integration',
      );

      // Template implementation structure (commented out):
      /*
      const openServResponse = await this.sendToOpenServ({
        type: 'response',
        content: response.content,
        chatId: response.chatId,
        metadata: response.metadata,
      });
      
      return openServResponse;
      */
    } catch (error) {
      this.logger.error('Error publishing response to OpenServ:', error);
      throw error;
    }
  }

  async publishTask(
    workspaceId: number,
    taskDescription: string,
    parameters?: Record<string, any>,
  ): Promise<OpenServIntegrationResponse> {
    try {
      this.logger.log(`Publishing task to OpenServ workspace ${workspaceId}`);

      // TODO: IMPLEMENT - OpenServ task creation API
      // Required components:
      // 1. Task creation endpoint integration
      // 2. Parameter validation and formatting
      // 3. Workspace context management
      // 4. Task status tracking
      throw new Error(
        'OpenServ task publishing not implemented - requires OpenServ task API',
      );

      // Template implementation structure (commented out):
      /*
      const taskResponse = await this.createOpenServTask({
        workspaceId,
        description: taskDescription,
        parameters,
      });
      
      return {
        type: 'task',
        workspaceId,
        taskId: taskResponse.id,
      };
      */
    } catch (error) {
      this.logger.error('Error publishing task to OpenServ:', error);
      throw error;
    }
  }

  async publishChatMessage(
    workspaceId: number,
    message: string,
    agentId?: number,
  ): Promise<OpenServIntegrationResponse> {
    try {
      this.logger.log(
        `Publishing chat message to OpenServ workspace ${workspaceId}`,
      );

      // TODO: IMPLEMENT - OpenServ chat message API
      // Required components:
      // 1. Chat message endpoint integration
      // 2. Agent identification and validation
      // 3. Message threading and context
      // 4. Real-time message delivery
      throw new Error(
        'OpenServ chat publishing not implemented - requires OpenServ chat API',
      );

      // Template implementation structure (commented out):
      /*
      const chatResponse = await this.sendChatMessage({
        workspaceId,
        message,
        agentId: agentId || this.defaultAgentId,
      });
      
      return {
        type: 'chat',
        workspaceId,
        agentId: chatResponse.agentId,
      };
      */
    } catch (error) {
      this.logger.error('Error publishing chat message to OpenServ:', error);
      throw error;
    }
  }

  // Utility method for checking OpenServ connectivity
  async checkOpenServConnection(): Promise<boolean> {
    try {
      // TODO: IMPLEMENT - OpenServ health check
      // Required components:
      // 1. Health check endpoint
      // 2. Authentication validation
      // 3. Service availability check
      // 4. Connection timeout handling
      this.logger.warn('OpenServ connection check not implemented');
      return false;
    } catch (error) {
      this.logger.error('Error checking OpenServ connection:', error);
      return false;
    }
  }

  // Utility method for retrying failed operations
  async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        this.logger.warn(
          `Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('Max retries reached');
  }
}
