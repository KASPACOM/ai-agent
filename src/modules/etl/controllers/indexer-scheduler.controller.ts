import { Controller, Logger, Get, Post } from '@nestjs/common';
import { IndexerProviderService } from '../providers/indexer.provider';
import { EtlSchedulerService } from '../services/etl-scheduler.service';
import { IndexingResult } from '../models/base-indexer.model';

/**
 * Indexer Manual Controller
 *
 * Provides REST endpoints for manual triggering of indexing processes
 * No automatic startup execution - controlled via scheduled cron jobs or manual triggers
 */
@Controller('indexer')
export class IndexerSchedulerController {
  private readonly logger = new Logger(IndexerSchedulerController.name);

  constructor(
    private readonly indexerProvider: IndexerProviderService,
    private readonly etlScheduler: EtlSchedulerService,
  ) {}

  @Get('twitter')
  async runTwitterIndexer(): Promise<{
    success: boolean;
    message: string;
    result: IndexingResult;
  }> {
    this.logger.log('Manual Twitter indexing triggered');

    try {
      const result = await this.indexerProvider.runTwitterIndexer();

      return {
        success: result.success,
        message: result.success
          ? `Twitter indexing completed: ${result.processed} processed, ${result.stored} stored`
          : `Twitter indexing failed: ${result.errors.join(', ')}`,
        result,
      };
    } catch (error) {
      this.logger.error('Manual Twitter indexing failed', error);

      return {
        success: false,
        message: `Twitter indexing failed: ${error.message}`,
        result: this.createFailureResult(error.message),
      };
    }
  }

  @Get('telegram')
  async runTelegramIndexer(): Promise<{
    success: boolean;
    message: string;
    result: IndexingResult;
  }> {
    this.logger.log('Manual Telegram indexing triggered');

    try {
      const result = await this.indexerProvider.runTelegramIndexer();

      return {
        success: result.success,
        message: result.success
          ? `Telegram indexing completed: ${result.processed} processed, ${result.stored} stored`
          : `Telegram indexing failed: ${result.errors.join(', ')}`,
        result,
      };
    } catch (error) {
      this.logger.error('Manual Telegram indexing failed', error);

      return {
        success: false,
        message: `Telegram indexing failed: ${error.message}`,
        result: this.createFailureResult(error.message),
      };
    }
  }

  @Get('all')
  async runAllIndexers(): Promise<{
    success: boolean;
    message: string;
    results: {
      twitter: IndexingResult;
      telegram: IndexingResult;
    };
  }> {
    this.logger.log('Manual all indexers triggered');

    try {
      const results = await this.indexerProvider.runAllIndexers();
      const overallSuccess =
        results.twitter.success && results.telegram.success;

      return {
        success: overallSuccess,
        message: overallSuccess
          ? 'All indexing completed successfully'
          : 'Some indexing processes failed',
        results,
      };
    } catch (error) {
      this.logger.error('Manual all indexers failed', error);

      const failureResult = this.createFailureResult(error.message);
      return {
        success: false,
        message: `All indexers failed: ${error.message}`,
        results: {
          twitter: failureResult,
          telegram: failureResult,
        },
      };
    }
  }

  @Get('health')
  async getHealth(): Promise<{
    healthy: boolean;
    services: any;
  }> {
    try {
      const health = await this.indexerProvider.getHealth();

      return {
        healthy: health.overall,
        services: {
          twitter: health.twitter,
          telegram: health.telegram,
        },
      };
    } catch (error) {
      this.logger.error('Health check failed', error);

      return {
        healthy: false,
        services: {
          twitter: { isHealthy: false, errors: ['Health check failed'] },
          telegram: { isHealthy: false, errors: ['Health check failed'] },
        },
      };
    }
  }

  @Get('stats')
  getStatistics(): {
    twitter: any;
    telegram: any;
  } {
    return this.indexerProvider.getStatistics();
  }

  @Get('reset-stats')
  resetStatistics(): {
    success: boolean;
    message: string;
  } {
    try {
      this.indexerProvider.resetStatistics();
      this.logger.log('Statistics reset completed');

      return {
        success: true,
        message: 'Statistics reset successfully',
      };
    } catch (error) {
      this.logger.error('Statistics reset failed', error);

      return {
        success: false,
        message: `Statistics reset failed: ${error.message}`,
      };
    }
  }

  @Get('scheduler/status')
  getSchedulerStatus(): {
    hasRunOnce: boolean;
    isTwitterRunning: boolean;
    isTelegramRunning: boolean;
    twitterSchedule: string;
    telegramSchedule: string;
  } {
    return this.etlScheduler.getStatus();
  }

  @Post('scheduler/reset')
  resetScheduler(): {
    success: boolean;
    message: string;
  } {
    try {
      this.etlScheduler.resetRunOnceFlag();
      this.logger.log('Scheduler reset completed');

      return {
        success: true,
        message: 'Scheduler reset successfully - will run on next cron trigger',
      };
    } catch (error) {
      this.logger.error('Scheduler reset failed', error);

      return {
        success: false,
        message: `Scheduler reset failed: ${error.message}`,
      };
    }
  }

  private createFailureResult(errorMessage: string): IndexingResult {
    const now = new Date();
    return {
      success: false,
      processed: 0,
      embedded: 0,
      stored: 0,
      errors: [errorMessage],
      processingTime: 0,
      startTime: now,
      endTime: now,
    };
  }
}
