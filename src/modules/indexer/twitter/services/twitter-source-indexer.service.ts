import { Injectable, Logger } from '@nestjs/common';
import {
  BaseIndexerService,
  IndexerConfig,
} from '../../shared/services/base-indexer.service';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { MessageSource } from '../../shared/models/message-source.enum';
import { IndexingResult } from '../../shared/models/indexer-result.model';
import { AppConfigService } from '../../../core/modules/config/app-config.service';
import {
  AccountRotationService,
  RotationMode,
} from './account-rotation.service';
import {
  TwitterRawStorageService,
  RawTweetRecord,
} from './twitter-raw-storage.service';
import { TwitterApiService } from '../../../integrations/twitter/twitter-api.service';
import { TwitterApi } from 'twitter-api-v2';
import { twitterTimelineFields } from '../consts/twitter-query';

@Injectable()
export class TwitterSourceIndexerService extends BaseIndexerService {
  protected readonly logger = new Logger(TwitterSourceIndexerService.name);

  constructor(
    unifiedStorage: UnifiedStorageService,
    private readonly config: IndexerConfigService,
    private readonly appConfig: AppConfigService,
    private readonly rotation: AccountRotationService,
    private readonly storage: TwitterRawStorageService,
    private readonly twitterApi: TwitterApiService,
  ) {
    super(unifiedStorage);
  }

