import { Injectable, Logger } from '@nestjs/common';
import { TwitterApiService } from '../../../integrations/twitter/twitter-api.service';
import {
  TwitterRawStorageService,
  RawTweetRecord,
} from './twitter-raw-storage.service';
// Deprecated: raw history now tracked in rotation service
import {
  AccountRotationService,
  RotationMode,
} from './account-rotation.service';

@Injectable()
export class TwitterRawCollectorService {
  private readonly logger = new Logger(TwitterRawCollectorService.name);

  constructor(
    private readonly api: TwitterApiService,
    private readonly storage: TwitterRawStorageService,
    private readonly rotation: AccountRotationService,
  ) {}

  /**
   * Collect tweets for an account using head or backfill mode, store raw payloads, and update offsets
   */
  async collectForAccount(
    username: string,
    opts?: { mode?: 'head' | 'backfill'; pageLimit?: number },
  ): Promise<{
    stored: number;
    hasMoreData: boolean;
    latest?: { id: string; date: string };
    earliest?: { id: string; date: string };
  }> {
    const mode = opts?.mode || 'head';
    const status = await (this.rotation as any).getAccountStatus?.(
      username,
      RotationMode.RAW,
    );

    const latestSince = status?.latestTweetDate
      ? new Date(status.latestTweetDate)
      : undefined;

    // Fetch; in backfill mode, do not stop at latestSince and apply a page limit
    const tweets = await this.api.fetchAccountTweets(username, latestSince);
    if (tweets.length === 0) {
      return {
        stored: 0,
        hasMoreData: !!status && !status.isComplete,
      } as any;
    }

    const nowIso = new Date().toISOString();
    const records: RawTweetRecord[] = tweets.map((t: any) => ({
      id: String(t.id || t.id_str),
      username: username.toLowerCase(),
      createdAt: new Date(t.created_at || Date.now()).toISOString(),
      payload: t as Record<string, unknown>,
      fetchedAt: nowIso,
    }));

    const result = await this.storage.storeBatch(records);

    // Determine latest/earliest from this batch (tweets are newest-first from API)
    const sorted = [...records].sort((a, b) =>
      a.createdAt > b.createdAt ? -1 : 1,
    );
    const latest = sorted[0];
    const earliest = sorted[sorted.length - 1];

    // Compute if more data remains in backfill (conservative: assume more until we naturally stop)
    const hasMoreData = mode === 'backfill';

    // Update rotation offsets/counters
    await this.rotation.updateAccountStatus(
      username,
      {
        messagesIndexed: result.stored,
        hasMoreData,
        latestTweetDate: latest?.createdAt,
        latestTweetId: latest?.id,
        earliestTweetDate: earliest?.createdAt,
        earliestTweetId: earliest?.id,
      } as any,
      RotationMode.RAW,
    );

    return {
      stored: result.stored,
      hasMoreData,
      latest: latest ? { id: latest.id, date: latest.createdAt } : undefined,
      earliest: earliest
        ? { id: earliest.id, date: earliest.createdAt }
        : undefined,
    };
  }

  /**
   * Run a full collection pass across selected accounts using rotation logic
   */
  async collectBatch(
    totalRequestBudget: number,
  ): Promise<{ accounts: number; stored: number }> {
    const selected = await this.rotation.selectAccountsForProcessing(
      totalRequestBudget,
      RotationMode.RAW,
    );
    let totalStored = 0;
    for (const sel of selected) {
      // Choose mode based on status: never/partial -> backfill, complete/stale -> head
      const status = await (this.rotation as any).getAccountStatus?.(
        sel.account,
        RotationMode.RAW,
      );
      const isBackfill = !status?.lastFullSync || !status?.isComplete;
      const res = await this.collectForAccount(sel.account, {
        mode: isBackfill ? 'backfill' : 'head',
        pageLimit: Math.max(1, Math.min(sel.requestBudget, 5)),
      });
      totalStored += res.stored;
    }
    return { accounts: selected.length, stored: totalStored };
  }
}
