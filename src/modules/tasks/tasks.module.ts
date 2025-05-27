import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [CoreModule],
  providers: [
    // Task providers will be added here
  ],
  exports: [],
})
export class TasksModule {}
