import { Controller, Post, Body, Res, HttpStatus, Get } from '@nestjs/common';
import { Response } from 'express';
import { OpenServSubscriberService } from './subscriber.service';
import { OpenServPublisherService } from './publisher.service';
import { MultiAgentService } from '../../orchestrator/multi-agent.service';
import { AdvancedOrchestratorService } from '../../orchestrator/advanced-orchestrator.service';

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

interface CapabilityRequest {
  capability: string;
  args: any;
}

@Controller()
export class OpenServController {
  constructor(
    private readonly openServSubscriber: OpenServSubscriberService,
    private readonly multiAgent: MultiAgentService,
  ) {}

  @Post('/')
  async handleOpenServAction(
    @Body() action: OpenServAction,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // Immediately acknowledge receipt
      res.status(HttpStatus.OK).json({ message: 'OK' });

      // Delegate to subscriber service (which will emit to agent)
      this.openServSubscriber.handleOpenServAction(action);
    } catch (error) {
      console.error('Error handling OpenServ action:', error);
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Internal server error',
        });
      }
    }
  }

  // New endpoint for direct capability execution
  @Post('/capability')
  async executeCapability(
    @Body() request: CapabilityRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const result = await this.multiAgent.executeCapability(
        request.capability,
        request.args,
      );
      res.status(HttpStatus.OK).json(result);
    } catch (error) {
      console.error('Error executing capability:', error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Get all available capabilities
  @Get('/capabilities')
  async getCapabilities(@Res() res: Response): Promise<void> {
    try {
      const capabilities = this.multiAgent.getAllCapabilities();
      res.status(HttpStatus.OK).json({
        success: true,
        data: capabilities,
        total: capabilities.length,
      });
    } catch (error) {
      console.error('Error getting capabilities:', error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Get agent configurations for OpenServ registration
  @Get('/agents')
  async getAgentConfigurations(@Res() res: Response): Promise<void> {
    try {
      const configs = this.multiAgent.getAgentConfigurations();
      res.status(HttpStatus.OK).json({
        success: true,
        data: configs,
      });
    } catch (error) {
      console.error('Error getting agent configurations:', error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Get agent status and health
  @Get('/status')
  async getAgentStatus(@Res() res: Response): Promise<void> {
    try {
      const status = this.multiAgent.getAgentStatus();
      res.status(HttpStatus.OK).json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error('Error getting agent status:', error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Smart routing endpoint
  @Post('/smart-route')
  async smartRoute(
    @Body() request: { message: string; context?: any },
    @Res() res: Response,
  ): Promise<void> {
    try {
      const result = await this.multiAgent.smartRoute(request.message);
      res.status(HttpStatus.OK).json(result);
    } catch (error) {
      console.error('Error in smart routing:', error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: error.message,
      });
    }
  }
}
