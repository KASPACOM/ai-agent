import { Module } from '@nestjs/common';
import { TelegramModule } from './telegram/telegram.module';
import { OpenServModule } from './openserv/openserv.module';

@Module({
  imports: [TelegramModule, OpenServModule],
  exports: [TelegramModule, OpenServModule],
})
export class IntegrationsModule {}
