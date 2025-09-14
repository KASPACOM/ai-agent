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
import { AccountRotationService } from './account-rotation.service';
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

  /**
   * Backfill all configured accounts in batches of up to 10 requests per run (~900 tweets),
   * with a 15-minute cooldown between batches per account, until no more data.
   * - Initializes/updates RAW history via AccountRotationService
   * - Dedupe via TwitterRawStorageService.storeBatch
   * - Persists progress pointers (earliest/latest and backfill markers)
   */
  async runBackfillIndexing(): Promise<IndexingResult> {
    const startTime = new Date();
    let totalStored = 0;
    const errors: string[] = [];

    try {
      const accounts = this.appConfig.getTwitterBackfillAccountsConfig || [];
      if (accounts.length === 0) {
        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          processingTime: 0,
          startTime,
          endTime: new Date(),
          rateLimited: false,
          hasMoreData: false,
          requestsUsed: 0,
        };
      }

      const client = new TwitterApi(this.appConfig.getTwitterBearerToken)
        .readOnly;

      // Iterate one by one as requested
      for (const usernameRaw of accounts) {
        const username = (usernameRaw || '')
          .trim()
          .replace(/^@+/, '')
          .toLowerCase();
        try {
          // Initialize history doc with backfillComplete=false on first pass
          const status = await this.rotation.getStatus(username);
          if (!status || status.backfillComplete === undefined) {
            await this.rotation.updateAccountStatus(username, {
              backfillComplete: false,
            });
          }

          // Load pointers
          let lastId = status?.backfillLastId;
          let lastDate = status?.backfillLastDate;

          if (!status?.backfillComplete) {
            // Preload existing IDs for this account to avoid duplicate upserts
            const existingForUser =
              await this.storage.getAllRawTweets(username);
            const existingIds = new Set<string>(
              existingForUser.map((t) => String(t.id)),
            );

            // One batch = up to 10 requests, 100 tweets per request
            const pageLimit = 10;
            const nowIso = new Date().toISOString();
            const user = await client.v2.userByUsername(username);
            let token: string | undefined = undefined;
            let requestsUsed = 0;
            const newTweets: RawTweetRecord[] = [];
            let reachedEnd = false;
            let batchEarliest: { id: string; createdAt: string } | undefined;

            while (requestsUsed < pageLimit) {
              try {
                const params: any = {
                  max_results: 100,
                  'tweet.fields': twitterTimelineFields['tweet.fields'],
                  expansions: twitterTimelineFields.expansions,
                  'user.fields': twitterTimelineFields['user.fields'],
                  'media.fields': twitterTimelineFields['media.fields'],
                  'place.fields': twitterTimelineFields['place.fields'],
                  'poll.fields': twitterTimelineFields['poll.fields'],
                  // pagination_token added conditionally below
                };
                // Resume from last backfill pointer only on the first page
                if (!token) {
                  if (lastId) {
                    params.until_id = String(lastId);
                  } else if (lastDate) {
                    const iso = new Date(lastDate)
                      .toISOString()
                      .replace(/\.\d{3}Z$/, 'Z');
                    params.end_time = iso;
                  }
                }
                if (token) {
                  params.pagination_token = token;
                }
                this.logger.debug(
                  `RAW backfill request params for @${username}: ${JSON.stringify(
                    params,
                  )}`,
                );

                const page = await client.v2.userTimeline(user.data.id, params);
                const data = page.data?.data || [];
                for (const t of data) {
                  const createdAt = new Date(t.created_at).toISOString();
                  const id = String(t.id);
                  // Track the earliest tweet seen in the batch (regardless of duplicate)
                  if (!batchEarliest || createdAt < batchEarliest.createdAt) {
                    batchEarliest = { id, createdAt };
                  }
                  // Only queue for storage if not already in DB
                  if (!existingIds.has(id)) {
                    newTweets.push({
                      id,
                      username,
                      createdAt,
                      payload: t as unknown as Record<string, unknown>,
                      fetchedAt: nowIso,
                    });
                    existingIds.add(id);
                  }
                }

                const next = page.data?.meta?.next_token;
                if (!next) {
                  reachedEnd = true;
                  break;
                }
                token = next;
              } catch (err: any) {
                // Enhanced error diagnostics to understand 404s/param issues
                this.logger.error(
                  `RAW backfill request failed for @${username}: status=${err?.status || err?.code} ` +
                    `${err?.data?.title ? `title=${err.data.title} ` : ''}` +
                    `${err?.data?.detail ? `detail=${err.data.detail} ` : ''}` +
                    `${err?.data?.type ? `type=${err.data.type}` : ''}`,
                );
                if (err?.code === 429 || err?.status === 429) {
                  errors.push(`Rate limited for @${username}`);
                  break;
                }
                throw err;
              } finally {
                requestsUsed++;
              }
              let storedThisBatch = 0;
              if (newTweets.length > 0) {
                const res = await this.storage.storeBatch(newTweets);
                storedThisBatch = res.stored;
                totalStored += res.stored;
              }

              // Update pointers based on batch earliest seen (even if all duplicates)
              if (batchEarliest) {
                lastId = batchEarliest.id;
                lastDate = batchEarliest.createdAt;
              }

              await this.rotation.updateAccountStatus(username, {
                messagesIndexed: storedThisBatch,
                hasMoreData: !reachedEnd,
                earliestTweetDate: batchEarliest?.createdAt,
                earliestTweetId: batchEarliest?.id as any,
                backfillComplete: reachedEnd,
                backfillLastId: lastId,
                backfillLastDate: lastDate,
              });

              // If not complete, cooldown 15 minutes before next batch
              const cooldownMs = 15 * 60 * 1000;
              const updated = await this.rotation.getStatus(username);
              if (!updated?.backfillComplete) {
                await this.sleep(cooldownMs);
              }
            }
          }
        } catch (e: any) {
          errors.push(`@${username}: ${e.message}`);
        }
      }

      return {
        success: errors.length === 0,
        processed: totalStored,
        embedded: 0,
        stored: totalStored,
        errors,
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
        rateLimited: errors.some((e) => e.includes('Rate limited')),
        hasMoreData: false,
      };
    } catch (error: any) {
      return {
        success: false,
        processed: totalStored,
        embedded: 0,
        stored: totalStored,
        errors: [error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
        rateLimited: false,
        hasMoreData: false,
      };
    }
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
        3,
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
          const status = await this.rotation.getStatus(sel.account);
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

          await this.rotation.updateAccountStatus(sel.account, {
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
          });

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
