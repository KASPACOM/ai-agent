import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramHistoryService } from './telegram-history.service';
import { TelegramIndexerService } from './telegram-indexer.service';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { IndexerConfigService } from '../../shared/config/indexer.config';

/**
 * Telegram Scheduler Status
 */
export interface TelegramSchedulerStatus {
  isRunning: boolean;
  schedule: string;
  nextRun: string;
  lastRun?: Date;
  lastResult?: IndexingResult;
  consecutiveFailures: number;
}

/**
 * Telegram Scheduler Service
 * 
 * Independent scheduler for telegram indexing operations.
 * Following the architecture where each module has its own scheduler for true independence.
 * 
 * Features:
 * - Daily scheduling optimized for Telegram API limits
 * - Integration with telegram history tracking
 * - Independent error handling and circuit breaking
 * - Detailed logging and monitoring
 */
@Injectable()
export class TelegramSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TelegramSchedulerService.name);
  
  // Scheduler state
  private isTelegramRunning = false;
  private lastRun?: Date;
  private lastResult?: IndexingResult;
  private consecutiveFailures = 0;

  constructor(
    private readonly telegramHistory: TelegramHistoryService,
    private readonly config: IndexerConfigService, // ✅ Use configuration service
    private readonly telegramIndexer: TelegramIndexerService, // ✅ Now injected
  ) {}

  async onModuleInit() {
    this.logger.log('Telegram Scheduler Service initialized');
    // Run once on startup for testing
    // await this.runScheduledTelegramIndexing();
  }

  /**
   * Main scheduled telegram indexing job
   * Runs daily at 8pm UTC to be respectful to Telegram API limits
   */
  @Cron('0 0 20 * * *', {
    name: 'telegram-indexer',
    timeZone: 'UTC',
  })
  async runScheduledTelegramIndexing(): Promise<void> {
    if (this.isTelegramRunning) {
      this.logger.warn('Telegram indexing already in progress, skipping this run');
      return;
    }

    // Check circuit breaker
    const maxFailures = this.config.getTelegramMaxConsecutiveFailures();
    if (this.consecutiveFailures >= maxFailures) {
      this.logger.error(
        `Telegram indexer circuit breaker open (${this.consecutiveFailures} consecutive failures). Skipping run.`
      );
      return;
    }

    this.logger.log('Starting scheduled telegram indexing run (daily at 8pm UTC)');
    this.isTelegramRunning = true;
    const startTime = new Date();

    try {
      // Get history summary for logging
      const historySummary = await this.telegramHistory.getHistorySummary();
      this.logger.log('Current telegram indexing status:', {
        totalChannels: historySummary.totalChannels,
        totalTopics: historySummary.totalTopics,
        totalMessages: historySummary.totalMessages,
        completedChannels: historySummary.completedChannels,
        completedTopics: historySummary.completedTopics,
      });

      // ✅ Run actual telegram indexer
      const result = await this.telegramIndexer.runIndexer();

      this.lastRun = startTime;
      this.lastResult = result;

      if (result.success) {
        this.consecutiveFailures = 0;
        this.logger.log('Scheduled telegram indexing completed successfully', {
          processed: result.processed,
          embedded: result.embedded,
          stored: result.stored,
          errors: result.errors.length,
          processingTimeMs: result.processingTime,
        });
      } else {
        this.consecutiveFailures++;
        this.logger.error('Scheduled telegram indexing failed', {
          errors: result.errors,
          consecutiveFailures: this.consecutiveFailures,
        });
      }

    } catch (error) {
      this.consecutiveFailures++;
      this.logger.error('Scheduled telegram indexing failed with exception', {
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
      };

    } finally {
      this.isTelegramRunning = false;
      this.logger.log('Telegram indexing run completed');
    }
  }

  /**
   * Manual trigger for telegram indexing (for testing/debugging)
   */
  async triggerManualRun(): Promise<IndexingResult> {
    if (this.isTelegramRunning) {
      throw new Error('Telegram indexing is already running');
    }

    this.logger.log('Manual telegram indexing triggered');
    await this.runScheduledTelegramIndexing();
    
    if (!this.lastResult) {
      throw new Error('No result available from manual run');
    }

    return this.lastResult;
  }

  /**
   * Get current scheduler status
   */
  getStatus(): TelegramSchedulerStatus {
    return {
      isRunning: this.isTelegramRunning,
      schedule: 'Daily at 8pm UTC',
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
    scheduler: TelegramSchedulerStatus;
    historySummary: any;
    circuitBreakerOpen: boolean;
  }> {
    const historySummary = await this.telegramHistory.getHistorySummary();
    
    return {
      scheduler: this.getStatus(),
      historySummary,
      circuitBreakerOpen: this.consecutiveFailures >= this.config.getTelegramMaxConsecutiveFailures(),
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
    return this.isTelegramRunning;
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
  } {
    // ✅ Statistics based on current state (could be enhanced with persistent storage)
    const hasRun = this.lastResult !== undefined;
    const successfulRuns = hasRun && this.lastResult?.success ? 1 : 0;
    const failedRuns = hasRun && !this.lastResult?.success ? 1 : 0;
    
    return {
      totalRuns: hasRun ? 1 : 0,
      successfulRuns,
      failedRuns,
      consecutiveFailures: this.consecutiveFailures,
      lastRunDuration: this.lastResult?.processingTime,
      averageRunDuration: this.lastResult?.processingTime,
    };
  }

  /**
   * Calculate next scheduled run time
   */
  private calculateNextRun(): string {
    const now = new Date();
    const nextRun = new Date();
    
    // Set to 8pm UTC today
    nextRun.setUTCHours(20, 0, 0, 0);
    
    // If 8pm today has passed, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }
    
    return nextRun.toISOString();
  }
} 