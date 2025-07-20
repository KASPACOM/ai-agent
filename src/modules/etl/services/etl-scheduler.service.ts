import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IndexerProviderService } from '../providers/indexer.provider';
import { EtlConfigService } from '../config/etl.config';

/**
 * ETL Scheduler Service
 *
 * Handles scheduled execution of indexing processes using cron jobs
 * Currently set to run once, can be modified for recurring schedules
 */
@Injectable()
export class EtlSchedulerService {
  private readonly logger = new Logger(EtlSchedulerService.name);
  private hasRunOnce = false;
  private isRunning = false;

  constructor(
    private readonly indexerProvider: IndexerProviderService,
    private readonly etlConfig: EtlConfigService,
  ) {
    this.logger.log('ETL Scheduler Service initialized');
  }

  /**
   * Scheduled indexer execution
   * Currently runs once per minute but stops after first successful run
   * TODO: Modify cron expression and remove hasRunOnce logic for recurring schedules
   */
  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'etl-indexer',
    timeZone: 'UTC',
  })
  async runScheduledIndexing(): Promise<void> {
    // Only run once for now
    if (this.hasRunOnce) {
      return;
    }

    if (this.isRunning) {
      this.logger.warn('ETL indexing already in progress, skipping this run');
      return;
    }

    this.logger.log('Starting scheduled ETL indexing run');
    this.isRunning = true;
    this.hasRunOnce = true;

    try {
      // Run all indexers
      const results = await this.indexerProvider.runAllIndexers();

      this.logger.log('Scheduled ETL indexing completed successfully', {
        twitter: {
          success: results.twitter.success,
          processed: results.twitter.processed,
          stored: results.twitter.stored,
          errors: results.twitter.errors.length,
        },
        telegram: {
          success: results.telegram.success,
          processed: results.telegram.processed,
          stored: results.telegram.stored,
          errors: results.telegram.errors.length,
        },
        totalProcessed: results.twitter.processed + results.telegram.processed,
        totalStored: results.twitter.stored + results.telegram.stored,
        totalErrors:
          results.twitter.errors.length + results.telegram.errors.length,
      });
    } catch (error) {
      this.logger.error('Scheduled ETL indexing failed', {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Reset the run-once flag to allow scheduled execution again
   * Useful for testing or manual reactivation
   */
  public resetRunOnceFlag(): void {
    this.hasRunOnce = false;
    this.logger.log(
      'Run-once flag reset - scheduler will execute on next cron trigger',
    );
  }

  /**
   * Check if scheduler has completed its run
   */
  public hasCompleted(): boolean {
    return this.hasRunOnce;
  }

  /**
   * Check if scheduler is currently running
   */
  public isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get scheduler status
   */
  public getStatus(): {
    hasRunOnce: boolean;
    isRunning: boolean;
    nextRun: string;
  } {
    return {
      hasRunOnce: this.hasRunOnce,
      isRunning: this.isRunning,
      nextRun: this.hasRunOnce ? 'Completed (run-once mode)' : 'Next minute',
    };
  }
}
