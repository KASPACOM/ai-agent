import { Injectable, Logger } from '@nestjs/common';
import { TwitterIndexerService } from '../services/twitter-indexer.service';
import { TelegramIndexerService } from '../services/telegram-indexer.service';
import { IndexingResult } from '../models/base-indexer.model';

/**
 * Indexer Provider Service
 *
 * Central service that coordinates Twitter and Telegram indexing operations
 * Called by the scheduler to run indexing processes
 */
@Injectable()
export class IndexerProviderService {
  private readonly logger = new Logger(IndexerProviderService.name);

  constructor(
    private readonly twitterIndexer: TwitterIndexerService,
    private readonly telegramIndexer: TelegramIndexerService,
  ) {
    this.logger.log('IndexerProviderService initialized');
  }

  /**
   * Run Twitter indexing process
   * Fetches and processes tweets from configured Twitter accounts
   */
  async runTwitterIndexer(): Promise<IndexingResult> {
    this.logger.log('Starting Twitter indexing process');

    try {
      const result = await this.twitterIndexer.runIndexer();

      if (result.success) {
        this.logger.log(
          `Twitter indexing completed successfully: ${result.processed} processed, ${result.stored} stored`,
        );
      } else {
        this.logger.error(
          `Twitter indexing completed with errors: ${result.errors.join(', ')}`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error('Twitter indexing failed', error);

      return {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors: [`Twitter indexing failed: ${error.message}`],
        processingTime: 0,
        startTime: new Date(),
        endTime: new Date(),
      };
    }
  }

  /**
   * Run Telegram indexing process
   * Fetches and processes messages from configured Telegram channels
   */
  async runTelegramIndexer(): Promise<IndexingResult> {
    this.logger.log('Starting Telegram indexing process');

    try {
      const result = await this.telegramIndexer.runIndexer();

      if (result.success) {
        this.logger.log(
          `Telegram indexing completed successfully: ${result.processed} processed, ${result.stored} stored`,
        );
      } else {
        this.logger.error(
          `Telegram indexing completed with errors: ${result.errors.join(', ')}`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error('Telegram indexing failed', error);

      return {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors: [`Telegram indexing failed: ${error.message}`],
        processingTime: 0,
        startTime: new Date(),
        endTime: new Date(),
      };
    }
  }

  /**
   * Run both Twitter and Telegram indexing processes
   * Useful for comprehensive data collection
   */
  async runAllIndexers(): Promise<{
    twitter: IndexingResult;
    telegram: IndexingResult;
  }> {
    this.logger.log('Starting all indexing processes');

    const [twitterResult, telegramResult] = await Promise.allSettled([
      this.runTwitterIndexer(),
      this.runTelegramIndexer(),
    ]);

    const twitter =
      twitterResult.status === 'fulfilled'
        ? twitterResult.value
        : this.createFailureResult('Twitter indexer promise rejected');

    const telegram =
      telegramResult.status === 'fulfilled'
        ? telegramResult.value
        : this.createFailureResult('Telegram indexer promise rejected');

    this.logger.log('All indexing processes completed');

    return { twitter, telegram };
  }

  /**
   * Get health status of all indexers
   */
  async getHealth(): Promise<{
    twitter: any;
    telegram: any;
    overall: boolean;
  }> {
    try {
      const [twitterHealth, telegramHealth] = await Promise.allSettled([
        this.twitterIndexer.getHealth(),
        this.telegramIndexer.getHealth(),
      ]);

      const twitter =
        twitterHealth.status === 'fulfilled'
          ? twitterHealth.value
          : { isHealthy: false, errors: ['Health check failed'] };

      const telegram =
        telegramHealth.status === 'fulfilled'
          ? telegramHealth.value
          : { isHealthy: false, errors: ['Health check failed'] };

      return {
        twitter,
        telegram,
        overall: twitter.isHealthy && telegram.isHealthy,
      };
    } catch (error) {
      this.logger.error('Health check failed', error);

      return {
        twitter: { isHealthy: false, errors: ['Health check failed'] },
        telegram: { isHealthy: false, errors: ['Health check failed'] },
        overall: false,
      };
    }
  }

  /**
   * Get statistics from all indexers
   */
  getStatistics(): {
    twitter: any;
    telegram: any;
  } {
    return {
      twitter: this.twitterIndexer.getStatistics(),
      telegram: this.telegramIndexer.getStatistics(),
    };
  }

  /**
   * Reset statistics for all indexers
   */
  resetStatistics(): void {
    this.logger.log('Resetting statistics for all indexers');
    this.twitterIndexer.resetStatistics();
    this.telegramIndexer.resetStatistics();
  }

  /**
   * Create a failure result
   */
  private createFailureResult(errorMessage: string): IndexingResult {
    return {
      success: false,
      processed: 0,
      embedded: 0,
      stored: 0,
      errors: [errorMessage],
      processingTime: 0,
      startTime: new Date(),
      endTime: new Date(),
    };
  }
}
