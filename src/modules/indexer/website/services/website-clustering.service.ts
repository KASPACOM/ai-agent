import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../../../embedding/embedding.service';
import { EmbeddingTransformer } from '../../shared/transformers/embedding.transformer';
import { WebsiteClusteringMethod } from '../../shared/models/website-clustering-method.enum';
import {
  ClusterInputChunk,
  ClusterOptions,
  ClusterResult,
} from '../models/website-clustering.model';

@Injectable()
export class WebsiteClusteringService {
  private readonly logger = new Logger(WebsiteClusteringService.name);

  constructor(private readonly embeddingService: EmbeddingService) {}

  async ensureEmbeddings(chunks: ClusterInputChunk[]): Promise<number[][]> {
    const texts = chunks.map((c) => c.text);
    const request = EmbeddingTransformer.createEmbeddingRequest(
      texts,
      EmbeddingTransformer.getDefaultEmbeddingModel(),
      `website_chunks_${Date.now()}`,
    );
    const response = await this.embeddingService.generateEmbeddings(request);
    const vectors = response.embeddings.map((e) => e.vector);
    chunks.forEach((c, i) => (c.embedding = vectors[i]));
    return vectors;
  }

  private normalize(vec: number[]): number[] {
    const mag = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    if (mag === 0) return vec;
    return vec.map((x) => x / mag);
  }

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

  private mean(vectors: number[][]): number[] {
    const n = vectors.length;
    if (n === 0) return [];
    const d = vectors[0].length;
    const out = new Array(d).fill(0);
    for (const v of vectors) {
      for (let i = 0; i < d; i++) out[i] += v[i];
    }
    for (let i = 0; i < d; i++) out[i] /= n;
    return out;
  }

  public computeCentroid(vectors: number[][]): number[] {
    return this.mean(vectors);
  }

  private silhouetteScore(labels: number[], vectors: number[][]): number {
    const n = vectors.length;
    if (n <= 1) return 0;
    const clusters: Record<number, number[]> = {};
    labels.forEach((k, i) => {
      clusters[k] = clusters[k] || [];
      clusters[k].push(i);
    });
    const distances: number[][] = new Array(n)
      .fill(0)
      .map(() => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = this.cosineDistance(vectors[i], vectors[j]);
        distances[i][j] = d;
        distances[j][i] = d;
      }
    }
    let total = 0;
    for (let i = 0; i < n; i++) {
      const k = labels[i];
      const own = clusters[k];
      const a =
        own.length > 1
          ? own
              .filter((j) => j !== i)
              .reduce((s, j) => s + distances[i][j], 0) /
            (own.length - 1)
          : 0;
      let b = Infinity;
      for (const k2Str of Object.keys(clusters)) {
        const k2 = parseInt(k2Str, 10);
        if (k2 === k) continue;
        const others = clusters[k2];
        const avg =
          others.reduce((s, j) => s + distances[i][j], 0) / others.length;
        if (avg < b) b = avg;
      }
      const s = (b - a) / Math.max(a, b || 1);
      total += s;
    }
    return total / n;
  }

  private kmeans(
    vectors: number[][],
    k: number,
    maxIter = 100,
  ): { labels: number[]; centroids: number[][] } {
    const n = vectors.length;
    const d = vectors[0].length;
    // init: pick k random points
    const indices = Array.from({ length: n }, (_, i) => i)
      .sort(() => Math.random() - 0.5)
      .slice(0, k);
    let centroids = indices.map((i) => [...vectors[i]]);
    const labels = new Array(n).fill(0);
    for (let iter = 0; iter < maxIter; iter++) {
      // assign
      let changed = false;
      for (let i = 0; i < n; i++) {
        let best = 0;
        let bestD = Infinity;
        for (let c = 0; c < k; c++) {
          const d = this.cosineDistance(vectors[i], centroids[c]);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        if (labels[i] !== best) {
          labels[i] = best;
          changed = true;
        }
      }
      // update
      const groups: number[][][] = Array.from({ length: k }, () => []);
      for (let i = 0; i < n; i++) groups[labels[i]].push(vectors[i]);
      const newCentroids = groups.map((g) =>
        g.length ? this.mean(g) : new Array(d).fill(0),
      );
      // check convergence
      let shift = 0;
      for (let c = 0; c < k; c++)
        shift += this.cosineDistance(centroids[c], newCentroids[c]);
      centroids = newCentroids;
      if (!changed || shift < 1e-6) break;
    }
    return { labels, centroids };
  }

  async cluster(
    chunks: ClusterInputChunk[],
    opts: ClusterOptions,
  ): Promise<ClusterResult[]> {
    if (chunks.length === 0) return [];
    // Ensure embeddings
    const vectors = chunks[0].embedding
      ? chunks.map((c) => c.embedding!)
      : await this.ensureEmbeddings(chunks);
    const normalized = vectors.map((v) => this.normalize(v));

    // Subsample indices for k selection
    const n = normalized.length;
    const subsampleSize = Math.min(opts.subsampleSize || 400, n);
    const subsampleIdx = Array.from({ length: n }, (_, i) => i)
      .sort(() => Math.random() - 0.5)
      .slice(0, subsampleSize);
    const subsVectors = subsampleIdx.map((i) => normalized[i]);

    const method: WebsiteClusteringMethod =
      opts.method || WebsiteClusteringMethod.KMEANS;
    let k = opts.k;
    if (!k) {
      const [kMin, kMax] = opts.autoKRange || [4, 20];
      let bestK = kMin;
      let bestScore = -Infinity;
      for (let cand = kMin; cand <= kMax; cand++) {
        if (cand >= subsampleSize) break;
        const { labels } = this.kmeans(subsVectors, cand);
        const score = this.silhouetteScore(labels, subsVectors);
        if (score > bestScore) {
          bestScore = score;
          bestK = cand;
        }
      }
      k = bestK;
      this.logger.log(
        `Auto-selected k=${k} (silhouette=${bestScore.toFixed(3)})`,
      );
    }

    // Final clustering on full set
    const { labels, centroids } = this.kmeans(normalized, k!);

    // Build results
    const groups: Record<number, number[]> = {};
    labels.forEach((lbl, i) => {
      groups[lbl] = groups[lbl] || [];
      groups[lbl].push(i);
    });

    const sil = this.silhouetteScore(labels, normalized);

    const results: ClusterResult[] = Object.keys(groups).map((kStr) => {
      const idxs = groups[parseInt(kStr, 10)];
      const members = idxs.map((i) => chunks[i]);
      const centroid = this.mean(idxs.map((i) => normalized[i]));
      // average intra-cluster distance to centroid
      const intra =
        idxs.reduce(
          (s, i) => s + this.cosineDistance(normalized[i], centroid),
          0,
        ) / idxs.length;
      return {
        clusterId: kStr,
        method,
        memberIds: members.map((m) => m.id),
        centroid,
        silhouette: sil,
        intraClusterDistance: intra,
      };
    });

    return results;
  }
}
