import { Injectable, Logger } from '@nestjs/common';
import {
  BaseIndexerService,
  IndexerConfig,
} from '../../shared/services/base-indexer.service';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { MessageSource } from '../../shared/models/message-source.enum';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { TwitterApi, TwitterApiReadOnly } from 'twitter-api-v2';
import { AppConfigService } from '../../../core/modules/config/app-config.service';
import {
  AccountRotationService,
  RotationMode,
} from './account-rotation.service';
import {
  TwitterRawStorageService,
  RawTweetRecord,
} from './twitter-raw-storage.service';

@Injectable()
export class TwitterRawIndexerService extends BaseIndexerService {
  protected readonly logger = new Logger(TwitterRawIndexerService.name);

  constructor(
    unifiedStorage: UnifiedStorageService,
    private readonly config: IndexerConfigService,
    private readonly appConfig: AppConfigService,
    private readonly rotation: AccountRotationService,
    private readonly storage: TwitterRawStorageService,
  ) {
    super(unifiedStorage);
  }

  protected async executeIndexingProcess(): Promise<IndexingResult> {
    const startTime = new Date();
    let totalStored = 0;
    let totalRequestsUsed = 0;
    let anyRateLimited = false;
    let anyHasMore = false;
    const errors: string[] = [];

    try {
      const requestLimit = this.config.getTwitterRequestLimit();
      const selected = await this.rotation.selectAccountsForProcessing(
        requestLimit,
        RotationMode.RAW,
      );

      if (selected.length === 0) {
        const endTimeNoSel = new Date();
        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          processingTime: endTimeNoSel.getTime() - startTime.getTime(),
          startTime,
          endTime: endTimeNoSel,
          rateLimited: false,
          hasMoreData: false,
        };
      }

      const client = new TwitterApi(this.appConfig.getTwitterBearerToken)
        .readOnly;

      for (const sel of selected) {
        try {
          const status = await (this.rotation as any).getAccountStatus?.(
            sel.account,
            RotationMode.RAW,
          );
          const isBackfill = !status?.lastFullSync || !status?.isComplete;
          const pageBudget = Math.max(1, Math.min(sel.requestBudget, 5));

          const { stored, latest, earliest, hasMore, requestsUsed, rateLimited } =
            await this.processAccount(client, sel.account, {
              mode: isBackfill ? 'backfill' : 'head',
              pageLimit: pageBudget,
              sinceIso: status?.latestTweetDate,
            });

          totalStored += stored;
          totalRequestsUsed += requestsUsed;
          if (rateLimited) anyRateLimited = true;
          if (hasMore) anyHasMore = true;

          await this.rotation.updateAccountStatus(
            sel.account,
            {
              lastSync: new Date(),
              messagesIndexed: stored,
              hasMoreData: !!hasMore,
              requestsUsed,
              ...(latest && {
                latestTweetDate: latest.date,
                latestTweetId: latest.id,
              }),
              ...(earliest && {
                earliestTweetDate: earliest.date,
                earliestTweetId: earliest.id,
              }),
            } as any,
            RotationMode.RAW,
          );

          await this.sleep(this.getIndexerConfig().processingDelayMs);
        } catch (err) {
          errors.push(`Failed ${sel.account}: ${err.message}`);
        }
      }

      const endTime = new Date();
      return {
        success: errors.length === 0,
        processed: totalStored,
        embedded: 0,
        stored: 0,
        errors,
        processingTime: endTime.getTime() - startTime.getTime(),
        startTime,
        endTime,
        rateLimited: anyRateLimited,
        hasMoreData: anyHasMore,
        requestsUsed: totalRequestsUsed,
      };
    } catch (error) {
      return {
        success: false,
        processed: totalStored,
        embedded: 0,
        stored: 0,
        errors: [...errors, error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
        rateLimited: anyRateLimited,
        hasMoreData: anyHasMore,
        requestsUsed: totalRequestsUsed,
      };
    }
  }

  private async processAccount(
    client: TwitterApiReadOnly,
    username: string,
    opts: { mode: 'head' | 'backfill'; pageLimit: number; sinceIso?: string },
  ): Promise<{
    stored: number;
    hasMore: boolean;
    latest?: { id: string; date: string };
    earliest?: { id: string; date: string };
  }> {
    const nowIso = new Date().toISOString();
    const collected: RawTweetRecord[] = [];

    if (opts.mode === 'head') {
      // Use the generic API service behavior via client pagination but stop at sinceIso
      const user = await client.v2.userByUsername(username);
      let token: string | undefined = undefined;
      let stop = false;
      while (!stop) {
        const page = await client.v2.userTimeline(user.data.id, {
          max_results: 100,
          'tweet.fields': [
            'id',
            'text',
            'author_id',
            'conversation_id',
            'created_at',
            'public_metrics',
            'lang',
            'context_annotations',
            'entities',
            'referenced_tweets',
            'note_tweet',
          ],
          expansions: ['author_id'],
          'user.fields': ['id', 'name', 'username', 'verified'],
          pagination_token: token,
        });
        const data = page.data?.data || [];
        for (const t of data) {
          const createdAt = new Date(t.created_at);
          if (opts.sinceIso && createdAt <= new Date(opts.sinceIso)) {
            stop = true;
            break;
          }
          collected.push({
            id: String(t.id),
            username: username.toLowerCase(),
            createdAt: createdAt.toISOString(),
            payload: t as unknown as Record<string, unknown>,
            fetchedAt: nowIso,
          });
        }
        if (stop || !page.data?.meta?.next_token) break;
        token = page.data.meta.next_token;
      }
    } else {
      const user = await client.v2.userByUsername(username);
      let token: string | undefined = undefined;
      let pages = 0;
      while (pages < opts.pageLimit) {
        const page = await client.v2.userTimeline(user.data.id, {
          max_results: 100,
          'tweet.fields': [
            'id',
            'text',
            'author_id',
            'conversation_id',
            'created_at',
            'public_metrics',
            'lang',
            'context_annotations',
            'entities',
            'referenced_tweets',
            'note_tweet',
          ],
          expansions: ['author_id'],
          'user.fields': ['id', 'name', 'username', 'verified'],
          pagination_token: token,
        });
        const data = page.data?.data || [];
        for (const t of data) {
          const createdAt = new Date(t.created_at);
          collected.push({
            id: String(t.id),
            username: username.toLowerCase(),
            createdAt: createdAt.toISOString(),
            payload: t as unknown as Record<string, unknown>,
            fetchedAt: nowIso,
          });
        }
        pages++;
        if (!page.data?.meta?.next_token) break;
        token = page.data.meta.next_token;
      }
    }

    if (collected.length === 0) {
      return { stored: 0, hasMore: false };
    }

    // Determine latest/earliest
    const sorted = [...collected].sort((a, b) =>
      a.createdAt > b.createdAt ? -1 : 1,
    );
    const latest = sorted[0];
    const earliest = sorted[sorted.length - 1];

    const res = await this.storage.storeBatch(collected);

    return {
      stored: res.stored,
      hasMore: opts.mode === 'backfill' ? collected.length > 0 : false,
      latest:
        opts.mode === 'head'
          ? { id: latest.id, date: latest.createdAt }
          : undefined,
      earliest:
        opts.mode === 'backfill'
          ? { id: earliest.id, date: earliest.createdAt }
          : undefined,
    };
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
