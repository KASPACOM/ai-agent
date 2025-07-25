import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TwitterIndexerService } from './twitter-indexer.service';
import { AccountRotationService } from './account-rotation.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { IndexerConfigService } from '../../shared/config/indexer.config';

/**
 * Twitter Scheduler Status
 */
export interface TwitterSchedulerStatus {
  isRunning: boolean;
  schedule: string;
  nextRun: string;
  lastRun?: Date;
  lastResult?: IndexingResult & { rateLimited?: boolean; hasMoreData?: boolean };
  consecutiveFailures: number;
}

/**
 * Twitter Scheduler Service
 * 
 * Independent scheduler for Twitter indexing operations.
 * Following the architecture where each module has its own scheduler for true independence.
 * 
 * Features:
 * - 15-minute scheduling aligned with Twitter API rate limit windows
 * - Integration with account rotation and rate limiting
 * - Independent error handling and circuit breaking
 * - Sophisticated request budget management
 * - Detailed logging and monitoring
 */
@Injectable()
export class TwitterSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TwitterSchedulerService.name);
  
  // Scheduler state
  private isTwitterRunning = false;
  private lastRun?: Date;
  private lastResult?: IndexingResult & { rateLimited?: boolean; hasMoreData?: boolean };
  private consecutiveFailures = 0;

  constructor(
    private readonly twitterIndexer: TwitterIndexerService,
    private readonly accountRotation: AccountRotationService,
    private readonly config: IndexerConfigService, // ✅ Use configuration service
  ) {}

  async onModuleInit() {
    this.logger.log('Twitter Scheduler Service initialized');
    // Log initial status
    const accountSummary = await this.accountRotation.getAccountRotationSummary();
    this.logger.log('Twitter accounts configured:', {
      total: accountSummary.totalAccounts,
      needingSync: accountSummary.accountsNeedingSync,
      completed: accountSummary.completedAccounts,
    });
  }

  /**
   * Main scheduled Twitter indexing job
   * Runs every 15 minutes to align with Twitter API rate limit reset window
   */
  @Cron('0 */15 * * * *', {
    name: 'twitter-indexer',
    timeZone: 'UTC',
  })
  async runScheduledTwitterIndexing(): Promise<void> {
    if (this.isTwitterRunning) {
      this.logger.warn('Twitter indexing already in progress, skipping this run');
      return;
    }

    // Check circuit breaker
    const maxFailures = this.config.getTwitterMaxConsecutiveFailures();
    if (this.consecutiveFailures >= maxFailures) {
      this.logger.error(
        `Twitter indexer circuit breaker open (${this.consecutiveFailures} consecutive failures). Skipping run.`
      );
      return;
    }

    this.logger.log('Starting scheduled Twitter indexing run (15-minute cycle)');
    this.isTwitterRunning = true;
    const startTime = new Date();

    try {
      // Get account rotation summary for logging
      const accountSummary = await this.accountRotation.getAccountRotationSummary();
      this.logger.log('Current Twitter indexing status:', {
        totalAccounts: accountSummary.totalAccounts,
        accountsNeedingSync: accountSummary.accountsNeedingSync,
        completedAccounts: accountSummary.completedAccounts,
        requestLimit: this.config.getTwitterRequestLimit(),
      });

      // ✅ Run actual Twitter indexer
      const result = await this.twitterIndexer.runIndexer();

      this.lastRun = startTime;
      this.lastResult = result as IndexingResult & { rateLimited?: boolean; hasMoreData?: boolean };

      if (result.success) {
        this.consecutiveFailures = 0;
        this.logger.log('Scheduled Twitter indexing completed successfully', {
          processed: result.processed,
          embedded: result.embedded,
          stored: result.stored,
          errors: result.errors.length,
          rateLimited: (result as any).rateLimited,
          hasMoreData: (result as any).hasMoreData,
          processingTimeMs: result.processingTime,
        });
      } else {
        this.consecutiveFailures++;
        this.logger.error('Scheduled Twitter indexing failed', {
          errors: result.errors,
          consecutiveFailures: this.consecutiveFailures,
        });
      }

    } catch (error) {
      this.consecutiveFailures++;
      this.logger.error('Scheduled Twitter indexing failed with exception', {
        error: error.message,
        stack: error.stack,
        consecutiveFailures: this.consecutiveFailures,
      });

      // Create error result
      this.lastResult = {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors: [error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
        rateLimited: false,
        hasMoreData: false,
      };

    } finally {
      this.isTwitterRunning = false;
      this.logger.log('Twitter indexing run completed');
    }
  }

  /**
   * Manual trigger for Twitter indexing (for testing/debugging)
   */
  async triggerManualRun(): Promise<IndexingResult> {
    if (this.isTwitterRunning) {
      throw new Error('Twitter indexing is already running');
    }

    this.logger.log('Manual Twitter indexing triggered');
    await this.runScheduledTwitterIndexing();
    
    if (!this.lastResult) {
      throw new Error('No result available from manual run');
    }

    return this.lastResult;
  }

  /**
   * Get current scheduler status
   */
  getStatus(): TwitterSchedulerStatus {
    return {
      isRunning: this.isTwitterRunning,
      schedule: 'Every 15 minutes',
      nextRun: this.calculateNextRun(),
      lastRun: this.lastRun,
      lastResult: this.lastResult,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /**
   * Get detailed health information
   */
  async getHealthInfo(): Promise<{
    scheduler: TwitterSchedulerStatus;
    accountSummary: any;
    circuitBreakerOpen: boolean;
  }> {
    const accountSummary = await this.accountRotation.getAccountRotationSummary();
    
    return {
      scheduler: this.getStatus(),
      accountSummary,
      circuitBreakerOpen: this.consecutiveFailures >= this.config.getTwitterMaxConsecutiveFailures(),
    };
  }

  /**
   * Reset circuit breaker (for manual recovery)
   */
  resetCircuitBreaker(): void {
    const previousFailures = this.consecutiveFailures;
    this.consecutiveFailures = 0;
    this.logger.log(`Circuit breaker reset (was ${previousFailures} consecutive failures)`);
  }

  /**
   * Check if currently running
   */
  isCurrentlyRunning(): boolean {
    return this.isTwitterRunning;
  }

  /**
   * Get statistics for monitoring
   */
  getStatistics(): {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    consecutiveFailures: number;
    lastRunDuration?: number;
    averageRunDuration?: number;
    rateLimitedRuns: number;
    accountsProcessed: number;
  } {
    // ✅ Statistics based on current state (could be enhanced with persistent storage)
    const hasRun = this.lastResult !== undefined;
    const successfulRuns = hasRun && this.lastResult?.success ? 1 : 0;
    const failedRuns = hasRun && !this.lastResult?.success ? 1 : 0;
    const rateLimitedRuns = hasRun && this.lastResult?.rateLimited ? 1 : 0;
    
    return {
      totalRuns: hasRun ? 1 : 0,
      successfulRuns,
      failedRuns,
      consecutiveFailures: this.consecutiveFailures,
      lastRunDuration: this.lastResult?.processingTime,
      averageRunDuration: this.lastResult?.processingTime,
      rateLimitedRuns,
      accountsProcessed: this.lastResult?.processed || 0,
    };
  }

  /**
   * Calculate next scheduled run time
   */
  private calculateNextRun(): string {
    const now = new Date();
    const nextRun = new Date(now);
    
    // Round up to next 15-minute mark
    const minutes = nextRun.getMinutes();
    const nextQuarter = Math.ceil(minutes / 15) * 15;
    
    if (nextQuarter >= 60) {
      nextRun.setHours(nextRun.getHours() + 1);
      nextRun.setMinutes(0);
    } else {
      nextRun.setMinutes(nextQuarter);
    }
    
    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);
    
    return nextRun.toISOString();
  }
} 