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

  async storeBatch(tweets: RawTweetRecord[]): Promise<{ stored: number }> {
    await this.ensureCollectionExists();
    const points = tweets.map((t) => ({
      id: this.hashId(t.id),
      vector: [1],
      payload: t,
    }));
    await this.qdrant.upsertPoints(this.getCollectionName(), points);
    return { stored: points.length };
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
