import { Injectable, Logger } from '@nestjs/common';
import { TwitterApiService } from '../../../integrations/twitter/twitter-api.service';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { QdrantRepository } from '../../../database/qdrant/services/qdrant.repository';
import { QdrantClientService } from '../../../database/qdrant/services/qdrant-client.service';
import { MessageSource } from '../../shared/models/message-source.enum';
import { MasterDocument } from '../../shared/models/master-document.model';
import { v5 as uuidv5 } from 'uuid';
import { RawTweetRecord } from './twitter-raw-storage.service';

/**
 * Twitter Note Update Service
 *
 * Updates existing Twitter documents in Qdrant with full text from note_tweet field.
 * Processes tweets that may have been truncated before note_tweet support was added.
 *
 * Features:
 * - Identifies candidate tweets (270+ characters, hasTweetNote == null)
 * - Fetches full text from Twitter API using note_tweet field
 * - Updates documents with extended content
 * - Tracks processing status via hasTweetNote field
 * - Respects Twitter API rate limits
 */
@Injectable()
export class TwitterNoteUpdateService {
  private readonly logger = new Logger(TwitterNoteUpdateService.name);

  constructor(
    private readonly twitterApi: TwitterApiService,
    private readonly unifiedStorage: UnifiedStorageService,
    private readonly qdrantRepository: QdrantRepository,
    private readonly qdrantClient: QdrantClientService,
  ) {}

