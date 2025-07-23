import { Module } from '@nestjs/common';
import { TwitterApiService } from './twitter-api.service';
import { AppConfigModule } from 'src/modules/core/modules/config/app-config.module';

@Module({
  providers: [AppConfigModule, TwitterApiService],
  exports: [TwitterApiService],
})
export class TwitterApiModule {}
