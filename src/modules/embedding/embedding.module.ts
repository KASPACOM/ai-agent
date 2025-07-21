import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { EtlConfigService } from '../etl/config/etl.config';

@Module({
  providers: [EmbeddingService, EtlConfigService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {} 