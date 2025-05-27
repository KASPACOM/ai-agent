import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AgentSession, InMemoryAgentMemory } from './memory.implementation';
import { InputEvent, Message, OutputResponse } from '../models/message.model';
import { Task } from '../../tasks/task.interface';
import { OpenAiAdapter } from '../llms/openai.service';
import { TelegramPublisherService } from '../../integrations/telegram/publisher.service';
import { TelegramSubscriberService } from '../../integrations/telegram/subscriber.service';
import { Subscription } from 'rxjs';
import { PromptService } from '../services/prompt.service';
import { TaskPlan, TaskResults } from '../models/prompt.models';

interface ParamGatheringResult {
  params: Record<string, any>;
  missingRequired: boolean;
  missing: string[];
}

@Injectable()
export class Agent implements OnModuleInit, OnModuleDestroy {
  private tasks: Map<string, Task> = new Map();
  private messageSubscription: Subscription;

  constructor(
    private readonly memory: InMemoryAgentMemory,
    private readonly llm: OpenAiAdapter,
    private readonly publisher: TelegramPublisherService,
    private readonly telegramSubscriber: TelegramSubscriberService,
    private readonly promptService: PromptService,
  ) {}

  onModuleInit() {
    // Subscribe to messages from Telegram
    this.messageSubscription = this.telegramSubscriber
      .getMessages()
      .subscribe(async (input) => {
        try {
          await this.processInput(input);
        } catch (error) {
          console.error('Error processing input:', error);
          await this.publisher.sendMessage(
            input.chatId,
            'Sorry, there was an error processing your request.',
          );
        }
      });
  }

  onModuleDestroy() {
    if (this.messageSubscription) {
      this.messageSubscription.unsubscribe();
    }
  }

  registerTask(task: Task): void {
    this.tasks.set(task.name, task);
  }

  async processInput(input: InputEvent): Promise<void> {
    try {
      const session = await this.memory.getOrCreateSession(input.chatId);

      // Add user message to memory
      const userMessage: Message = {
        id: uuidv4(),
        chatId: input.chatId,
        content: input.content,
        role: 'user',
        timestamp: input.timestamp || new Date(),
        metadata: input.metadata,
      };

      session.addMessage(userMessage);

      // Step 1: Planning phase
      const plan = await this.planTasks(input, session);

      // Step 2: Parameter gathering
      const params = await this.gatherParameters(plan, input, session);
      if (params.missingRequired) {
        const response = this.createParameterRequest(params.missing);

        // Add assistant message to memory
        const assistantMessage: Message = {
          id: uuidv4(),
          chatId: input.chatId,
          content: response.content,
          role: 'assistant',
          timestamp: new Date(),
        };

        session.addMessage(assistantMessage);
        await this.memory.updateSession(session);

        // Send response
        await this.publisher.sendMessage(input.chatId, response.content);
        return;
      }

      // Step 3: Execution phase
      const results = await this.executeTasks(
        plan.tasks,
        params.params,
        session,
      );

      // Step 4: Response generation
      const response = await this.generateResponse(input, results, session);

      // Add assistant message to memory
      const assistantMessage: Message = {
        id: uuidv4(),
        chatId: input.chatId,
        content: response.content,
        role: 'assistant',
        timestamp: new Date(),
      };

      session.addMessage(assistantMessage);

      // Update session memory
      await this.memory.updateSession(session);

      // Send response
      await this.publisher.sendMessage(input.chatId, response.content);
    } catch (error) {
      console.error('Error processing input:', error);
      await this.publisher.sendMessage(
        input.chatId,
        'Sorry, there was an error processing your request.',
      );
    }
  }

