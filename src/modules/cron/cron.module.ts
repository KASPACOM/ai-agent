import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

// Import indexer services for cron jobs
import { TwitterModule } from '../indexer/twitter/twitter.module';
import { TelegramModule } from '../indexer/telegram/telegram.module';
import { TelegramCron } from './cron-jobs/telegram.cron';
import { TwitterCron } from './cron-jobs/twitter.cron';
import { AppConfigModule } from '../core/modules/config/app-config.module';

/**
 * Centralized Cron Module using @nestjs/schedule
 *
 * This module centralizes all cron job management for the application.
 * It uses NestJS built-in scheduler for better integration and features.
 * 
 * Scheduled tasks include:
 * - Twitter indexing
 * - Telegram indexing
 * - Future scheduled tasks
 *
 * Features:
 * - Centralized cron job registration and management
 * - REST API endpoints for cron job control
 * - Status monitoring and logging
 * - Easy addition of new scheduled tasks
 * - Dynamic scheduling with @nestjs/schedule
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    TwitterModule, // Import to access Twitter indexer services
    TelegramModule, // Import to access Telegram indexer services
    AppConfigModule,
  ],
  providers: [TelegramCron, TwitterCron],
  exports: [],
})
export class CronModule {}
