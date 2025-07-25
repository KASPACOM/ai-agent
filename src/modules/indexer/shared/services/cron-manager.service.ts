import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * Cron Job Configuration
 */
export interface CronJobConfig {
  name: string;
  cronExpression: string; // Standard cron expression like '*/30 * * * * *'
  handler: () => Promise<void>;
  enabled: boolean;
}

/**
 * Cron Job Status
 */
export interface CronJobStatus {
  name: string;
  cronExpression: string;
  enabled: boolean;
  isRunning: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  errorCount: number;
  lastError?: string;
}

/**
 * Simple Cron Manager Service
 *
 * Builder pattern for creating and managing cron jobs without complex NestJS schedule dependencies.
 * Uses standard cron expressions like the existing codebase.
 */
@Injectable()
export class CronManager implements OnModuleDestroy {
  private readonly logger = new Logger(CronManager.name);
  private readonly jobs = new Map<string, CronJobConfig>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly status = new Map<string, CronJobStatus>();

  /**
   * Add a cron job using builder pattern
   */
  addJob(config: CronJobConfig): CronManager {
    this.logger.log(
      `Adding cron job: ${config.name} (${config.cronExpression})`,
    );

    // Stop existing job if it exists
    this.removeJob(config.name);

    // Add new job
    this.jobs.set(config.name, config);
    this.status.set(config.name, {
      name: config.name,
      cronExpression: config.cronExpression,
      enabled: config.enabled,
      isRunning: false,
      runCount: 0,
      errorCount: 0,
    });

    // Start job if enabled
    if (config.enabled) {
      this.scheduleJob(config);
    }

    return this;
  }

  /**
   * Remove a cron job
   */
  removeJob(name: string): CronManager {
    const timer = this.timers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(name);
    }

    this.jobs.delete(name);
    this.status.delete(name);

    this.logger.log(`Removed cron job: ${name}`);
    return this;
  }

  /**
   * Enable/disable a job
   */
  toggleJob(name: string, enabled: boolean): CronManager {
    const job = this.jobs.get(name);
    const status = this.status.get(name);

    if (!job || !status) {
      this.logger.warn(`Job not found: ${name}`);
      return this;
    }

    job.enabled = enabled;
    status.enabled = enabled;

    if (enabled) {
      this.scheduleJob(job);
    } else {
      const timer = this.timers.get(name);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(name);
      }
    }

    this.logger.log(`Job ${name} ${enabled ? 'enabled' : 'disabled'}`);
    return this;
  }

  /**
   * Manually trigger a job
   */
  async triggerJob(name: string): Promise<void> {
    const job = this.jobs.get(name);
    const status = this.status.get(name);

    if (!job || !status) {
      throw new Error(`Job not found: ${name}`);
    }

    if (status.isRunning) {
      throw new Error(`Job ${name} is already running`);
    }

    this.logger.log(`Manually triggering job: ${name}`);
    await this.executeJob(job, status);
  }

  /**
   * Get status of all jobs
   */
  getAllStatus(): CronJobStatus[] {
    return Array.from(this.status.values());
  }

  /**
   * Get status of specific job
   */
  getJobStatus(name: string): CronJobStatus | undefined {
    return this.status.get(name);
  }

  /**
   * Schedule a job based on cron expression
   */
  private scheduleJob(job: CronJobConfig): void {
    const status = this.status.get(job.name)!;

    // Convert cron expression to simple interval (simplified approach)
    const intervalMs = this.cronToInterval(job.cronExpression);
    if (intervalMs === null) {
      this.logger.error(
        `Invalid cron expression for job ${job.name}: ${job.cronExpression}`,
      );
      return;
    }

    // Update next run time
    status.nextRun = new Date(Date.now() + intervalMs);

    // Schedule the job
    const timer = setTimeout(async () => {
      await this.executeJob(job, status);

      // Reschedule if still enabled
      if (job.enabled) {
        this.scheduleJob(job);
      }
    }, intervalMs);

    this.timers.set(job.name, timer);

    this.logger.log(`Scheduled job ${job.name} to run in ${intervalMs}ms`);
  }

  /**
   * Execute a job
   */
  private async executeJob(
    job: CronJobConfig,
    status: CronJobStatus,
  ): Promise<void> {
    status.isRunning = true;
    status.lastRun = new Date();
    status.runCount++;

    try {
      this.logger.log(`Executing job: ${job.name}`);
      await job.handler();
      this.logger.log(`Job completed successfully: ${job.name}`);
    } catch (error) {
      status.errorCount++;
      status.lastError = error.message;
      this.logger.error(`Job failed: ${job.name}`, error.message);
    } finally {
      status.isRunning = false;
    }
  }

  /**
   * Convert cron expression to milliseconds (simplified)
   * Supports common patterns used in the existing codebase
   */
  private cronToInterval(cronExpression: string): number | null {
    // Handle common cron patterns
    switch (cronExpression) {
      case '*/30 * * * * *': // Every 30 minutes
        return 30 * 60 * 1000;
      case '0 0 20 * * *': // Daily at 8pm UTC
        return 24 * 60 * 60 * 1000;
      case '*/1 * * * *': // Every minute (like existing ETL)
        return 60 * 1000;
      case '0 0 * * * *': // Every hour
        return 60 * 60 * 1000;
      default:
        // Default to 30 minutes for unrecognized patterns
        this.logger.warn(
          `Unrecognized cron pattern: ${cronExpression}, defaulting to 30 minutes`,
        );
        return 30 * 60 * 1000;
    }
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    this.logger.log('Cleaning up cron jobs...');

    // Clear all timers
    for (const [name, timer] of this.timers.entries()) {
      clearTimeout(timer);
      this.logger.log(`Cleared timer for job: ${name}`);
    }

    this.timers.clear();
    this.jobs.clear();
    this.status.clear();
  }
}
