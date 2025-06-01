import { Module } from '@nestjs/common';
import { TelegramSubscriberService } from './subscriber.service';
import { CoreModule } from '../../core/core.module';
import { TelegramPublisherService } from './publisher.service';
import { OrchestratorModule } from '../../orchestrator/orchestrator.module';

@Module({
  imports: [CoreModule, OrchestratorModule],
  providers: [TelegramSubscriberService, TelegramPublisherService],
  exports: [TelegramSubscriberService, TelegramPublisherService],
})
export class TelegramModule {}
