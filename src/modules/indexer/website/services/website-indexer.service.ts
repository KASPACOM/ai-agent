import { Injectable, Logger } from '@nestjs/common';
import { WebsiteClusteringService } from './website-clustering.service';
import { UnifiedStorageService } from '../../shared/services/unified-storage.service';
import { IndexerConfigService } from '../../shared/config/indexer.config';
import { Document } from 'langchain/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { EmbeddingService } from '../../../embedding/embedding.service';
import { GenericCrawlerService } from './generic-crawler.service';
import { MasterDocument } from '../../shared/models/master-document.model';

import { WebsiteClusteringMethod } from '../../shared/models/website-clustering-method.enum';
import { WebsiteIndexOptions } from '../models/website-index.model';
import { ClusterInputChunk } from '../models/website-clustering.model';
import { WebsiteSummarizerService } from './website-summarizer.service';
import { WebsiteDistillationTransformer } from '../transformers/website-distillation.transformer';
import { WebsiteDedupService } from './website-dedup.service';

@Injectable()
export class WebsiteIndexerService {
  private readonly logger = new Logger(WebsiteIndexerService.name);

  constructor(
    private readonly clustering: WebsiteClusteringService,
    private readonly unifiedStorage: UnifiedStorageService,
    private readonly config: IndexerConfigService,
    private readonly embeddingService: EmbeddingService,
    private readonly genericCrawler: GenericCrawlerService,
    private readonly summarizer: WebsiteSummarizerService,
    private readonly dedup: WebsiteDedupService,
  ) {}

  // Local helper for centroid proximity
  private cosineDistance(a: number[], b: number[]): number {
    let dot = 0;
    let ma = 0;
    let mb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      ma += a[i] * a[i];
      mb += b[i] * b[i];
    }
    const denom = Math.sqrt(ma) * Math.sqrt(mb) || 1;
    return 1 - dot / denom;
  }

  async indexWebsite(opts: WebsiteIndexOptions) {
    const startedAt = Date.now();
    const url = opts.url;
    // Depth left unused by design (full-site crawl preferred)

    // 1) Fetch pages with fallback and structured errors
    let pages: { url: string; content: string }[] = [];
    try {
      pages = await this.genericCrawler.crawl({
        startUrl: url,
        maxDepth: 4,
        maxRequests: 1000,
        sameDomain: true,
        sameSubdomains: true,
        include: undefined,
        exclude: [
          '\\.(png|jpg|jpeg|gif|svg|webp|ico)$',
          '\\.(zip|gz|rar|7z)$',
          '\\.(pdf|doc|docx|xls|xlsx)$',
        ],
        respectRobotsTxt: true,
        userAgent: undefined,
      });
    } catch (gerr: any) {
      this.logger.error(
        `Generic crawler failed for ${url}: ${gerr?.message || gerr}`,
      );
      return {
        success: false,
        pages: 0,
        chunks: 0,
        clusters: 0,
        stored: 0,
        errors: [String(gerr?.message || gerr)],
        processingTimeMs: Date.now() - startedAt,
      };
    }

    pages = this.dedup.removeExactDuplicates(pages);
    pages = this.dedup.removeNearDuplicates(pages, {
      shingleSize: 5,
      threshold: 0.92,
    });

    if (pages.length === 0) {
      return {
        success: true,
        pages: 0,
        chunks: 0,
        clusters: 0,
        stored: 0,
        errors: [],
      };
    }

    // 2) Normalize to LangChain Documents
    const docs: Document[] = pages.map(
      (p) =>
        new Document({
          pageContent: p.content || '',
          metadata: {
            source: p.url,
            type: 'website',
            crawledAt: new Date().toISOString(),
            rootUrl: url,
          },
        }),
    );

    // 3) Chunking via LangChain
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.config.getPDFMaxTokensPerChunk(), // reuse token-ish size
      chunkOverlap: this.config.getPDFOverlapTokens(),
    });
    const chunks = await splitter.splitDocuments(docs);

    // Build cluster inputs
    const inputChunks: ClusterInputChunk[] = chunks.map((c, i) => ({
      id: `${i}`,
      text: c.pageContent,
      url: c.metadata?.source,
    }));

    // 4) Cluster with auto-k if not provided
    const clusterResults = await this.clustering.cluster(inputChunks, {
      k: opts.k,
      method: (opts.method || WebsiteClusteringMethod.KMEANS) as any,
      autoKRange: [4, 20],
      subsampleSize: 400,
    });

    // Group chunks by cluster
    const idToChunk = new Map(inputChunks.map((c) => [c.id, c]));
    const masterDocs: MasterDocument[] = [];

    for (const cluster of clusterResults) {
      const members = cluster.memberIds
        .map((id) => idToChunk.get(id)!)
        .filter(Boolean);
      // Build documents for LLM distillation (no vectors)
      const docsForCluster = members.map((m) => ({
        url: m.url || url,
        text: m.text,
      }));

      // Distill to fewer, valuable items
      const distilled = await this.summarizer.distillCluster({
        clusterId: String(cluster.clusterId),
        rootUrl: url,
        documents: docsForCluster,
      });

      const distilledDocs = WebsiteDistillationTransformer.toMasterDocuments({
        url,
        clusterId: cluster.clusterId,
        clusterSize: cluster.memberIds.length,
        method: cluster.method,
        silhouette: cluster.silhouette,
        intraClusterDistance: cluster.intraClusterDistance,
        items: distilled,
        fallbackUrls: docsForCluster.map((d) => d.url),
      });
      masterDocs.push(...distilledDocs);
    }

    // 5) Store distilled items only; vectors will be generated on write
    const storeResult = await this.unifiedStorage.storeBatch(masterDocs);

    return {
      success: storeResult.success,
      pages: pages.length,
      chunks: inputChunks.length,
      clusters: clusterResults.length,
      stored: storeResult.stored,
      errors: storeResult.errors,
      processingTimeMs: Date.now() - startedAt,
    };
  }
}
