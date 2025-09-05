import { Injectable, Logger } from '@nestjs/common';
import { QdrantClientService } from '../../../database/qdrant/services/qdrant-client.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import {
  AccountRotationService,
  RotationMode,
} from './account-rotation.service';

@Injectable()
export class TwitterRawAuditService {
  private readonly logger = new Logger(TwitterRawAuditService.name);

  constructor(
    private readonly qdrant: QdrantClientService,
    private readonly config: IndexerConfigService,
    private readonly rotation: AccountRotationService,
  ) {}

  private getRawCollection(): string {
    return this.config.getTwitterRawCollectionName();
  }

  private async fetchAllRaw(): Promise<any[]> {
    const collection = this.getRawCollection();
    const all: any[] = [];
    let offset: any = undefined;
    const pageSize = 10000;
    // Scroll through entire collection (payload-only)
    while (true) {
      const page = await this.qdrant.scrollPoints(collection, {
        with_payload: true,
        with_vector: false,
        limit: pageSize,
        offset,
      });
      const points = page?.points || [];
      if (points.length === 0) break;
      for (const p of points) all.push(p.payload);
      offset = page?.next_page_offset;
      if (!offset) break;
    }
    return all;
  }

  async getAllRawAggregates(): Promise<
    Array<{
      account: string;
      count: number;
      earliest?: { id: string; date: string };
      latest?: { id: string; date: string };
    }>
  > {
    const records = await this.fetchAllRaw();
    const byUser: Record<
      string,
      { count: number; earliest?: any; latest?: any }
    > = {};
    for (const r of records) {
      const uname = String(r?.username || '').toLowerCase();
      if (!uname) continue;
      const createdAt = String(r?.createdAt || '');
      const id = String(r?.id || '');
      if (!byUser[uname]) byUser[uname] = { count: 0 };
      byUser[uname].count += 1;
      if (
        !byUser[uname].earliest ||
        createdAt < byUser[uname].earliest.createdAt
      ) {
        byUser[uname].earliest = { id, createdAt };
      }
      if (!byUser[uname].latest || createdAt > byUser[uname].latest.createdAt) {
        byUser[uname].latest = { id, createdAt };
      }
    }
    return Object.entries(byUser).map(([account, agg]) => ({
      account,
      count: agg.count,
      earliest: agg.earliest
        ? { id: agg.earliest.id, date: agg.earliest.createdAt }
        : undefined,
      latest: agg.latest
        ? { id: agg.latest.id, date: agg.latest.createdAt }
        : undefined,
    }));
  }

  async getRawStatsForAccount(username: string): Promise<{
    count: number;
    earliest?: { id: string; date: string };
    latest?: { id: string; date: string };
  }> {
    const res = await this.qdrant.searchPoints(this.getRawCollection(), {
      vector: [0],
      limit: 1000000,
      filter: {
        must: [{ key: 'username', match: { value: username.toLowerCase() } }],
      },
      with_payload: true,
      with_vector: false,
    });
    const records = (res.points || []).map((p: any) => p.payload as any);
    const count = records.length;
    if (count === 0) return { count };
    records.sort((a: any, b: any) => (a.createdAt > b.createdAt ? 1 : -1));
    return {
      count,
      earliest: { id: String(records[0].id), date: records[0].createdAt },
      latest: {
        id: String(records[count - 1].id),
        date: records[count - 1].createdAt,
      },
    };
  }

  async auditAccount(username: string): Promise<any> {
    const acct = (username || '').toLowerCase();
    const [rawStats, status] = await Promise.all([
      this.getRawStatsForAccount(acct),
      this.rotation.getStatus(acct, RotationMode.RAW),
    ]);

    const discrepancies: string[] = [];
    if (!status) {
      discrepancies.push('No rotation status found');
    } else {
      // Count vs syncedTweets
      if (
        typeof status.syncedTweets === 'number' &&
        rawStats.count !== status.syncedTweets
      ) {
        discrepancies.push(
          `count_mismatch: raw=${rawStats.count} rotation.syncedTweets=${status.syncedTweets}`,
        );
      }

      // Latest date/ID mismatch
      if (
        rawStats.latest?.date &&
        status.latestTweetDate &&
        rawStats.latest.date !== status.latestTweetDate
      ) {
        discrepancies.push(
          `latest_date_mismatch: raw=${rawStats.latest.date} rotation=${status.latestTweetDate}`,
        );
      }
      if (
        rawStats.latest?.id &&
        status.latestTweetId &&
        String(rawStats.latest.id) !== String(status.latestTweetId)
      ) {
        discrepancies.push(
          `latest_id_mismatch: raw=${rawStats.latest.id} rotation=${status.latestTweetId}`,
        );
      }

      // Earliest date/ID mismatch
      if (
        rawStats.earliest?.date &&
        status.earliestTweetDate &&
        rawStats.earliest.date !== status.earliestTweetDate
      ) {
        discrepancies.push(
          `earliest_date_mismatch: raw=${rawStats.earliest.date} rotation=${status.earliestTweetDate}`,
        );
      }
      if (
        rawStats.earliest?.id &&
        status.earliestTweetId &&
        String(rawStats.earliest.id) !== String(status.earliestTweetId)
      ) {
        discrepancies.push(
          `earliest_id_mismatch: raw=${rawStats.earliest.id} rotation=${status.earliestTweetId}`,
        );
      }

      // Completion sanity check
      if (status.isComplete && rawStats.count === 0) {
        discrepancies.push(
          'complete_but_no_data: status.isComplete=true but raw.count=0',
        );
      }
    }

    return {
      account: acct,
      raw: rawStats,
      rotation: status,
      discrepancies,
    };
  }

