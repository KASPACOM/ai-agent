import { Injectable, Logger } from '@nestjs/common';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { MessageSource } from '../../shared/models/message-source.enum';
import { TwitterRawStorageService } from './twitter-raw-storage.service';
import { TwitterMasterDocumentTransformer } from '../transformers/twitter-master-document.transformer';
import { MasterDocument } from '../../shared/models/master-document.model';

@Injectable()
export class TwitterDocGenerationService {
  private readonly logger = new Logger(TwitterDocGenerationService.name);

  constructor(
    private readonly storage: UnifiedStorageService,
    private readonly config: IndexerConfigService,
    private readonly rawStorage: TwitterRawStorageService,
  ) {}

  /**
   * Generate and store MasterDocuments for tweets newer than the last indexed point
   */
  async runForAccount(username: string): Promise<{ stored: number }> {
    const latest = await this.storage.getLatestMessageDate(
      MessageSource.TWITTER,
      username,
    );
    const sinceIso = latest ? latest.toISOString() : new Date(0).toISOString();
    const rawTweets = await this.rawStorage.querySince(
      username.toLowerCase(),
      sinceIso,
    );
    if (rawTweets.length === 0) return { stored: 0 };

    const docs: MasterDocument[] = rawTweets.map((t) =>
      TwitterMasterDocumentTransformer.transformTweetToMasterDocument(
        t.payload,
        username,
      ),
    );
    const result = await this.storage.storeBatch(docs);
    return { stored: result.stored };
  }
}


