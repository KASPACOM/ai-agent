import { Module } from '@nestjs/common';
import { CoreModule } from './modules/core/core.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';

@Module({
  imports: [CoreModule, OrchestratorModule, TasksModule, IntegrationsModule],
  providers: [],
})
export class AppModule {}
