import { Module } from '@nestjs/common';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
  providers: [PromptBuilderService],
  exports: [PromptBuilderService],
})
export class PromptBuilderModule {}
