import { Module } from '@nestjs/common';
import { OpenServController } from './openserv.controller';
import { KaspaCapabilityService } from './capabilities/kaspa-capability.service';
import { AnalysisCapabilityService } from './capabilities/analysis-capability.service';
import { OpenServService } from './openserv.service';

@Module({
  providers: [
    OpenServService,
    KaspaCapabilityService,
    AnalysisCapabilityService,
  ],
  controllers: [OpenServController],
  exports: [OpenServService],
})
export class OpenServModule {}
