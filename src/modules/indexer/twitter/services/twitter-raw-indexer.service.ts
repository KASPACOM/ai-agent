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
import { AccountState } from '../models/account-state.enum';
import {
  FirstRunBackfillResult,
  FetchNewTweetsResult,
  ContinueBackfillResult,
  AccountStatusUpdate,
} from '../models/backfill-results.model';
import { AccountStatus } from '../models/account-status.model';
import { TwitterTimelineParams } from '../models/twitter-api-params.model';

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

                const page = await client.v2.userTimeline(
                  user.data.id,
                  params as any,
                );
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

  /**
   * Determine account state based on sync status
   */
  private determineAccountState(status: AccountStatus | null): AccountState {
    if (!status || status.syncedTweets === 0) {
      return AccountState.NEW;
    }
    if (status.backfillComplete) {
      return AccountState.COMPLETE;
    }
    return AccountState.ACTIVE;
  }

  /**
   * First-run backfill for brand new accounts
   * Fetches from newest → oldest until budget exhausted or account complete
   */
  private async firstRunBackfill(
    client: TwitterApiReadOnly,
    username: string,
    requestBudget: number,
  ): Promise<FirstRunBackfillResult> {
    this.logger.log(
      `🆕 First-run backfill for @${username} with ${requestBudget} requests`,
    );

    const nowIso = new Date().toISOString();
    const collected: RawTweetRecord[] = [];
    let requestsUsed = 0;
    let paginationToken: string | undefined;
    let reachedEnd = false;

    try {
      const user = await client.v2.userByUsername(username);

      while (requestsUsed < requestBudget && !reachedEnd) {
        const params: TwitterTimelineParams = {
          max_results: 100,
          'tweet.fields': twitterTimelineFields['tweet.fields'],
          expansions: twitterTimelineFields.expansions,
          'user.fields': twitterTimelineFields['user.fields'],
          'media.fields': twitterTimelineFields['media.fields'],
          'place.fields': twitterTimelineFields['place.fields'],
          'poll.fields': twitterTimelineFields['poll.fields'],
          pagination_token: paginationToken,
        };

        const page = await client.v2.userTimeline(user.data.id, params as any);
        const data = page.data?.data || [];

        for (const t of data) {
          collected.push({
            id: String(t.id),
            username: username.toLowerCase(),
            createdAt: new Date(t.created_at).toISOString(),
            payload: t as unknown as Record<string, unknown>,
            fetchedAt: nowIso,
          });
        }

        requestsUsed++;

        const nextToken = page.data?.meta?.next_token;
        if (!nextToken) {
          reachedEnd = true;
          break;
        }
        paginationToken = nextToken;
      }

      // Store all collected tweets
      let stored = 0;
      if (collected.length > 0) {
        const res = await this.storage.storeBatch(collected);
        stored = res.stored;

        // Sort to find latest/earliest
        const sorted = [...collected].sort((a, b) =>
          a.createdAt > b.createdAt ? -1 : 1,
        );
        const latest = sorted[0];
        const earliest = sorted[sorted.length - 1];

        this.logger.log(
          `✅ First-run backfill @${username}: ${stored} tweets stored, ${requestsUsed} requests used${reachedEnd ? ' (COMPLETE)' : ''}`,
        );

        return {
          stored,
          requestsUsed,
          completed: reachedEnd,
          latestTweetId: latest.id,
          latestTweetDate: latest.createdAt,
          earliestTweetId: earliest.id,
          earliestTweetDate: earliest.createdAt,
        };
      }

      return {
        stored: 0,
        requestsUsed,
        completed: reachedEnd,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ First-run backfill failed for @${username}: ${err.message}`,
      );
      throw err;
    }
  }

  /**
   * Fetch new tweets (HEAD pass)
   * Gets tweets NEWER than latestTweetId
   */
  private async fetchNewTweets(
    client: TwitterApiReadOnly,
    username: string,
    latestTweetId: string | null,
    latestTweetDate: string | null,
    maxRequests: number,
  ): Promise<FetchNewTweetsResult> {
    this.logger.debug(
      `📥 Fetching new tweets for @${username} (since ${latestTweetId || latestTweetDate})`,
    );

    const nowIso = new Date().toISOString();
    const collected: RawTweetRecord[] = [];
    let requestsUsed = 0;
    let paginationToken: string | undefined;

    try {
      const user = await client.v2.userByUsername(username);

      while (requestsUsed < maxRequests) {
        const params: TwitterTimelineParams = {
          max_results: 50, // Increased from 10 for efficiency
          'tweet.fields': twitterTimelineFields['tweet.fields'],
          expansions: twitterTimelineFields.expansions,
          'user.fields': twitterTimelineFields['user.fields'],
          'media.fields': twitterTimelineFields['media.fields'],
          'place.fields': twitterTimelineFields['place.fields'],
          'poll.fields': twitterTimelineFields['poll.fields'],
          pagination_token: paginationToken,
          since_id:
            !paginationToken && latestTweetId ? latestTweetId : undefined,
          start_time:
            !paginationToken && !latestTweetId && latestTweetDate
              ? latestTweetDate
              : undefined,
        };

        const page = await client.v2.userTimeline(user.data.id, params as any);
        const data = page.data?.data || [];

        let shouldStop = false;
        for (const t of data) {
          const createdAt = new Date(t.created_at);
          // Stop if we've reached tweets we already have
          if (latestTweetDate && createdAt <= new Date(latestTweetDate)) {
            shouldStop = true;
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

        requestsUsed++;

        if (shouldStop || !page.data?.meta?.next_token) {
          break;
        }
        paginationToken = page.data.meta.next_token;
      }

      // Store collected tweets
      let stored = 0;
      if (collected.length > 0) {
        const res = await this.storage.storeBatch(collected);
        stored = res.stored;

        const sorted = [...collected].sort((a, b) =>
          a.createdAt > b.createdAt ? -1 : 1,
        );
        const latest = sorted[0];

        this.logger.debug(
          `✅ Fetched new tweets for @${username}: ${stored} stored, ${requestsUsed} requests`,
        );

        return {
          stored,
          requestsUsed,
          latestTweetId: latest.id,
          latestTweetDate: latest.createdAt,
        };
      }

      return { stored: 0, requestsUsed };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Fetch new tweets failed for @${username}: ${err.message}`,
      );
      throw err;
    }
  }

  /**
   * Continue backfill for accounts with partial history
   * Fetches tweets OLDER than earliestTweetId
   */
  private async continueBackfill(
    client: TwitterApiReadOnly,
    username: string,
    earliestTweetId: string | null,
    earliestTweetDate: string | null,
    requestBudget: number,
  ): Promise<ContinueBackfillResult> {
    this.logger.debug(
      `⏪ Continue backfill for @${username} (until ${earliestTweetId || earliestTweetDate})`,
    );

    const nowIso = new Date().toISOString();
    const collected: RawTweetRecord[] = [];
    let requestsUsed = 0;
    let paginationToken: string | undefined;
    let reachedEnd = false;

    try {
      const user = await client.v2.userByUsername(username);

      while (requestsUsed < requestBudget && !reachedEnd) {
        const params: TwitterTimelineParams = {
          max_results: 100,
          'tweet.fields': twitterTimelineFields['tweet.fields'],
          expansions: twitterTimelineFields.expansions,
          'user.fields': twitterTimelineFields['user.fields'],
          'media.fields': twitterTimelineFields['media.fields'],
          'place.fields': twitterTimelineFields['place.fields'],
          'poll.fields': twitterTimelineFields['poll.fields'],
          pagination_token: paginationToken,
          until_id:
            !paginationToken && earliestTweetId ? earliestTweetId : undefined,
          end_time:
            !paginationToken && !earliestTweetId && earliestTweetDate
              ? earliestTweetDate
              : undefined,
        };

        const page = await client.v2.userTimeline(user.data.id, params as any);
        const data = page.data?.data || [];

        for (const t of data) {
          collected.push({
            id: String(t.id),
            username: username.toLowerCase(),
            createdAt: new Date(t.created_at).toISOString(),
            payload: t as unknown as Record<string, unknown>,
            fetchedAt: nowIso,
          });
        }

        requestsUsed++;

        const nextToken = page.data?.meta?.next_token;
        if (!nextToken) {
          reachedEnd = true;
          break;
        }
        paginationToken = nextToken;
      }

      // Store collected tweets
      let stored = 0;
      if (collected.length > 0) {
        const res = await this.storage.storeBatch(collected);
        stored = res.stored;

        const sorted = [...collected].sort((a, b) =>
          a.createdAt > b.createdAt ? -1 : 1,
        );
        const earliest = sorted[sorted.length - 1];

        this.logger.debug(
          `✅ Continue backfill @${username}: ${stored} tweets stored, ${requestsUsed} requests${reachedEnd ? ' (COMPLETE)' : ''}`,
        );

        return {
          stored,
          requestsUsed,
          completed: reachedEnd,
          earliestTweetId: earliest.id,
          earliestTweetDate: earliest.createdAt,
        };
      }

      return {
        stored: 0,
        requestsUsed,
        completed: reachedEnd,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Continue backfill failed for @${username}: ${err.message}`,
      );
      throw err;
    }
  }

  protected async executeIndexingProcess(): Promise<IndexingResult> {
    const startTime = new Date();
    let totalStored = 0;
    let totalRequestsUsed = 0;
    const errors: string[] = [];

    try {
      const requestLimit = this.config.getTwitterRequestLimit();
      const selected = await this.rotation.selectAccountsForProcessing(
        requestLimit,
        3,
      );

      if (selected.length === 0) {
        this.logger.log('No accounts selected for processing');
        return {
          success: true,
          processed: 0,
          embedded: 0,
          stored: 0,
          errors: [],
          processingTime: Date.now() - startTime.getTime(),
          startTime,
          endTime: new Date(),
          rateLimited: false,
          hasMoreData: false,
          requestsUsed: 0,
        };
      }

      const client = new TwitterApi(this.appConfig.getTwitterBearerToken)
        .readOnly;

      for (const sel of selected) {
        try {
          const status = await this.rotation.getStatus(sel.account);
          const accountState = this.determineAccountState(status);
          const budget = sel.requestBudget;

          this.logger.log(
            `Processing @${sel.account} [${accountState}] with ${budget} requests`,
          );

          let accountStored = 0;
          let accountRequestsUsed = 0;
          let updateData: AccountStatusUpdate = { lastSync: new Date() };

          // STATE-BASED PROCESSING
          if (accountState === AccountState.NEW) {
            // 🆕 NEW ACCOUNT: First-run backfill with all budget
            const result = await this.firstRunBackfill(
              client,
              sel.account,
              budget,
            );

            accountStored = result.stored;
            accountRequestsUsed = result.requestsUsed;

            updateData = {
              ...updateData,
              messagesIndexed: result.stored,
              backfillComplete: result.completed,
              latestTweetId: result.latestTweetId,
              latestTweetDate: result.latestTweetDate,
              earliestTweetId: result.earliestTweetId,
              earliestTweetDate: result.earliestTweetDate,
            };
          } else if (accountState === AccountState.ACTIVE) {
            // 🔄 ACTIVE ACCOUNT: Fetch new + continue backfill
            const newResult = await this.fetchNewTweets(
              client,
              sel.account,
              status.latestTweetId,
              status.latestTweetDate,
              budget,
            );

            accountStored += newResult.stored;
            accountRequestsUsed += newResult.requestsUsed;

            if (newResult.latestTweetId) {
              updateData.latestTweetId = newResult.latestTweetId;
              updateData.latestTweetDate = newResult.latestTweetDate;
            }

            // If budget remains, continue backfill
            const remainingBudget = budget - newResult.requestsUsed;
            if (remainingBudget > 0) {
              const backfillResult = await this.continueBackfill(
                client,
                sel.account,
                status.earliestTweetId,
                status.earliestTweetDate,
                remainingBudget,
              );

              accountStored += backfillResult.stored;
              accountRequestsUsed += backfillResult.requestsUsed;

              updateData.backfillComplete = backfillResult.completed;
              if (backfillResult.earliestTweetId) {
                updateData.earliestTweetId = backfillResult.earliestTweetId;
                updateData.earliestTweetDate = backfillResult.earliestTweetDate;
              }
            }

            updateData.messagesIndexed = accountStored;
          } else if (accountState === AccountState.COMPLETE) {
            // ✅ COMPLETE ACCOUNT: Only fetch new tweets
            const newResult = await this.fetchNewTweets(
              client,
              sel.account,
              status.latestTweetId,
              status.latestTweetDate,
              budget,
            );

            accountStored = newResult.stored;
            accountRequestsUsed = newResult.requestsUsed;

            updateData = {
              ...updateData,
              messagesIndexed: newResult.stored,
              latestTweetId: newResult.latestTweetId,
              latestTweetDate: newResult.latestTweetDate,
            };
          }

          // Update account status
          await this.rotation.updateAccountStatus(sel.account, updateData);

          totalStored += accountStored;
          totalRequestsUsed += accountRequestsUsed;

          this.logger.log(
            `✅ @${sel.account}: ${accountStored} tweets, ${accountRequestsUsed} requests`,
          );

          await this.sleep(this.getIndexerConfig().processingDelayMs);
        } catch (error) {
          const err = error as Error;
          this.logger.error(`❌ Failed @${sel.account}: ${err.message}`);
          errors.push(`@${sel.account}: ${err.message}`);
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
        rateLimited: false,
        hasMoreData: false,
        requestsUsed: totalRequestsUsed,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        processed: totalStored,
        embedded: 0,
        stored: 0,
        errors: [...errors, err.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
        rateLimited: false,
        hasMoreData: false,
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
          const page = await client.v2.userTimeline(
            user.data.id,
            params as any,
          );
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
          const page = await client.v2.userTimeline(
            user.data.id,
            params as any,
          );
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
