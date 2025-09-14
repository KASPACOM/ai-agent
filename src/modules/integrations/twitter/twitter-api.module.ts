import { Module } from '@nestjs/common';
import { TwitterApiService } from './twitter-api.service';
import { AppConfigModule } from 'src/modules/core/modules/config/app-config.module';
import { TelegramModule } from '../telegram/telegram.module';
import { OpenAiAdapter } from 'src/modules/llm/openai.service';

@Module({
  imports: [TelegramModule, AppConfigModule],
  providers: [TwitterApiService, OpenAiAdapter],
  exports: [TwitterApiService],
})
export class TwitterApiModule {}
