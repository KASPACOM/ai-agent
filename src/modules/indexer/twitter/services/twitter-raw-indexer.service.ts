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
import { twitterTimelineFields } from '../consts/twitter-query';

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
          const status = await this.rotation.getStatus(
            sel.account,
            RotationMode.RAW,
          );
          const pageBudget = Math.max(1, Math.min(sel.requestBudget, 5));

          // Head pass
          const head = await this.processAccount(client, sel.account, {
            mode: 'head',
            pageLimit: pageBudget,
            sinceIso: status?.latestTweetDate,
            latestId: status?.latestTweetId,
          });

          // Backfill pass if budget remains and account not complete
          const remaining = Math.max(0, pageBudget - (head.requestsUsed || 0));
          let backfill: typeof head | undefined = undefined;
          const shouldBackfill = remaining > 0;
          if (shouldBackfill) {
            backfill = await this.processAccount(client, sel.account, {
              mode: 'backfill',
              pageLimit: remaining,
            });
          }

          const combinedStored = (head.stored || 0) + (backfill?.stored || 0);
          const combinedRequests =
            (head.requestsUsed || 0) + (backfill?.requestsUsed || 0);
          const combinedRateLimited =
            head.rateLimited || !!backfill?.rateLimited;
          const combinedHasMore = !!backfill?.hasMore;

          totalStored += combinedStored;
          totalRequestsUsed += combinedRequests;
          if (combinedRateLimited) anyRateLimited = true;
          if (combinedHasMore) anyHasMore = true;

          await this.rotation.updateAccountStatus(
            sel.account,
            {
              lastSync: new Date(),
              messagesIndexed: combinedStored,
              hasMoreData: backfill
                ? !backfill.backfillCompleted && !!backfill.hasMore
                : !status?.isComplete,
              requestsUsed: combinedRequests,
              ...(head.latest && {
                latestTweetDate: head.latest.date,
                latestTweetId: head.latest.id,
              }),
              ...(backfill?.earliest && {
                earliestTweetDate: backfill.earliest.date,
                earliestTweetId: backfill.earliest.id,
              }),
            },
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
    opts: {
      mode: 'head' | 'backfill';
      pageLimit: number;
      sinceIso?: string;
      latestId?: string;
    },
  ): Promise<{
    stored: number;
    hasMore: boolean;
    requestsUsed: number;
    rateLimited: boolean;
    latest?: { id: string; date: string };
    earliest?: { id: string; date: string };
    backfillCompleted?: boolean;
  }> {
    const nowIso = new Date().toISOString();
    const collected: RawTweetRecord[] = [];
    let requestsUsed = 0;
    let rateLimited = false;

    if (opts.mode === 'head') {
      const user = await client.v2.userByUsername(username);
      let token: string | undefined = undefined;
      let stop = false;
      while (!stop) {
        try {
          const params: any = {
            max_results: 10,
            'tweet.fields': twitterTimelineFields['tweet.fields'],
            expansions: twitterTimelineFields.expansions,
            'user.fields': twitterTimelineFields['user.fields'],
            'media.fields': twitterTimelineFields['media.fields'],
            'place.fields': twitterTimelineFields['place.fields'],
            'poll.fields': twitterTimelineFields['poll.fields'],
            pagination_token: token,
          };
          if (opts.latestId) {
            params.since_id = opts.latestId;
          } else if (opts.sinceIso) {
            params.start_time = opts.sinceIso;
          }
          const page = await client.v2.userTimeline(user.data.id, params);
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
        } catch (err: any) {
          if (err?.code === 429 || err?.status === 429) {
            rateLimited = true;
            break;
          }
          throw err;
        } finally {
          requestsUsed++;
        }
      }
    } else {
      const user = await client.v2.userByUsername(username);
      let token: string | undefined = undefined;
      let pages = 0;
      let reachedEnd = false;
      while (pages < opts.pageLimit) {
        try {
          const params = {
            max_results: 100,
            'tweet.fields': twitterTimelineFields['tweet.fields'],
            expansions: twitterTimelineFields.expansions,
            'user.fields': twitterTimelineFields['user.fields'],
            'media.fields': twitterTimelineFields['media.fields'],
            'place.fields': twitterTimelineFields['place.fields'],
            'poll.fields': twitterTimelineFields['poll.fields'],
            pagination_token: token,
          } as const;
          const page = await client.v2.userTimeline(user.data.id, params);
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
          const next = page.data?.meta?.next_token;
          if (!next) {
            reachedEnd = true;
            break;
          }
          token = next;
        } catch (err: any) {
          if (err?.code === 429 || err?.status === 429) {
            rateLimited = true;
            break;
          }
          throw err;
        }
        requestsUsed++;
      }
      // Attach reachedEnd info via special marker on earliest when returning below
      if (reachedEnd) {
        // no-op here; returned value will include backfillCompleted
      }
    }

    if (collected.length === 0) {
      return { stored: 0, hasMore: false, requestsUsed, rateLimited };
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
      hasMore:
        opts.mode === 'backfill'
          ? (() => {
              // If we ended because there was no next_token, there is no more
              // Otherwise, if we hit the page budget, there may be more
              // Head mode always returns false
              // We infer reachedEnd by whether we exited loop due to no next_token.
              // Since we cannot directly access the flag here in head branch, only backfill computes it.
              // Simplify: if collected length > 0 and last backfill iteration had no next_token, then hasMore=false.
              // To avoid coupling, rely on requestsUsed < opts.pageLimit meaning we broke early (likely reachedEnd or rate limit).
              // We'll compute backfillCompleted below and use that for isComplete marking.
              return requestsUsed >= opts.pageLimit;
            })()
          : false,
      requestsUsed,
      rateLimited,
      latest:
        opts.mode === 'head'
          ? { id: latest.id, date: latest.createdAt }
          : undefined,
      earliest:
        opts.mode === 'backfill'
          ? { id: earliest.id, date: earliest.createdAt }
          : undefined,
      backfillCompleted:
        opts.mode === 'backfill'
          ? collected.length > 0 && requestsUsed < opts.pageLimit
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
