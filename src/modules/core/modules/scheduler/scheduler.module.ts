import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from '../config/app-config.module';
import { AppLoggerModule } from '../logger/app-logger.module';
import { SchedulerService } from './scheduler.service';
import { EtlModule } from '../../../etl/etl.module';
import { DatabaseModule } from '../../../database/database.module';

/**
 * SchedulerModule
 * 
 * Centralized cron scheduler module that handles all scheduled tasks:
 * - ETL pipeline scheduling
 * - Twitter data collection
 * - Vector database maintenance
 * - Health checks and monitoring
 * 
 * All scheduled functions are managed in one place for easy monitoring and control.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    AppLoggerModule.forRoot(),
    EtlModule, // For ETL pipeline execution
    DatabaseModule, // For Qdrant health checks
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {} 