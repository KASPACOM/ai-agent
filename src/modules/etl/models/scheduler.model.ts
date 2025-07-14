/**
 * Scheduler Configuration Interface
 *
 * Configuration settings for scheduled operations
 */
export interface SchedulerConfiguration {
  etlEnabled: boolean;
  scheduleInterval: string;
  twitterAccounts: string[];
  batchSize: number;
}

/**
 * Scheduler Status Interface
 *
 * Current status of the scheduler service
 */
export interface SchedulerStatus {
  isIndexerRunning: boolean;
  lastIndexerRun?: Date;
  indexerRunCount: number;
  configuration: SchedulerConfiguration;
}
