import { Injectable, Logger } from '@nestjs/common';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { MessageSource } from '../../shared/models/message-source.enum';
import { TwitterRawStorageService } from './twitter-raw-storage.service';
import { TwitterMasterDocumentTransformer } from '../transformers/twitter-master-document.transformer';
import { MasterDocument } from '../../shared/models/master-document.model';
import { TwitterNoteUpdateService } from './twitter-note-update.service';

@Injectable()
export class TwitterDocGenerationService {
  private readonly logger = new Logger(TwitterDocGenerationService.name);

  constructor(
    private readonly storage: UnifiedStorageService,
    private readonly config: IndexerConfigService,
    private readonly rawStorage: TwitterRawStorageService,
    private readonly noteUpdate: TwitterNoteUpdateService,
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

  /**
   * Full migration:
   * - Load all raw tweets (optionally by username)
   * - Load all existing Twitter master doc IDs
   * - Create docs for raw tweets missing in master
   * - For tweets that already exist in master, run note-update logic from raw tweet (no API calls)
   */
  async runFullMigration(
    opts: { username?: string; batchSize?: number } = {},
  ): Promise<{ created: number; updated: number; processed: number }> {
    const { username, batchSize = 500 } = opts;

    // 1) Pull all raw tweets
    const rawTweets = await this.rawStorage.getAllRawTweets(username);
    if (rawTweets.length === 0) {
      return { created: 0, updated: 0, processed: 0 };
    }

    // 2) Pull all existing Twitter master docs (by source)
    const existingIds = new Set<string>();
    const existingDocs: MasterDocument[] = [];
    let offset = 0;
    const page = batchSize;
    while (true) {
      const docs = await this.storage.getBySource(
        MessageSource.TWITTER,
        page,
        offset,
      );
      if (!docs || docs.length === 0) break;
      for (const d of docs) {
        existingIds.add(String(d.id));
        existingDocs.push(d);
      }
      offset += docs.length;
      if (docs.length < page) break;
    }

    // 3) Split raw tweets into missing vs existing
    const missing: typeof rawTweets = [];
    const existing: typeof rawTweets = [];
    for (const t of rawTweets) {
      const rawId = String(t.id);
      if (existingIds.has(rawId)) existing.push(t);
      else missing.push(t);
    }

    // 4) Create docs for missing
    let created = 0;
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      const docs = batch.map((t) =>
        TwitterMasterDocumentTransformer.transformTweetToMasterDocument(
          t.payload,
          t.username,
        ),
      );
      const res = await this.storage.storeBatch(docs);
      created += res.stored || 0;
    }

    // 5) For existing docs, update from raw payload locally (note-update semantics)
    let updated = 0;
    // Build a map to avoid re-fetches and allow filtering by missing hasTweetNote
    const existingMap = new Map<string, MasterDocument>();
    for (const d of existingDocs) existingMap.set(String(d.id), d);
    const existingNeedingNote = existing.filter((raw) => {
      const doc = existingMap.get(String(raw.id));
      return doc && typeof (doc as any).payload.hasTweetNote === 'undefined';
    });

    for (const raw of existingNeedingNote) {
      try {
        const pre = existingMap.get(String(raw.id));
        const res = await this.noteUpdate.updateFromRawTweet(raw, {
          dryRun: false,
          existingDoc: pre,
        });
        if (res.updated) updated++;
      } catch (e) {
        // Continue on error to avoid blocking whole migration
        this.logger.warn(
          `Failed to update from raw for tweet ${raw.id}: ${e?.message || e}`,
        );
      }
    }

    return { created, updated, processed: rawTweets.length };
  }

  /**
   * Backfill postedAt field in unified collection from raw tweets (no re-embedding)
   */
  async backfillPostedAt(
    opts: { username?: string } = {},
  ): Promise<{ updated: number }> {
    const rawTweets = await this.rawStorage.getAllRawTweets(opts.username);
    if (!rawTweets || rawTweets.length === 0) return { updated: 0 };

    // Build id -> postedAt map
    const idToPostedAt = new Map<string, string>();
    const missingCreatedAt: string[] = [];
    for (const t of rawTweets) {
      const id = String(t.id);
      const createdAtRaw = t?.payload?.created_at;
      if (createdAtRaw) {
        try {
          const iso = new Date(createdAtRaw as string).toISOString();
          idToPostedAt.set(id, iso);
        } catch (e) {
          missingCreatedAt.push(id);
        }
      } else {
        // No created_at on raw payload – record for reporting, skip update
        missingCreatedAt.push(id);
      }
    }

    // Update only MasterDocuments missing postedAt for Twitter
    const pageSize = 5000;
    let offset = 0;
    let updated = 0;
    while (true) {
      const docs = await this.storage.getBySourceMissingPostedAt(
        MessageSource.TWITTER,
        pageSize,
        offset,
        opts.username ? { authorOrChannel: opts.username } : undefined,
      );
      if (!docs || docs.length === 0) break;

      for (const d of docs) {
        const postedAt = idToPostedAt.get(String(d.id));
        if (postedAt) {
          try {
            await this.storage.setPostedAt(String(d.id), postedAt);
            updated++;
          } catch (e) {
            this.logger.warn(
              `Failed postedAt update for ${d.id}: ${e?.message || e}`,
            );
          }
        }
      }
      offset += docs.length;
      if (docs.length < pageSize) break;
    }

    if (missingCreatedAt.length > 0) {
      // Log aggregated list of IDs missing created_at in raw payload
      const sample = missingCreatedAt.slice(0, 20).join(', ');
      this.logger.warn(
        `Raw tweets missing created_at: count=${missingCreatedAt.length}$${sample ? `, sample=[${sample}]` : ''}`,
      );
    }

    // Widen return to include missingCreatedAt for caller visibility
    return { updated } as any;
  }
}
