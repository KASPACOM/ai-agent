import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// === OpenServ Core Services ===
import { OpenServConfigurationService } from './openserv.config';
import { OpenServController } from './openserv.controller';

// === OpenServ Communication Layer ===
import { OpenServSubscriberService } from './subscriber.service';
import { OpenServPublisherService } from './publisher.service';

/**
 * OpenServModule
 *
 * Handles external OpenServ integration including:
 * - Pub/Sub messaging with OpenServ platform
 * - External API communication
 * - OpenServ-specific configuration
 *
 * NOTE: Core orchestration services (Intent, LLM routing, Session) moved to OrchestratorModule
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [OpenServController],
  providers: [
    // === OpenServ Configuration ===
    OpenServConfigurationService,

    // === OpenServ Communication Layer ===
    OpenServSubscriberService,
    OpenServPublisherService,
  ],
  exports: [
    // === OpenServ Configuration ===
    OpenServConfigurationService,

    // === OpenServ Communication Layer ===
    OpenServSubscriberService,
    OpenServPublisherService,
  ],
})
export class OpenServModule {}