  /**
   * Update tweets with note_tweet content
   */
  async updateTweetsWithNoteContent(
    options: {
      batchSize?: number;
      dryRun?: boolean;
    } = {},
  ): Promise<UpdateResult> {
    const { batchSize = 100, dryRun = false } = options;
    const startTime = new Date();

    this.logger.log(
      `🚀 Starting Twitter note_tweet update process${dryRun ? ' (DRY RUN)' : ''}`,
    );

    try {
      // Step 1: Get candidate count for logging
      const totalCandidates = await this.getCandidateCount();
      this.logger.log(
        `📊 Found ${totalCandidates} candidate tweets for note_tweet processing`,
      );

      if (totalCandidates === 0) {
        return {
          success: true,
          totalCandidates: 0,
          processed: 0,
          updated: 0,
          errors: [],
          processingTime: Date.now() - startTime.getTime(),
          dryRun,
        };
      }

      // Step 2: Process candidates in batches
      const candidates = await this.getCandidateTweets();
      this.logger.log(
        `🔄 Processing ${candidates.length} tweets in current batch (batchSize=${batchSize})`,
      );

      // Progress snapshot among candidates: how many already marked true/false vs unprocessed
      try {
        const alreadyTrue = candidates.filter(
          (c) => c.hasTweetNote === true,
        ).length;
        const alreadyFalse = candidates.filter(
          (c) => c.hasTweetNote === false,
        ).length;
        const unprocessed = candidates.length - alreadyTrue - alreadyFalse;
        this.logger.log(
          `📈 Candidate progress — hasTweetNote: true=${alreadyTrue}, false=${alreadyFalse}, unprocessed=${unprocessed}`,
        );
      } catch (e) {
        this.logger.debug(`Progress snapshot failed: ${e?.message || e}`);
      }

      const results = {
        processed: 0,
        updated: 0,
        errors: [] as string[],
      };

      // Step 3: Process each candidate with dynamic rate limit handling from headers
      for (const candidate of candidates) {
        if (!candidate.hasTweetNote) {
          try {
            const updateResult = await this.processSingleTweet(
              candidate,
              dryRun,
            );
            results.processed++;

            if (updateResult.updated) {
              results.updated++;
              this.logger.debug(
                `✅ Updated tweet ${candidate.id} with note_tweet content`,
              );
            } else {
              this.logger.debug(
                `ℹ️ Tweet ${candidate.id} marked as processed (no note_tweet)`,
              );
            }
            // Small pacing delay to avoid bursts
            await this.delay(500);
          } catch (error) {
            const errorMsg = `Failed to process tweet ${candidate.id}: ${error.message}`;
            this.logger.error(errorMsg);
            results.errors.push(errorMsg);
          }
        }
      }

      const processingTime = Date.now() - startTime.getTime();

      this.logger.log(`✅ Twitter note_tweet update completed:`);
      this.logger.log(`   📊 Total candidates: ${totalCandidates}`);
      this.logger.log(`   🔄 Processed: ${results.processed}`);
      this.logger.log(`   ✨ Updated: ${results.updated}`);
      this.logger.log(`   ❌ Errors: ${results.errors.length}`);
      this.logger.log(`   ⏱️ Time: ${(processingTime / 1000).toFixed(1)}s`);

      return {
        success: true,
        totalCandidates,
        processed: results.processed,
        updated: results.updated,
        errors: results.errors,
        processingTime,
        dryRun,
      };
    } catch (error) {
      this.logger.error(
        `❌ Twitter note_tweet update failed: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get count of candidate tweets for processing
   */
  private async getCandidateCount(): Promise<number> {
    try {
      // Debug: Use direct Qdrant client instead of scrollTweets
      const collectionName = this.unifiedStorage.getCollectionName();
      this.logger.debug(`🔍 Using collection: ${collectionName}`);

      // Debug: Check Twitter documents specifically
      const twitterDocsResponse = await this.qdrantClient.scrollPoints(
        collectionName,
        {
          filter: {
            must: [{ key: 'source', match: { value: MessageSource.TWITTER } }],
          },
          limit: 100000,
          with_payload: true,
          with_vector: false,
        },
      );

      this.logger.debug(
        `🔍 Total Twitter tweets in DB: ${twitterDocsResponse.points?.length || 0}`,
      );

      const longTextResponse = twitterDocsResponse.points.filter(
        (t) => t.payload.text.length >= 270,
      );

      const candidateCount = longTextResponse?.length || 0;
      this.logger.debug(`🔍 Final candidate count: ${candidateCount}`);

      return candidateCount;
    } catch (error) {
      this.logger.error(`Failed to get candidate count: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get candidate tweets for processing
   */
  private async getCandidateTweets(): Promise<MasterDocument[]> {
    try {
      const collectionName = this.unifiedStorage.getCollectionName();

      const twitterDocsResponse = await this.qdrantClient.scrollPoints(
        collectionName,
        {
          filter: {
            must: [{ key: 'source', match: { value: MessageSource.TWITTER } }],
          },
          limit: 100000,
          with_payload: true,
          with_vector: false,
        },
      );

      this.logger.debug(
        `🔍 Total Twitter tweets in DB: ${twitterDocsResponse.points?.length || 0}`,
      );

      const longTextResponse = twitterDocsResponse.points.filter(
        (t) => t.payload.text.length >= 270,
      );
      return (longTextResponse || []).map(
        (point) => point.payload as MasterDocument,
      );
    } catch (error) {
      this.logger.error(`Failed to get candidate tweets: ${error.message}`);
      return [];
    }
  }

  /**
   * Build Qdrant filter for candidate tweets
   */
  private buildCandidateFilter(): any {
    return {
      must: [
        // Only Twitter messages
        { key: 'source', match: { value: MessageSource.TWITTER } },
        // Text length >= 270 (likely truncated)
        { key: 'text', range: { gte: 270 } },
      ],
      // NOTE: Don't filter by hasTweetNote yet since it doesn't exist in existing documents
      // Once we start processing, we can add this back:
      // must_not: [
      //   { key: 'hasTweetNote', match: { value: true } },
      //   { key: 'hasTweetNote', match: { value: false } },
      // ],
    };
  }

  /**
   * Process a single tweet for note_tweet content
   */
  private async processSingleTweet(
    document: MasterDocument,
    dryRun: boolean,
  ): Promise<{ updated: boolean }> {
    try {
      // Extract tweet ID from document ID
      const tweetId = this.extractTweetId(document.id);
      if (!tweetId) {
        throw new Error('Could not extract tweet ID from document');
      }

      // Fetch tweet from Twitter API
      const { tweet, rateLimit } = (this.twitterApi as any).getTweetByIdWithMeta
        ? await (this.twitterApi as any).getTweetByIdWithMeta(tweetId)
        : {
            tweet: await this.twitterApi.getTweetById(tweetId),
            rateLimit: undefined,
          };

      // If rate limit headers indicate we must wait, enforce reset-based backoff
      if (
        rateLimit &&
        typeof rateLimit.remaining === 'number' &&
        rateLimit.remaining <= 0
      ) {
        const nowSec = Math.floor(Date.now() / 1000);
        const waitMs = Math.max(0, (rateLimit.reset - nowSec) * 1000) + 1000;
        this.logger.warn(
          `⏳ Rate limit reached (remaining=0). Sleeping until reset in ${(
            waitMs / 1000
          ).toFixed(1)}s...`,
        );
        await this.delay(waitMs);
      }

      if (!tweet) {
        // Tweet not found or inaccessible - skip for now to retry later
        return { updated: false };
      }

      // Access note_tweet from the raw metadata
      const rawTweet = tweet.metadata?.raw_tweet;
      const noteText = rawTweet?.note_tweet?.text;
      const originalText = document.text;
      const origUrls = rawTweet?.entities?.urls ?? [];
      const noteUrls = rawTweet?.note_tweet?.entities?.urls ?? [];
      const origMentions = rawTweet?.entities?.mentions ?? [];
      const noteMentions = rawTweet?.note_tweet?.entities?.mentions ?? [];
      // Prefer note_tweet URLs if provided; fallback to original tweet URLs
      const cleanedOriginalLen = this.removeKnownUrlsAndMentions(
        document.text,
        origUrls,
        origMentions,
      ).length;
      const cleanedNoteLen = noteText
        ? this.removeKnownUrlsAndMentions(
            noteText,
            noteUrls.length ? noteUrls : origUrls,
            noteMentions.length ? noteMentions : origMentions,
          ).length
        : 0;

      if (noteText && cleanedNoteLen > cleanedOriginalLen) {
        // Has extended content - update with full text
        this.logger.debug(
          `📝 Tweet ${tweetId} has note_tweet: ${originalText.length} → ${noteText.length} chars`,
        );

        if (!dryRun) {
          await this.updateDocumentInQdrant(
            document.id,
            {
              text: noteText, // Use note_tweet text for embedding/search
              hasTweetNote: true,
              twitterOriginalText: originalText, // Preserve original text
              twitterNoteText: noteText, // Store expanded text
            },
            true,
          ); // true = re-embed the document
        }
        return { updated: true };
      } else {
        // No extended content - mark as processed
        if (!dryRun) {
          await this.updateDocumentInQdrant(
            document.id,
            {
              hasTweetNote: false,
            },
            false,
          ); // false = no re-embedding needed
        }
        return { updated: false };
      }
    } catch (error) {
      // If 429, try to honor reset if available, otherwise default small backoff
      const status = (error as any)?.code || (error as any)?.status;
      const rateLimit = (error as any)?.rateLimit || (error as any)?._rateLimit;
      if (status === 429) {
        const nowSec = Math.floor(Date.now() / 1000);
        const waitMs = rateLimit?.reset
          ? Math.max(0, (rateLimit.reset - nowSec) * 1000) + 1500
          : 60_000; // fallback 60s
        this.logger.warn(
          `429 from Twitter. Backing off for ${(waitMs / 1000).toFixed(1)}s before continuing...`,
        );
        await this.delay(waitMs);
        return { updated: false };
      }
      this.logger.error(
        `Error processing tweet ${document.id}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Update an existing MasterDocument using a provided raw tweet payload (no API call).
   * Mirrors the logic in processSingleTweet but uses the given RawTweetRecord.
   */
  async updateFromRawTweet(
    raw: RawTweetRecord,
    options: { dryRun?: boolean; existingDoc?: MasterDocument } = {},
  ): Promise<{ updated: boolean }> {
    const { dryRun = false, existingDoc: preloaded } = options;
    const documentId = String(raw.id);

    // Use provided document if available to avoid extra fetch
    const existingDoc =
      preloaded || (await this.getExistingDocument(documentId));
    if (!existingDoc) {
      // If the master document doesn't exist yet, caller may create it separately
      return { updated: false };
    }

    const rawTweet: any = raw.payload || {};
    const noteText: string | undefined = rawTweet?.note_tweet?.text;
    const originalText: string = existingDoc.text || '';

    const origUrls = rawTweet?.entities?.urls ?? [];
    const noteUrls = rawTweet?.note_tweet?.entities?.urls ?? [];
    const origMentions = rawTweet?.entities?.mentions ?? [];
    const noteMentions = rawTweet?.note_tweet?.entities?.mentions ?? [];

    const cleanedOriginalLen = this.removeKnownUrlsAndMentions(
      originalText,
      origUrls,
      origMentions,
    ).length;

    const cleanedNoteLen = noteText
      ? this.removeKnownUrlsAndMentions(
          noteText,
          noteUrls.length ? noteUrls : origUrls,
          noteMentions.length ? noteMentions : origMentions,
        ).length
      : 0;

    if (noteText && cleanedNoteLen > cleanedOriginalLen) {
      if (!dryRun) {
        await this.updateDocumentInQdrant(
          existingDoc.id,
          {
            text: noteText,
            hasTweetNote: true,
            twitterOriginalText: originalText,
            twitterNoteText: noteText,
          },
          true,
          existingDoc,
        );
      }
      return { updated: true };
    } else {
      if (!dryRun) {
        await this.updateDocumentInQdrant(
          existingDoc.id,
          {
            hasTweetNote: false,
          },
          false,
          existingDoc,
        );
      }
      return { updated: false };
    }
  }

  /**
   * Extract tweet ID from document ID
   */
  private extractTweetId(documentId: string): string | null {
    // Document IDs are typically the tweet ID itself
    // or in format like "twitter_1234567890"
    if (documentId.startsWith('twitter_')) {
      return documentId.replace('twitter_', '');
    }

    // If it's just a number, assume it's the tweet ID
    if (/^\d+$/.test(documentId)) {
      return documentId;
    }

    return null;
  }

  private removeKnownUrlsAndMentions(
    text: string,
    urls: { url?: string; expanded_url?: string; display_url?: string }[],
    mentions: { username?: string }[],
  ): string {
    if (!text) return '';
    let result = text;
    // Remove URL strings (t.co, expanded, display)
    for (const u of urls || []) {
      for (const candidate of [u.url, u.expanded_url, u.display_url]) {
        if (candidate && candidate.length > 0 && result.includes(candidate)) {
          result = result.split(candidate).join(' ');
        }
      }
    }
    // Remove mentions by exact handle strings prefixed with @
    for (const m of mentions || []) {
      const handle = m?.username ? `@${m.username}` : undefined;
      if (handle && result.includes(handle)) {
        result = result.split(handle).join(' ');
      }
    }
    return result.replace(/\s+/g, ' ').trim();
  }

  /**
   * Update document in Qdrant
   */
  private async updateDocumentInQdrant(
    documentId: string,
    updates: Partial<MasterDocument>,
    reEmbed: boolean = false,
    existingDocOverride?: MasterDocument,
  ): Promise<void> {
    try {
      // Use UnifiedStorageService to update the document
      // This ensures we follow the same storage patterns
      const existingDoc =
        existingDocOverride || (await this.getExistingDocument(documentId));
      if (!existingDoc) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Merge updates with existing document
      const updatedDoc: MasterDocument = {
        ...existingDoc,
        ...updates,
      };

      if (reEmbed) {
        // Clear vector fields so UnifiedStorageService will re-embed
        updatedDoc.vector = undefined;
        updatedDoc.vectorDimensions = undefined;
        updatedDoc.embeddedAt = undefined;

        this.logger.debug(
          `🔄 Re-embedding document ${documentId} with updated text (${updatedDoc.text.length} chars)`,
        );
      }

      // Store the updated document
      // UUID is based on documentId, so this will replace the existing document
      await this.unifiedStorage.storeBatch([updatedDoc]);

      if (reEmbed) {
        this.logger.debug(`✅ Document ${documentId} re-embedded and updated`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to update document ${documentId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get existing document from Qdrant
   */
  private async getExistingDocument(
    documentId: string,
  ): Promise<MasterDocument | null> {
    try {
      // Use the same UUID generation as storage
      const uuid = this.generatePointId(documentId);
      const collectionName = this.unifiedStorage.getCollectionName();

      // Get the point from Qdrant using QdrantClientService
      const point = await this.qdrantClient.getPoint(collectionName, uuid);
      if (!point) {
        return null;
      }

      return point.payload as MasterDocument;
    } catch (error) {
      this.logger.error(
        `Failed to get existing document ${documentId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Generate consistent point ID for Qdrant (same as UnifiedStorageService)
   */
  private generatePointId(documentId: string): string {
    // Use the same namespace as UnifiedStorageService
    return uuidv5(documentId, '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
  }

  /**
   * Utility method to add delays between requests
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Result interface for update operations
 */
export interface UpdateResult {
  success: boolean;
  totalCandidates: number;
  processed: number;
  updated: number;
  errors: string[];
  processingTime: number;
  dryRun: boolean;
}