  async auditAll(accounts: string[]): Promise<any[]> {
    const aggregates = await this.getAllRawAggregates();
    const selected = (
      accounts && accounts.length
        ? Array.from(new Set(accounts.map((a) => (a || '').toLowerCase())))
        : aggregates.map((a) => a.account)
    ) as string[];
    const aggByUser = new Map(aggregates.map((a) => [a.account, a]));
    const results: any[] = [];
    for (const acc of selected) {
      const rawAgg = aggByUser.get(acc) || { account: acc, count: 0 };
      const status = await this.rotation.getStatus(acc, RotationMode.RAW);
      const discrepancies: string[] = [];
      if (!status) {
        discrepancies.push('No rotation status found');
      } else {
        if (
          typeof status.syncedTweets === 'number' &&
          rawAgg.count !== status.syncedTweets
        )
          discrepancies.push(
            `count_mismatch: raw=${rawAgg.count} rotation.syncedTweets=${status.syncedTweets}`,
          );
      }
      results.push({
        account: acc,
        raw: rawAgg,
        rotation: status,
        discrepancies,
      });
    }
    return results;
  }

  async reconcileCounts(accounts?: string[]): Promise<
    Array<{
      account: string;
      before: number;
      after: number;
      countsChanged: boolean;
      latestBefore?: { id?: string; date?: string };
      latestAfter?: { id?: string; date?: string };
      latestChanged: boolean;
      earliestBefore?: { id?: string; date?: string };
      earliestAfter?: { id?: string; date?: string };
      earliestChanged: boolean;
    }>
  > {
    const aggregates = await this.getAllRawAggregates();
    const aggByUser = new Map(aggregates.map((a) => [a.account, a]));
    const targetAccounts = (
      accounts && accounts.length
        ? Array.from(new Set(accounts.map((a) => (a || '').toLowerCase())))
        : aggregates.map((a) => a.account)
    ) as string[];

    const results: Array<{
      account: string;
      before: number;
      after: number;
      countsChanged: boolean;
      latestBefore?: { id?: string; date?: string };
      latestAfter?: { id?: string; date?: string };
      latestChanged: boolean;
      earliestBefore?: { id?: string; date?: string };
      earliestAfter?: { id?: string; date?: string };
      earliestChanged: boolean;
    }> = [];

    for (const acc of targetAccounts) {
      const agg = aggByUser.get(acc);
      const count = agg?.count || 0;
      const status = await this.rotation.getStatus(acc, RotationMode.RAW);
      const before = status?.syncedTweets || 0;
      const countsChanged = before !== count;

      if (countsChanged) {
        await this.rotation.setSyncedTweets(acc, count, RotationMode.RAW);
      }

      const latestBefore = status
        ? {
            id: status.latestTweetId as any,
            date: status.latestTweetDate as any,
          }
        : undefined;
      const earliestBefore = status
        ? {
            id: status.earliestTweetId as any,
            date: status.earliestTweetDate as any,
          }
        : undefined;
      const latestAfter = agg?.latest
        ? { id: agg.latest.id, date: agg.latest.date }
        : undefined;
      const earliestAfter = agg?.earliest
        ? { id: agg.earliest.id, date: agg.earliest.date }
        : undefined;

      const latestChanged = !!(
        (latestAfter?.id &&
          String(latestAfter.id) !== String(latestBefore?.id)) ||
        (latestAfter?.date && latestAfter.date !== latestBefore?.date)
      );
      const earliestChanged = !!(
        (earliestAfter?.id &&
          String(earliestAfter.id) !== String(earliestBefore?.id)) ||
        (earliestAfter?.date && earliestAfter.date !== earliestBefore?.date)
      );

      if (latestChanged || earliestChanged) {
        await this.rotation.updateAccountStatus(
          acc,
          {
            latestTweetDate: latestAfter?.date,
            latestTweetId: latestAfter?.id as any,
            earliestTweetDate: earliestAfter?.date,
            earliestTweetId: earliestAfter?.id as any,
          },
          RotationMode.RAW,
        );
      }

      results.push({
        account: acc,
        before,
        after: count,
        countsChanged,
        latestBefore,
        latestAfter,
        latestChanged,
        earliestBefore,
        earliestAfter,
        earliestChanged,
      });
    }

    return results;
  }
}
