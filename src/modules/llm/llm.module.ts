import { Module } from '@nestjs/common';
import { AppConfigModule } from '../core/modules/config/app-config.module';
import { OpenAiAdapter } from './openai.service';

@Module({
  imports: [AppConfigModule],
  providers: [OpenAiAdapter],
  exports: [OpenAiAdapter],
})
export class LlmModule {}


