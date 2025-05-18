import { Module } from '@nestjs/common';
import { TelegramSubscriberService } from './subscriber.service';
import { CoreModule } from '../../core/core.module';
import { TelegramPublisherService } from './publisher.service';

@Module({
  imports: [CoreModule],
  providers: [TelegramSubscriberService, TelegramPublisherService],
  exports: [TelegramSubscriberService, TelegramPublisherService],
})
export class TelegramModule {}
