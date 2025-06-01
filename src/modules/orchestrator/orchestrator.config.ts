import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OrchestratorConfig {
  memory: {
    maxContextLength: number;
    compressionThreshold: number;
    retentionPeriod: number;
    enableSemanticCompression: boolean;
  };
  orchestration: {
    maxConcurrentAgents: number;
    timeoutMs: number;
    retryAttempts: number;
    enableIntelligentRouting: boolean;
    enableWorkflowChaining: boolean;
    memoryManagement: {
      maxHistoryLength: number;
      contextCompression: boolean;
      sessionTimeout: number;
    };
  };
  performance: {
    enableCaching: boolean;
    cacheExpirationMs: number;
    enableParallelExecution: boolean;
    maxParallelTasks: number;
    caching: {
      enabled: boolean;
      ttl: number;
    };
  };
  security: {
    enableUserIsolation: boolean;
    enableRateLimiting: boolean;
    maxRequestsPerMinute: number;
    enableSensitiveDataHandling: boolean;
  };
}

/**
 * Default orchestrator configuration values
 * These can be overridden by environment variables
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  memory: {
    maxContextLength: 10000,
    compressionThreshold: 8000,
    retentionPeriod: 86400000, // 24 hours in ms
    enableSemanticCompression: true,
  },
  orchestration: {
    maxConcurrentAgents: 5,
    timeoutMs: 30000,
    retryAttempts: 3,
    enableIntelligentRouting: true,
    enableWorkflowChaining: true,
    memoryManagement: {
      maxHistoryLength: 50,
      contextCompression: true,
      sessionTimeout: 3600000, // 1 hour in ms
    },
  },
  performance: {
    enableCaching: true,
    cacheExpirationMs: 300000, // 5 minutes
    enableParallelExecution: true,
    maxParallelTasks: 3,
    caching: {
      enabled: true,
      ttl: 300000, // 5 minutes
    },
  },
  security: {
    enableUserIsolation: true,
    enableRateLimiting: true,
    maxRequestsPerMinute: 60,
    enableSensitiveDataHandling: true,
  },
};

/**
 * OrchestratorConfigurationService
 *
 * Provides configuration for orchestrator-specific settings including:
 * - Memory management and context compression
 * - Multi-agent coordination settings
 * - Performance optimization settings
 * - Security controls
 *
 * Uses default config values that can be overridden by environment variables
 */
@Injectable()
export class OrchestratorConfigurationService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get orchestrator configuration with environment variable overrides
   */
  getOrchestratorConfig(): OrchestratorConfig {
    const defaults = DEFAULT_ORCHESTRATOR_CONFIG;

    return {
      memory: {
        maxContextLength: this.configService.get<number>(
          'ORCHESTRATOR_MAX_CONTEXT_LENGTH',
          defaults.memory.maxContextLength,
        ),
        compressionThreshold: this.configService.get<number>(
          'ORCHESTRATOR_COMPRESSION_THRESHOLD',
          defaults.memory.compressionThreshold,
        ),
        retentionPeriod: this.configService.get<number>(
          'ORCHESTRATOR_RETENTION_PERIOD',
          defaults.memory.retentionPeriod,
        ),
        enableSemanticCompression: this.configService.get<boolean>(
          'ORCHESTRATOR_SEMANTIC_COMPRESSION',
          defaults.memory.enableSemanticCompression,
        ),
      },
      orchestration: {
        maxConcurrentAgents: this.configService.get<number>(
          'ORCHESTRATOR_MAX_CONCURRENT_AGENTS',
          defaults.orchestration.maxConcurrentAgents,
        ),
        timeoutMs: this.configService.get<number>(
          'ORCHESTRATOR_TIMEOUT_MS',
          defaults.orchestration.timeoutMs,
        ),
        retryAttempts: this.configService.get<number>(
          'ORCHESTRATOR_RETRY_ATTEMPTS',
          defaults.orchestration.retryAttempts,
        ),
        enableIntelligentRouting: this.configService.get<boolean>(
          'ORCHESTRATOR_INTELLIGENT_ROUTING',
          defaults.orchestration.enableIntelligentRouting,
        ),
        enableWorkflowChaining: this.configService.get<boolean>(
          'ORCHESTRATOR_WORKFLOW_CHAINING',
          defaults.orchestration.enableWorkflowChaining,
        ),
        memoryManagement: {
          maxHistoryLength: this.configService.get<number>(
            'ORCHESTRATOR_MAX_HISTORY_LENGTH',
            defaults.orchestration.memoryManagement.maxHistoryLength,
          ),
          contextCompression: this.configService.get<boolean>(
            'ORCHESTRATOR_CONTEXT_COMPRESSION',
            defaults.orchestration.memoryManagement.contextCompression,
          ),
          sessionTimeout: this.configService.get<number>(
            'ORCHESTRATOR_SESSION_TIMEOUT',
            defaults.orchestration.memoryManagement.sessionTimeout,
          ),
        },
      },
      performance: {
        enableCaching: this.configService.get<boolean>(
          'ORCHESTRATOR_ENABLE_CACHING',
          defaults.performance.enableCaching,
        ),
        cacheExpirationMs: this.configService.get<number>(
          'ORCHESTRATOR_CACHE_EXPIRATION_MS',
          defaults.performance.cacheExpirationMs,
        ),
        enableParallelExecution: this.configService.get<boolean>(
          'ORCHESTRATOR_PARALLEL_EXECUTION',
          defaults.performance.enableParallelExecution,
        ),
        maxParallelTasks: this.configService.get<number>(
          'ORCHESTRATOR_MAX_PARALLEL_TASKS',
          defaults.performance.maxParallelTasks,
        ),
        caching: {
          enabled: this.configService.get<boolean>(
            'ORCHESTRATOR_CACHING_ENABLED',
            defaults.performance.caching.enabled,
          ),
          ttl: this.configService.get<number>(
            'ORCHESTRATOR_CACHING_TTL',
            defaults.performance.caching.ttl,
          ),
        },
      },
      security: {
        enableUserIsolation: this.configService.get<boolean>(
          'ORCHESTRATOR_USER_ISOLATION',
          defaults.security.enableUserIsolation,
        ),
        enableRateLimiting: this.configService.get<boolean>(
          'ORCHESTRATOR_RATE_LIMITING',
          defaults.security.enableRateLimiting,
        ),
        maxRequestsPerMinute: this.configService.get<number>(
          'ORCHESTRATOR_MAX_REQUESTS_PER_MINUTE',
          defaults.security.maxRequestsPerMinute,
        ),
        enableSensitiveDataHandling: this.configService.get<boolean>(
          'ORCHESTRATOR_SENSITIVE_DATA_HANDLING',
          defaults.security.enableSensitiveDataHandling,
        ),
      },
    };
  }
}