  private async planTasks(
    input: InputEvent,
    session: AgentSession,
  ): Promise<TaskPlan> {
    const availableTasks = Array.from(this.tasks.values()).map((task) => ({
      name: task.name,
      description: task.description,
      requiredParameters: task.requiredParameters,
      optionalParameters: task.optionalParameters,
    }));

    const prompt = this.promptService.getPlannerPrompt();
    const messages: Message[] = [
      {
        id: 'system',
        chatId: input.chatId,
        role: 'system',
        content:
          prompt.system +
          '\nAvailable tasks:\n' +
          JSON.stringify(availableTasks, null, 2),
        timestamp: new Date(),
      },
      ...session.messages.slice(-5),
    ];

    try {
      return await this.llm.generateStructuredOutput<TaskPlan>(
        messages,
        prompt.schema,
        { temperature: 0.2 },
      );
    } catch (error) {
      console.error('Error in planTasks:', error);
      return { tasks: [], reasoning: 'Failed to generate task plan' };
    }
  }

  private async gatherParameters(
    plan: TaskPlan,
    input: InputEvent,
    session: AgentSession,
  ): Promise<ParamGatheringResult> {
    if (!plan.tasks.length) {
      return { params: {}, missingRequired: false, missing: [] };
    }

    const taskDetails = plan.tasks.map((taskName) => {
      const task = this.tasks.get(taskName);
      return {
        name: task.name,
        description: task.description,
        requiredParameters: task.requiredParameters,
        optionalParameters: task.optionalParameters,
      };
    });

    const prompt = this.promptService.getGathererPrompt();
    const messages: Message[] = [
      {
        id: 'system',
        chatId: input.chatId,
        role: 'system',
        content:
          prompt.system +
          '\nTasks to execute:\n' +
          JSON.stringify(taskDetails, null, 2),
        timestamp: new Date(),
      },
      ...session.messages.slice(-5),
    ];

    try {
      const result = await this.llm.generateStructuredOutput<{
        parameters: Record<string, any>;
      }>(messages, prompt.schema, { temperature: 0.1 });

      const requiredParams = taskDetails.flatMap(
        (task) => task.requiredParameters,
      );
      const extractedParams = result.parameters || {};
      const missing = requiredParams.filter((param) => !extractedParams[param]);

      return {
        params: extractedParams,
        missingRequired: missing.length > 0,
        missing,
      };
    } catch (error) {
      console.error('Error in gatherParameters:', error);
      return {
        params: {},
        missingRequired: true,
        missing: taskDetails.flatMap((task) => task.requiredParameters),
      };
    }
  }

  private createParameterRequest(missingParams: string[]): OutputResponse {
    const content = `I need some additional information to help you. Please provide: ${missingParams.join(', ')}`;

    return {
      chatId: '', // Will be filled by the caller
      content,
    };
  }

  private async executeTasks(
    taskNames: string[],
    params: Record<string, any>,
    session: AgentSession,
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    for (const taskName of taskNames) {
      const task = this.tasks.get(taskName);
      if (!task) {
        results[taskName] = { error: `Task ${taskName} not found` };
        continue;
      }

      try {
        const result = await task.run(params, session);
        results[taskName] = result;
      } catch (error) {
        console.error(`Error executing task ${taskName}:`, error);
        results[taskName] = { error: `Error executing task: ${error.message}` };
      }
    }

    return results;
  }

  private async generateResponse(
    input: InputEvent,
    results: TaskResults,
    session: AgentSession,
  ): Promise<OutputResponse> {
    const prompt = this.promptService.getResponderPrompt();
    const messages: Message[] = [
      {
        id: 'system',
        chatId: input.chatId,
        role: 'system',
        content:
          prompt.system +
          '\nTask results:\n' +
          JSON.stringify(results, null, 2),
        timestamp: new Date(),
      },
      ...session.messages.slice(-10),
    ];

    try {
      const content = await this.llm.generateCompletion(messages, {
        temperature: 0.7,
      });

      return {
        chatId: input.chatId,
        content,
      };
    } catch (error) {
      console.error('Error in generateResponse:', error);
      return {
        chatId: input.chatId,
        content:
          "I'm sorry, I encountered an error while generating a response. Please try again later.",
      };
    }
  }
}
