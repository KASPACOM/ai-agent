import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// === OpenServ-Specific Services Only ===
import { OpenServConfigurationService } from './openserv.config';
import { OpenServSubscriberService } from './subscriber.service';
import { OpenServPublisherService } from './publisher.service';
import { SessionStorageService } from './session-storage.service';
import { IntentRecognitionService } from './intent-recognition.service';

@Module({
  imports: [ConfigModule],
  providers: [
    // === OpenServ Configuration ===
    OpenServConfigurationService,

    // === OpenServ Session & Memory Management ===
    SessionStorageService,
    IntentRecognitionService,

    // === OpenServ Communication Layer ===
    OpenServSubscriberService,
    OpenServPublisherService,
  ],
  exports: [
    // === Configuration ===
    OpenServConfigurationService,

    // === Session & Workflow Management ===
    SessionStorageService,
    IntentRecognitionService,

    // === Communication Services ===
    OpenServSubscriberService,
    OpenServPublisherService,
  ],
})
export class OpenServModule {}
