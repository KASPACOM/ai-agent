import { Injectable, Logger } from '@nestjs/common';
import { QdrantClientService } from '../../../database/qdrant/services/qdrant-client.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { v5 as uuidv5 } from 'uuid';

export interface RawTweetRecord {
  id: string; // tweet id
  username: string;
  createdAt: string;
  payload: Record<string, unknown>;
  fetchedAt: string;
}

@Injectable()
export class TwitterRawStorageService {
  private readonly logger = new Logger(TwitterRawStorageService.name);

  constructor(
    private readonly qdrant: QdrantClientService,
    private readonly config: IndexerConfigService,
  ) {}

  async storeBatch(
    tweets: RawTweetRecord[],
  ): Promise<{ stored: number; duplicates: number }> {
    await this.ensureCollectionExists();
    if (tweets.length === 0) return { stored: 0, duplicates: 0 };

    const collection = this.getCollectionName();
    const ids = tweets.map((t) => this.hashId(t.id));

    // Retrieve existing points to filter duplicates
    const existing = await this.qdrant.getPoints(collection, ids);
    const existingIds = new Set<string>(existing.map((p: any) => String(p.id)));

    const newTweets = tweets.filter((t) => !existingIds.has(this.hashId(t.id)));
    if (newTweets.length === 0) {
      return { stored: 0, duplicates: tweets.length };
    }

    const points = newTweets.map((t) => ({
      id: this.hashId(t.id),
      vector: [1],
      payload: t,
    }));
    await this.qdrant.upsertPoints(collection, points);
    return { stored: points.length, duplicates: tweets.length - points.length };
  }

  async querySince(
    username: string,
    sinceIso: string,
  ): Promise<RawTweetRecord[]> {
    await this.ensureCollectionExists();
    const res = await this.qdrant.searchPoints(this.getCollectionName(), {
      vector: [0],
      limit: 10000,
      filter: {
        must: [
          { key: 'username', match: { value: username.toLowerCase() } },
          { key: 'createdAt', range: { gt: sinceIso } },
        ],
      },
    });
    return res.points.map((p) => p.payload as RawTweetRecord);
  }

  async getLatestForAccount(
    username: string,
  ): Promise<{ id: string; createdAt: string } | undefined> {
    await this.ensureCollectionExists();
    const res = await this.qdrant.searchPoints(this.getCollectionName(), {
      vector: [0],
      limit: 10000,
      filter: {
        must: [{ key: 'username', match: { value: username.toLowerCase() } }],
      },
    });
    const records = res.points.map((p) => p.payload as RawTweetRecord);
    if (records.length === 0) return undefined;
    const latest = records.reduce((a, b) =>
      a.createdAt > b.createdAt ? a : b,
    );
    return { id: latest.id, createdAt: latest.createdAt };
  }

  async getLatestForAccountWithoutVector(
    username: string,
  ): Promise<{ id: string; createdAt: string } | undefined> {
    await this.ensureCollectionExists();
    const collection = this.getCollectionName();
    const uname = username.toLowerCase();
    let offset: any = undefined;
    let latest: RawTweetRecord | undefined;
    do {
      const page = await this.qdrant.scrollPoints(collection, {
        with_payload: true,
        with_vector: false,
        limit: 1000,
        offset,
        filter: { must: [{ key: 'username', match: { value: uname } }] },
      });
      const points = page?.points || [];
      for (const p of points) {
        const rec = p.payload as RawTweetRecord;
        if (!latest || rec.createdAt > latest.createdAt) latest = rec;
      }
      offset = page?.next_page_offset;
    } while (offset);
    if (!latest) return undefined;
    return { id: latest.id, createdAt: latest.createdAt };
  }

  async getEarliestForAccountWithoutVector(
    username: string,
  ): Promise<{ id: string; createdAt: string } | undefined> {
    await this.ensureCollectionExists();
    const collection = this.getCollectionName();
    const uname = username.toLowerCase();
    let offset: any = undefined;
    let earliest: RawTweetRecord | undefined;
    do {
      const page = await this.qdrant.scrollPoints(collection, {
        with_payload: true,
        with_vector: false,
        limit: 1000,
        offset,
        filter: { must: [{ key: 'username', match: { value: uname } }] },
      });
      const points = page?.points || [];
      for (const p of points) {
        const rec = p.payload as RawTweetRecord;
        if (!earliest || rec.createdAt < earliest.createdAt) earliest = rec;
      }
      offset = page?.next_page_offset;
    } while (offset);
    if (!earliest) return undefined;
    return { id: earliest.id, createdAt: earliest.createdAt };
  }

  private getCollectionName(): string {
    return this.config.getTwitterRawCollectionName();
  }

  private async ensureCollectionExists(): Promise<void> {
    const name = this.getCollectionName();
    const exists = await this.qdrant.collectionExists(name);
    if (exists) return;
    await this.qdrant.createCollection(name, {
      vectors: { size: 1, distance: 'Cosine' },
      optimizers_config: { default_segment_number: 2 },
      replication_factor: 1,
    });
  }

  private hashId(id: string): string {
    return uuidv5(id, this.config.getTwitterRawUuidNamespace());
  }
}
