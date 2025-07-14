import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { AppConfigModule } from './modules/config/app-config.module';
import { AppLoggerModule } from './modules/logger/app-logger.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Module({
  controllers: [HealthController],
  imports: [
    AppConfigModule,
    AppLoggerModule.forRoot(),
    TerminusModule,
    SchedulerModule,
  ],
})
export class CoreModule {}
