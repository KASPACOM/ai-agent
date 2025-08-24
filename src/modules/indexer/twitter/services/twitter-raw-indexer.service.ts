import { Injectable, Logger } from '@nestjs/common';
import {
  BaseIndexerService,
  IndexerConfig,
} from '../../shared/services/base-indexer.service';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { MessageSource } from '../../shared/models/message-source.enum';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { TwitterRawCollectorService } from './twitter-raw-collector.service';

@Injectable()
export class TwitterRawIndexerService extends BaseIndexerService {
  protected readonly logger = new Logger(TwitterRawIndexerService.name);

  constructor(
    unifiedStorage: UnifiedStorageService,
    private readonly config: IndexerConfigService,
    private readonly collector: TwitterRawCollectorService,
  ) {
    super(unifiedStorage);
  }

  protected async executeIndexingProcess(): Promise<IndexingResult> {
    const startTime = new Date();
    try {
      const requestLimit = this.config.getTwitterRequestLimit();
      const res = await this.collector.collectBatch(requestLimit);

      const endTime = new Date();
      return {
        success: true,
        processed: res.stored,
        embedded: 0,
        stored: 0,
        errors: [],
        processingTime: endTime.getTime() - startTime.getTime(),
        startTime,
        endTime,
        rateLimited: false,
        hasMoreData: false,
      };
    } catch (error) {
      return {
        success: false,
        processed: 0,
        embedded: 0,
        stored: 0,
        errors: [error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
        rateLimited: false,
        hasMoreData: false,
      };
    }
  }

  protected getIndexerConfig(): IndexerConfig {
    return {
      serviceName: 'TwitterRawIndexer',
      source: MessageSource.TWITTER,
      batchSize: this.config.getDefaultBatchSize(),
      maxRetries: this.config.getMaxRetries(),
      processingDelayMs: this.config.getDefaultProcessingDelayMs(),
    };
  }
}
