import { Module, DynamicModule } from '@nestjs/common';
import { CoreModule } from './modules/core/core.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { MultiAgentModule } from './modules/multiagent/multiagent.module';
import { IndexerModule } from './modules/indexer/indexer.module';
import { CronModule } from './modules/cron/cron.module';

@Module({})
export class AppModule {
  static forRoot(): DynamicModule {
    const serviceType = process.env.SERVICE_TYPE;

    console.log(`🚀 Starting application in ${serviceType} mode`);

    // Base modules that are always loaded
    const baseModules = [CoreModule];

    // Conditional modules based on service type
    let serviceModules: any[] = [];
    let serviceProviders: any[] = [];

    if (serviceType === 'ETL') {
      // ETL Service Mode - Data processing and indexing only
      serviceModules = [
        CronModule,
      ];
      console.log('📊 Loading ETL modules: Data processing and indexing');
    } else if (serviceType === 'AGENT') {
      // Agent Service Mode - AI orchestration and multi-agent system
      serviceModules = [
        OrchestratorModule,
        TasksModule,
        IntegrationsModule,
        MultiAgentModule,
      ];
      console.log(
        '🤖 Loading Agent modules: Orchestrator, tasks, integrations, and multi-agent system',
      );
    } else {
      console.warn(
        `⚠️  Unknown SERVICE_TYPE: ${serviceType}.`,
      );
    }

    return {
      module: AppModule,
      imports: [...baseModules, ...serviceModules],
      providers: [...serviceProviders],
    };
  }
}
