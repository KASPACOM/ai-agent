import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { InputEvent } from '../../orchestrator/models/message.model';
import { OpenServAction } from './models/openserv.model';

@Injectable()
export class OpenServSubscriberService {
  private messageSubject = new Subject<InputEvent>();

  getMessages(): Observable<InputEvent> {
    return this.messageSubject.asObservable();
  }

  handleOpenServAction(action: OpenServAction): void {
    try {
      let inputEvent: InputEvent;

      switch (action.type) {
        case 'do-task':
          inputEvent = this.convertTaskToInputEvent(action);
          break;
        case 'respond-chat-message':
          inputEvent = this.convertChatToInputEvent(action);
          break;
        default:
          console.warn('Unknown OpenServ action type:', action.type);
          return;
      }

      // Emit the input event for the agent to process
      this.messageSubject.next(inputEvent);
    } catch (error) {
      console.error('Error handling OpenServ action:', error);
    }
  }

  private convertTaskToInputEvent(action: OpenServAction): InputEvent {
    const { task, workspace } = action;
    if (!task || !workspace) {
      throw new Error('Missing task or workspace information');
    }

    return {
      chatId: `openserv-task-${workspace.id}`,
      content: task.description,
      userId: `openserv-user-${workspace.id}`,
      timestamp: new Date(),
      metadata: {
        source: 'openserv',
        type: 'task',
        taskId: task.id,
        workspaceId: workspace.id,
        parameters: task.parameters,
        goal: workspace.goal,
      },
    };
  }

  private convertChatToInputEvent(action: OpenServAction): InputEvent {
    const { messages, workspace, me } = action;
    if (!messages?.length || !workspace || !me) {
      throw new Error('Missing required chat message information');
    }

    const latestMessage = messages[messages.length - 1];

    return {
      chatId: `openserv-chat-${workspace.id}`,
      content: latestMessage.message,
      userId: `openserv-user-${latestMessage.author}`,
      timestamp: new Date(latestMessage.createdAt),
      metadata: {
        source: 'openserv',
        type: 'chat',
        workspaceId: workspace.id,
        agentId: me.id,
        messageId: latestMessage.id,
        goal: workspace.goal,
      },
    };
  }
}
