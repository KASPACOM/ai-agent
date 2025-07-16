import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppConfigService } from '../config/app-config.service';
import { IndexerService } from '../../../etl/services/indexer.service';
import { QdrantRepository } from '../../../database/qdrant/services/qdrant.repository';
import {
  SchedulerStatus,
  SchedulerConfiguration,
} from '../../../etl/models/scheduler.model';

/**
 * SchedulerService
 *
 * Centralized service for managing all scheduled tasks in the application.
 * This service coordinates:
 * - Tweet indexing pipeline execution
 * - Twitter data collection
 * - Vector database maintenance
 * - Health checks and monitoring
 *
 * All scheduled functions are managed here for easy monitoring and control.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private isIndexerRunning = false;
  private lastIndexerRun?: Date;
  private indexerRunCount = 0;
  private runningMode: 'listener' | 'scraper' = 'scraper';

  constructor(
    private readonly configService: AppConfigService,
    private readonly indexerService: IndexerService,
    private readonly QdrantRepository: QdrantRepository,
  ) {
    this.logger.log('SchedulerService initialized');
    this.logger.log(`ETL enabled: ${this.configService.getEtlEnabled}`);
    this.logger.log(
      `ETL schedule: ${this.configService.getEtlScheduleInterval}`,
    );
  }

  /**
   * Indexer Pipeline Scheduler
   * Runs listener-based indexing (default: every 1 minute for testing)
   */
  @Cron('*/1 * * * *', {
    name: 'indexer-pipeline',
    timeZone: 'UTC',
  })
  async handleIndexerPipeline(): Promise<void> {
    if (!this.configService.getEtlEnabled || this.runningMode !== 'listener') {
      return;
    }

    if (this.isIndexerRunning) {
      this.logger.warn(
        'Indexer pipeline is already running, skipping this execution',
      );
      return;
    }

    this.isIndexerRunning = true;
    this.indexerRunCount++;
    this.lastIndexerRun = new Date();

    try {
      this.logger.log(
        `Starting indexer pipeline execution #${this.indexerRunCount}`,
      );

      // Execute the listener-based indexing process
      const result = await this.indexerService.runListenerIndexing();

      this.logger.log('Indexer pipeline executed successfully', {
        runCount: this.indexerRunCount,
        lastRun: this.lastIndexerRun,
        twitterAccounts: this.configService.getTwitterAccountsConfig,
        batchSize: this.configService.getEtlBatchSize,
        result: {
          success: result.success,
          status: result.status,
          processingTime: result.processingTime,
          tweetsProcessed: result.results?.processed || 0,
          embeddingsGenerated: result.results?.embedded || 0,
          vectorsStored: result.results?.stored || 0,
          errors: result.errors?.length || 0,
        },
      });
    } catch (error) {
      this.logger.error('Indexer pipeline execution failed', error);
    } finally {
      this.isIndexerRunning = false;
    }
  }

  /**
   * Historical Scraper Scheduler
   * Runs scraper-based indexing (less frequent, for historical data)
   */
  @Cron('*/1 * * * *', {
    name: 'historical-scraper',
    timeZone: 'UTC',
  })
  async handleHistoricalScraper(): Promise<void> {
    if (!this.configService.getEtlEnabled || this.runningMode !== 'scraper') {
      return;
    }

    try {
      this.logger.log('Starting historical scraper execution');

      // Execute the scraper-based indexing process for last 7 days
      const result = await this.indexerService.runScraperIndexing(100);

      this.logger.log('Historical scraper executed successfully', {
        result: {
          success: result.success,
          status: result.status,
          processingTime: result.processingTime,
          tweetsProcessed: result.results?.processed || 0,
          embeddingsGenerated: result.results?.embedded || 0,
          vectorsStored: result.results?.stored || 0,
          errors: result.errors?.length || 0,
        },
      });
    } catch (error) {
      this.logger.error('Historical scraper execution failed', error);
    }
  }

  /**
   * Health Check Scheduler
   * Runs health checks on Qdrant and other services
   */
  @Cron('*/5 * * * *', {
    name: 'health-check',
    timeZone: 'UTC',
  })
  async handleHealthCheck(): Promise<void> {
    try {
      this.logger.debug('Running health check');

      // Check Qdrant health
      const qdrantHealth = await this.QdrantRepository.checkHealth();

      if (!qdrantHealth.isHealthy) {
        this.logger.warn('Qdrant health check failed', {
          issues: qdrantHealth.issues,
        });
      }

      // Check indexer health
      const indexerHealth = await this.indexerService.getIndexingHealth();

      if (!indexerHealth.isHealthy) {
        this.logger.warn('Indexer health check failed', {
          services: indexerHealth.services,
          errors: indexerHealth.errors,
        });
      }

      this.logger.debug('Health check completed', {
        qdrant: qdrantHealth.isHealthy,
        indexer: indexerHealth.isHealthy,
      });
    } catch (error) {
      this.logger.error('Health check execution failed', error);
    }
  }

  /**
   * Get scheduler status
   */
  getSchedulerStatus(): SchedulerStatus {
    const configuration: SchedulerConfiguration = {
      etlEnabled: this.configService.getEtlEnabled,
      scheduleInterval: this.configService.getEtlScheduleInterval,
      twitterAccounts: this.configService.getTwitterAccountsConfig,
      batchSize: this.configService.getEtlBatchSize,
    };

    return {
      isIndexerRunning: this.isIndexerRunning,
      lastIndexerRun: this.lastIndexerRun,
      indexerRunCount: this.indexerRunCount,
      configuration,
    };
  }
}
