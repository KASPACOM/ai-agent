import {Module} from '@nestjs/common';
import {BackendModule} from './modules/backend/backend.module';
import {CoreModule} from './modules/core/core.module';
import {OrchestratorModule} from './modules/orchestrator/orchestrator.module';
import {TasksModule} from './modules/tasks/tasks.module';
import {IntegrationsModule} from './modules/integrations/integrations.module';

@Module({
    imports: [
        CoreModule,
        BackendModule,
        OrchestratorModule,
        TasksModule,
        IntegrationsModule
    ],
    providers: [],
})
export class AppModule {
}
