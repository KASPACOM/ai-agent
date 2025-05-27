import { Module } from '@nestjs/common';
import { OpenServService } from './openserv.service';
import { OpenServController } from './openserv.controller';
import { KaspaCapabilityService } from './capabilities/kaspa-capability.service';
import { AnalysisCapabilityService } from './capabilities/analysis-capability.service';

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