  protected async executeIndexingProcess(): Promise<IndexingResult> {
    const startTime = new Date();
    let totalProcessed = 0;
    let totalStored = 0;
    const errors: string[] = [];
    let rateLimited = false;
    let hasMoreData = false;

    try {
      const requestLimit = this.config.getTwitterRequestLimit();
      const accountsToProcess = await this.rotation.selectAccountsForProcessing(
        requestLimit,
        RotationMode.RAW,
        3,
      );

      if (accountsToProcess.length === 0) {
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
        };
      }

      for (const sel of accountsToProcess) {
        try {
          const account = sel.account;
          // Always read offsets from DB (payload-only scroll, no vectors)
          const latestStored =
            await this.storage.getLatestForAccountWithoutVector(account);
          const latestDate: Date | undefined = latestStored?.createdAt
            ? new Date(latestStored.createdAt)
            : undefined;

          // Head: fetch newest-first until we hit latestDate (old-indexer semantics)
          const tweets = await this.twitterApi.fetchRawAccountTweets(
            account,
            latestDate,
          );

          const nowIso = new Date().toISOString();
          const records: RawTweetRecord[] = tweets.map((t: any) => ({
            id: String(t.id),
            username: account.toLowerCase(),
            createdAt: new Date(t.created_at).toISOString(),
            payload: t as Record<string, unknown>,
            fetchedAt: nowIso,
          }));

          let headStored = 0;
          if (records.length > 0) {
            const res = await this.storage.storeBatch(records);
            headStored = res.stored;
          }

          totalProcessed += records.length;
          totalStored += headStored;

          // Heuristic like the old indexer (no explicit next_token available here)
          const headRequestsUsed = Math.max(
            1,
            Math.ceil((tweets.length || 0) / 100),
          );
          const headHasMore = tweets.length > 0 && tweets.length >= 200;
          if (headHasMore) hasMoreData = true;

          const headLatest = records
            .slice()
            .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))[0];

          // Backfill: paginate older pages using remaining budget
          const budget = Math.max(0, sel.requestBudget - headRequestsUsed);
          if (budget > 0) {
            try {
              const bearer = this.appConfig.getTwitterBearerToken;
              const client = new TwitterApi(bearer).readOnly;
              const user = await client.v2.userByUsername(account);
              // Use DB earliest as strict boundary so we only fetch older-than-existing
              const earliestStored =
                await this.storage.getEarliestForAccountWithoutVector(account);
              let next: string | undefined = undefined;
              let pages = 0;
              const backfillCollected: RawTweetRecord[] = [];
              let reachedEnd = false;
              while (pages < budget) {
                const params: any = {
                  max_results: 100,
                  'tweet.fields': twitterTimelineFields['tweet.fields'],
                  expansions: twitterTimelineFields.expansions,
                  'user.fields': twitterTimelineFields['user.fields'],
                  'media.fields': twitterTimelineFields['media.fields'],
                  'place.fields': twitterTimelineFields['place.fields'],
                  'poll.fields': twitterTimelineFields['poll.fields'],
                  pagination_token: next,
                  ...(earliestStored && {
                    end_time: new Date(earliestStored.createdAt).toISOString(),
                  }),
                };
                const page = await client.v2.userTimeline(user.data.id, params);
                const data = page.data?.data || [];
                for (const t of data) {
                  backfillCollected.push({
                    id: String(t.id),
                    username: account.toLowerCase(),
                    createdAt: new Date(t.created_at).toISOString(),
                    payload: t as unknown as Record<string, unknown>,
                    fetchedAt: new Date().toISOString(),
                  });
                }
                pages++;
                next = page.data?.meta?.next_token;
                if (!next) {
                  reachedEnd = true;
                  break;
                }
              }
              let backfillStored = 0;
              let backfillEarliest: RawTweetRecord | undefined;
              if (backfillCollected.length > 0) {
                const res = await this.storage.storeBatch(backfillCollected);
                backfillStored = res.stored;
                totalProcessed += backfillCollected.length;
                totalStored += res.stored;
                backfillEarliest = backfillCollected
                  .slice()
                  .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))[0];
              }

              // Single aggregated rotation update
              const combinedStored = headStored + backfillStored;
              const combinedRequests = headRequestsUsed + pages;
              const combinedHasMore = !reachedEnd && pages >= budget;
              await this.rotation.updateAccountStatus(
                account,
                {
                  lastSync: new Date(),
                  messagesIndexed: combinedStored,
                  hasMoreData: combinedHasMore,
                  requestsUsed: combinedRequests,
                  ...(headLatest && {
                    latestTweetDate: headLatest.createdAt,
                    latestTweetId: headLatest.id,
                  }),
                  ...(backfillEarliest && {
                    earliestTweetDate: backfillEarliest.createdAt,
                    earliestTweetId: backfillEarliest.id,
                  }),
                },
                RotationMode.RAW,
              );
            } catch (e: any) {
              if (e?.code === 429 || e?.status === 429) {
                rateLimited = true;
              } else {
                errors.push(`Backfill failed for ${account}: ${e.message}`);
              }
            }
          } else {
            // No budget for backfill: still perform a single rotation update for head only
            await this.rotation.updateAccountStatus(
              account,
              {
                lastSync: new Date(),
                messagesIndexed: headStored,
                hasMoreData: headHasMore,
                requestsUsed: headRequestsUsed,
                ...(headLatest && {
                  latestTweetDate: headLatest.createdAt,
                  latestTweetId: headLatest.id,
                }),
              },
              RotationMode.RAW,
            );
          }

          await this.sleep(this.getIndexerConfig().processingDelayMs);
        } catch (err: any) {
          if (err?.code === 429 || err?.status === 429) {
            rateLimited = true;
          }
          errors.push(`Failed ${sel.account}: ${err.message}`);
        }
      }

      const endTime = new Date();
      return {
        success: errors.length === 0 || totalStored > 0,
        processed: totalProcessed,
        embedded: 0,
        stored: totalStored,
        errors,
        processingTime: endTime.getTime() - startTime.getTime(),
        startTime,
        endTime,
        rateLimited,
        hasMoreData,
      };
    } catch (error: any) {
      return {
        success: false,
        processed: totalProcessed,
        embedded: 0,
        stored: totalStored,
        errors: [...errors, error.message],
        processingTime: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
        rateLimited,
        hasMoreData,
      };
    }
  }

  protected getIndexerConfig(): IndexerConfig {
    return {
      serviceName: 'TwitterSourceIndexer',
      source: MessageSource.TWITTER,
      batchSize: this.config.getDefaultBatchSize(),
      maxRetries: this.config.getMaxRetries(),
      processingDelayMs: this.config.getDefaultProcessingDelayMs(),
    };
  }
}
