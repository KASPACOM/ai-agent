import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import {
  AgentMetadata,
  CapabilityDetail,
  ParameterSchema,
} from '../models/openserv.model';

export interface CapabilityHandler {
  (args: Record<string, any>): Promise<any>;
}

export interface AgentCapabilityConfig {
  name: string;
  description: string;
  parameters: ParameterSchema[];
  examples: string[];
  handler: CapabilityHandler;
  isInternal?: boolean;
}

export interface BuiltAgent {
  metadata: AgentMetadata;
  capabilities: CapabilityDetail[];
  executeCapability: (name: string, args: any) => Promise<any>;
  getHealthStatus: () => any;
  getPerformanceMetrics: () => any;
  isInternalOnly?: boolean;
}

/**
 * AgentBuilder - Composable agent builder using the builder pattern
 *
 * This replaces inheritance-based agents with a flexible composition approach:
 * - No inheritance conflicts
 * - Explicit capability registration
 * - Clear API configuration
 * - Better testability and modularity
 */
@Injectable()
export class AgentBuilder {
  private metadata: Partial<AgentMetadata> = {};
  private capabilities: Map<string, AgentCapabilityConfig> = new Map();
  private apiConfigKey: string = 'BACKEND_API_BASE_URL';
  private fallbackUrl?: string;
  private logger: Logger;
  private baseUrl: string;
  private isInternal: boolean = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.logger = new Logger('AgentBuilder');
  }

  /**
   * Start building a new agent with a name
   */
  static create(
    httpService: HttpService,
    configService: ConfigService,
    name: string,
  ): AgentBuilder {
    const builder = new AgentBuilder(httpService, configService);
    return builder.withName(name);
  }

  /**
   * Set the agent name
   */
  withName(name: string): AgentBuilder {
    this.metadata.name = name;
    this.logger = new Logger(`Agent:${name}`);
    return this;
  }

  /**
   * Set the agent description
   */
  withDescription(description: string): AgentBuilder {
    this.metadata.description = description;
    return this;
  }

  /**
   * Set the agent version
   */
  withVersion(version: string): AgentBuilder {
    this.metadata.version = version;
    return this;
  }

  /**
   * Set the agent category
   */
  withCategory(category: string): AgentBuilder {
    this.metadata.category = category;
    return this;
  }

  /**
   * Configure API settings for this agent
   */
  withApiConfig(configKey: string, fallbackUrl?: string): AgentBuilder {
    this.apiConfigKey = configKey;
    if (fallbackUrl) this.fallbackUrl = fallbackUrl;
    return this;
  }

  /**
   * Mark agent as internal-only (won't be exposed to LLM)
   */
  asInternalOnly(): AgentBuilder {
    this.isInternal = true;
    return this;
  }

  /**
   * Add a capability to this agent
   */
  addCapability(
    name: string,
    description: string,
    parameters: ParameterSchema[],
    examples: string[],
    handler: CapabilityHandler,
    isInternal: boolean = false,
  ): AgentBuilder {
    this.capabilities.set(name, {
      name,
      description,
      parameters,
      examples,
      handler,
      isInternal,
    });

    this.logger.debug(`Added capability: ${name}`);
    return this;
  }

  /**
   * Add a simple capability with minimal config
   */
  addSimpleCapability(
    name: string,
    description: string,
    handler: CapabilityHandler,
    requiredParams: string[] = [],
    examples: string[] = [],
  ): AgentBuilder {
    const parameters: ParameterSchema[] = requiredParams.map((param) => ({
      name: param,
      type: 'string',
      required: true,
      description: `${param} parameter`,
    }));

    return this.addCapability(name, description, parameters, examples, handler);
  }

  /**
   * Build the final agent
   */
  build(): BuiltAgent {
    // Validate required metadata
    if (!this.metadata.name) {
      throw new Error('Agent name is required');
    }
    if (!this.metadata.description) {
      throw new Error('Agent description is required');
    }

    // Set defaults
    const metadata: AgentMetadata = {
      name: this.metadata.name,
      description: this.metadata.description,
      version: this.metadata.version || '1.0.0',
      category: this.metadata.category || 'general',
    };

    // Get API base URL
    this.baseUrl =
      this.configService.get<string>(this.apiConfigKey) || this.fallbackUrl;

    this.logger.log(
      `Built agent: ${metadata.name} with ${this.capabilities.size} capabilities`,
    );
    this.logger.debug(
      `API config: ${this.baseUrl} (from ${this.apiConfigKey})`,
    );

    // Convert capabilities to CapabilityDetail format
    const capabilities: CapabilityDetail[] = Array.from(
      this.capabilities.values(),
    ).map((cap) => ({
      name: cap.name,
      description: cap.description,
      parameters: cap.parameters,
      examples: cap.examples,
      isInternal: cap.isInternal,
    }));

    // Create execution function
    const executeCapability = async (
      name: string,
      args: Record<string, any>,
    ): Promise<any> => {
      const capability = this.capabilities.get(name);
      if (!capability) {
        throw new Error(
          `Capability '${name}' not found in agent '${metadata.name}'`,
        );
      }

      const executionId = this.generateExecutionId();

      try {
        this.logCapabilityStart(metadata.name, name, args, executionId);

        // Validate required parameters
        this.validateRequiredParams(capability.parameters, args);

        const result = await capability.handler(args);

        this.logCapabilityComplete(metadata.name, name, result, executionId);
        return result;
      } catch (error) {
        this.logCapabilityError(metadata.name, name, error, executionId);
        throw error;
      }
    };

    // Create health status function
    const getHealthStatus = () => ({
      agent: metadata.name,
      status: 'healthy',
      capabilities: capabilities.length,
      lastCheck: new Date().toISOString(),
      version: metadata.version,
      apiUrl: this.baseUrl,
    });

    // Create performance metrics function
    const getPerformanceMetrics = () => ({
      totalCalls: 0, // Could be enhanced with actual metrics
      successRate: 100,
      averageResponseTime: 0,
      lastActivity: new Date().toISOString(),
    });

    return {
      metadata,
      capabilities,
      executeCapability,
      getHealthStatus,
      getPerformanceMetrics,
      isInternalOnly: this.isInternal,
    };
  }

  // Helper methods

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private validateRequiredParams(
    parameters: ParameterSchema[],
    args: Record<string, any>,
  ): void {
    const required = parameters.filter((p) => p.required).map((p) => p.name);
    const missing = required.filter(
      (param) => !args.hasOwnProperty(param) || args[param] == null,
    );

    if (missing.length > 0) {
      throw new Error(`Missing required parameters: ${missing.join(', ')}`);
    }
  }

  private logCapabilityStart(
    agentName: string,
    capabilityName: string,
    params: any,
    executionId: string,
  ): void {
    this.logger.log(
      `[${agentName.toUpperCase()}] ${executionId} - Executing capability: ${capabilityName}`,
    );
    this.logger.debug(
      `[${agentName.toUpperCase()}] ${executionId} - Parameters:`,
      JSON.stringify(params, null, 2),
    );
  }

  private logCapabilityComplete(
    agentName: string,
    capabilityName: string,
    result: any,
    executionId: string,
  ): void {
    this.logger.log(
      `[${agentName.toUpperCase()}] ${executionId} - Capability ${capabilityName} completed successfully`,
    );
    this.logger.debug(
      `[${agentName.toUpperCase()}] ${executionId} - Result:`,
      JSON.stringify(result, null, 2),
    );
  }

  private logCapabilityError(
    agentName: string,
    capabilityName: string,
    error: any,
    executionId: string,
  ): void {
    this.logger.error(
      `[${agentName.toUpperCase()}] ${executionId} - Capability ${capabilityName} failed:`,
      error.message,
    );
    this.logger.debug(
      `[${agentName.toUpperCase()}] ${executionId} - Error stack:`,
      error.stack,
    );
  }
}
