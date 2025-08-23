import { Injectable } from '@nestjs/common';

export interface CrawledPageLike {
  url: string;
  content: string;
}

@Injectable()
export class WebsiteDedupService {
  // Fast exact duplicate removal by content hash
  removeExactDuplicates(pages: CrawledPageLike[]): CrawledPageLike[] {
    const seen = new Set<string>();
    const out: CrawledPageLike[] = [];
    for (const p of pages) {
      const key = this.hashString(p.content);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }

  // Near-duplicate removal using simple shingling + Jaccard
  removeNearDuplicates(
    pages: CrawledPageLike[],
    opts: { shingleSize?: number; threshold?: number } = {},
  ): CrawledPageLike[] {
    const k = opts.shingleSize ?? 5;
    const threshold = opts.threshold ?? 0.92; // aggressive for web docs
    const fingerprints = pages.map((p) =>
      this.shingleFingerprint(p.content, k),
    );
    const keep: boolean[] = new Array(pages.length).fill(true);
    for (let i = 0; i < pages.length; i++) {
      if (!keep[i]) continue;
      for (let j = i + 1; j < pages.length; j++) {
        if (!keep[j]) continue;
        const sim = this.jaccard(fingerprints[i], fingerprints[j]);
        if (sim >= threshold) keep[j] = false;
      }
    }
    return pages.filter((_, idx) => keep[idx]);
  }

  private shingleFingerprint(text: string, k: number): Set<string> {
    const tokens = (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const set = new Set<string>();
    for (let i = 0; i <= tokens.length - k; i++) {
      set.add(tokens.slice(i, i + k).join(' '));
    }
    return set.size > 0 ? set : new Set(tokens);
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  private hashString(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return String(h);
  }
}
