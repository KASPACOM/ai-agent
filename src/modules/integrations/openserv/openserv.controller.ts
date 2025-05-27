import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { OpenServService } from './openserv.service';

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

@Controller()
export class OpenServController {
  constructor(private readonly openServService: OpenServService) {}

  @Post('/')
  async handleOpenServAction(
    @Body() action: OpenServAction,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // Immediately acknowledge receipt
      res.status(HttpStatus.OK).json({ message: 'OK' });

      // Process action asynchronously
      switch (action.type) {
        case 'do-task':
          await this.openServService.handleTask(action);
          break;
        case 'respond-chat-message':
          await this.openServService.handleChatMessage(action);
          break;
        default:
          console.warn('Unknown action type:', action.type);
      }
    } catch (error) {
      console.error('Error handling OpenServ action:', error);
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Internal server error',
        });
      }
    }
  }
} 