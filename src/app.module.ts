import { Module, DynamicModule } from '@nestjs/common';
import { CoreModule } from './modules/core/core.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { EtlModule } from './modules/etl/etl.module';
import { MultiAgentModule } from './modules/multiagent/multiagent.module';

@Module({})
export class AppModule {
  static forRoot(): DynamicModule {
    const serviceType = process.env.SERVICE_TYPE;

    console.log(`🚀 Starting application in ${serviceType} mode`);

    // Base modules that are always loaded
    const baseModules = [CoreModule];

    // Conditional modules based on service type
    let serviceModules: any[] = [];

    if (serviceType === 'ETL') {
      // ETL Service Mode - Data processing and indexing only
      serviceModules = [EtlModule];
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
        `⚠️  Unknown SERVICE_TYPE: ${serviceType}. Defaulting to ETL mode.`,
      );
      serviceModules = [EtlModule];
    }

    return {
      module: AppModule,
      imports: [...baseModules, ...serviceModules],
      providers: [],
    };
  }
}
