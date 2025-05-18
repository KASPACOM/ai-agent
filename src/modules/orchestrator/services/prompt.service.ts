import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PlannerPrompt,
  GathererPrompt,
  ResponderPrompt,
} from '../models/prompt.models';

@Injectable()
export class PromptService {
  private readonly promptsDir = join(__dirname, '..', 'prompts');

  private loadPrompt(filename: string): string {
    try {
      return readFileSync(join(this.promptsDir, filename), 'utf-8');
    } catch (error) {
      console.error(`Error loading prompt file ${filename}:`, error);
      throw new Error(
        `Failed to load prompt file ${filename}: ${error.message}`,
      );
    }
  }

  getPlannerPrompt(): PlannerPrompt {
    const system = this.loadPrompt('planner.prompt.txt');
    return {
      system,
      schema: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description:
              'List of task names to execute. Must be from the available tasks list.',
          },
          reasoning: {
            type: 'string',
            description: 'Reasoning behind the task selection',
          },
        },
        required: ['tasks', 'reasoning'],
      },
    };
  }

  getGathererPrompt(): GathererPrompt {
    const system = this.loadPrompt('gatherer.prompt.txt');
    return {
      system,
      schema: {
        type: 'object',
        properties: {
          parameters: {
            type: 'object',
            additionalProperties: true,
            description: 'Extracted parameters as key-value pairs',
          },
        },
        required: ['parameters'],
      },
    };
  }

  getResponderPrompt(): ResponderPrompt {
    const system = this.loadPrompt('responder.prompt.txt');
    return {
      system,
      guidelines: [
        'Be concise but informative',
        'If there were errors, explain them clearly',
        'If multiple tasks were executed, summarize the overall outcome',
        'Maintain a helpful and professional tone',
        'If the results are complex, break them down into digestible parts',
      ],
    };
  }
}
