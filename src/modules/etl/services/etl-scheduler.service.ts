import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IndexerProviderService } from '../providers/indexer.provider';
import { EtlConfigService } from '../config/etl.config';
import { TwitterIndexerService } from './twitter-indexer.service';
import { EmbeddingService } from './embedding.service';
import { QdrantRepository } from '../../database/qdrant/services/qdrant.repository';

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
  private isTwitterRunning = false;
  private isTelegramRunning = false;

  constructor(
    private readonly indexerProvider: IndexerProviderService,
    private readonly etlConfig: EtlConfigService,
    private readonly twitterIndexer: TwitterIndexerService,
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantRepository: QdrantRepository,
  ) {
    this.logger.log('ETL Scheduler Service initialized');
  }

  /**
   * Scheduled Twitter indexer execution
   * Runs every 15 minutes to align with Twitter API rate limit reset window
   * Handles stateful processing with request limit management
   */
  @Cron('0 */15 * * * *', {
    name: 'twitter-indexer',
    timeZone: 'UTC',
  })
  async runScheduledTwitterIndexing(): Promise<void> {
    if (this.isTwitterRunning) {
      this.logger.warn(
        'Twitter indexing already in progress, skipping this run',
      );
      return;
    }

    this.logger.log('Starting scheduled Twitter indexing run (15min cycle)');
    this.isTwitterRunning = true;

    try {
      // Run Twitter indexer with rate limit aware processing
      const result = await this.indexerProvider.runTwitterIndexer();

      this.logger.log('Scheduled Twitter indexing completed', {
        success: result.success,
        processed: result.processed,
        stored: result.stored,
        errors: result.errors.length,
        rateLimited: result.rateLimited,
        nextRunWillContinue: result.hasMoreData,
      });
    } catch (error) {
      this.logger.error('Scheduled Twitter indexing failed', {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      this.isTwitterRunning = false;
    }
  }

  /**
   * Scheduled Telegram indexer execution
   * Runs daily at 8pm UTC to be respectful to Telegram API limits
   * Processes all configured Telegram channels and forum topics
   */
  @Cron('0 0 20 * * *', {
    name: 'telegram-indexer',
    timeZone: 'UTC',
  })
  async runScheduledTelegramIndexing(): Promise<void> {
    if (this.isTelegramRunning) {
      this.logger.warn(
        'Telegram indexing already in progress, skipping this run',
      );
      return;
    }

    this.logger.log(
      'Starting scheduled Telegram indexing run (daily at 8pm UTC)',
    );
    this.isTelegramRunning = true;

    try {
      // Run Telegram indexer
      const result = await this.indexerProvider.runTelegramIndexer();

      this.logger.log('Scheduled Telegram indexing completed', {
        success: result.success,
        processed: result.processed,
        stored: result.stored,
        errors: result.errors.length,
      });
    } catch (error) {
      this.logger.error('Scheduled Telegram indexing failed', {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      this.isTelegramRunning = false;
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
   * Check if any scheduler is currently running
   */
  public isCurrentlyRunning(): boolean {
    return this.isTwitterRunning || this.isTelegramRunning;
  }

  /**
   * Get scheduler status
   */
  public getStatus(): {
    hasRunOnce: boolean;
    isTwitterRunning: boolean;
    isTelegramRunning: boolean;
    twitterSchedule: string;
    telegramSchedule: string;
  } {
    return {
      hasRunOnce: this.hasRunOnce,
      isTwitterRunning: this.isTwitterRunning,
      isTelegramRunning: this.isTelegramRunning,
      twitterSchedule: 'Every 15 minutes',
      telegramSchedule: 'Every minute (testing)',
    };
  }
}
