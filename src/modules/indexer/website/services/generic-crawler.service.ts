import { Injectable, Logger } from '@nestjs/common';
import { PlaywrightCrawler, log } from 'crawlee';
import axios from 'axios';
import { CrawlPolicy } from '../models/crawler-policy.model';
import { CrawledPage } from '../models/crawled-page.model';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import * as Turndown from 'turndown';
import { Readability } from '@mozilla/readability';

@Injectable()
export class GenericCrawlerService {
  private readonly logger = new Logger(GenericCrawlerService.name);

  async crawl(policy: CrawlPolicy): Promise<CrawledPage[]> {
    const results: CrawledPage[] = [];
    const startHost = new URL(policy.startUrl).hostname;
    const turndownCtor: any = (Turndown as any).default || (Turndown as any);
    const turndown = new turndownCtor();
    const includeRegex = (policy.include || []).map((s) => new RegExp(s));
    const excludeRegex = (policy.exclude || []).map((s) => new RegExp(s));

    log.setLevel(log.LEVELS.INFO);

    // robots.txt cache per origin
    const robotsCache = new Map<
      string,
      {
        allow: string[];
        disallow: string[];
        crawlDelay?: number;
        fetchedAt: number;
      }
    >();

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    ];
    const chosenUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    const crawler = new PlaywrightCrawler({
      headless: true,
      maxRequestsPerCrawl: policy.maxRequests,
      maxConcurrency: 1,
      useSessionPool: true,
      requestHandlerTimeoutSecs: 60,
      launchContext: {
        launchOptions: { args: ['--no-sandbox'] },
        userAgent: chosenUA,
      },
      preNavigationHooks: [
        async ({ page, request }) => {
          // Realistic headers
          try {
            await page.setExtraHTTPHeaders({
              Accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              DNT: '1',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'same-origin',
              'Sec-Fetch-User': '?1',
              Referer: new URL(request.url).origin,
            });
          } catch {}

          // Small polite jitter (<= 3s)
          const base = 400; // ms
          const jitter = Math.floor(Math.random() * 1600); // 0-1600ms
          await page.waitForTimeout(base + jitter);
        },
      ],
      async requestHandler({ request, page, enqueueLinks }) {
        const url = request.url;
        const currentDepth = Number((request as any).userData?.depth ?? 0);
        if (currentDepth > policy.maxDepth) return;
        if (!selfAllowed(url)) return;
        if (policy.respectRobotsTxt) {
          const allowed = await robotsAllowed(url, chosenUA);
          if (!allowed) return;
        }
        if (!included(url)) return;
        const response = await page.goto(url, {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        });
        if (response?.status() === 429) {
          await page.waitForTimeout(5000);
          throw new Error('HTTP_429');
        }
        const ctype = (response?.headers()['content-type'] || '').toLowerCase();
        if (!ctype.includes('text/html')) return;
        const html = await page.content();
        const markdown = extractMarkdown(html, url);
        if (markdown && markdown.trim().length > 200) {
          results.push({ url, content: markdown });
        }
        await enqueueLinks({
          strategy: 'same-domain',
          transformRequestFunction: (req) => {
            try {
              const u = new URL(req.url);
              if (!policy.sameSubdomains && u.hostname !== startHost)
                return null;
              if (!included(req.url)) return null;
              if (policy.respectRobotsTxt) {
                const ok = robotsAllowedSync(req.url);
                if (!ok) return null;
              }
              const nextDepth = currentDepth + 1;
              if (nextDepth > policy.maxDepth) return null;
              (req as any).userData = {
                ...(req.userData || {}),
                depth: nextDepth,
              };
              return req;
            } catch {
              return null;
            }
          },
        });
      },
      failedRequestHandler({ request }) {
        log.warning(`Request failed: ${request.url}`);
      },
    });

    const selfAllowed = (urlStr: string) => {
      try {
        const u = new URL(urlStr);
        if (!['http:', 'https:'].includes(u.protocol)) return false;
        if (!policy.sameDomain && !policy.sameSubdomains) return true;
        if (policy.sameDomain && !policy.sameSubdomains)
          return u.hostname === startHost;
        return u.hostname === startHost || u.hostname.endsWith('.' + startHost);
      } catch {
        return false;
      }
    };

    const included = (urlStr: string) => {
      if (excludeRegex.some((rx) => rx.test(urlStr))) return false;
      if (includeRegex.length === 0) return true;
      return includeRegex.some((rx) => rx.test(urlStr));
    };

    const robotsAllowed = async (
      urlStr: string,
      ua: string,
    ): Promise<boolean> => {
      try {
        const u = new URL(urlStr);
        const origin = u.origin;
        const now = Date.now();
        let entry = robotsCache.get(origin);
        if (!entry || now - entry.fetchedAt > 60 * 60 * 1000) {
          // fetch robots
          let content = '';
          try {
            const resp = await axios.get(origin + '/robots.txt', {
              timeout: 5000,
              validateStatus: () => true,
            });
            content = typeof resp.data === 'string' ? resp.data : '';
          } catch {
            content = '';
          }
          const parsed = parseRobots(content, ua);
          entry = { ...parsed, fetchedAt: now } as any;
          robotsCache.set(origin, entry);
        }
        // optional crawl delay
        if (entry.crawlDelay && entry.crawlDelay > 0 && entry.crawlDelay < 10) {
          await new Promise((r) =>
            setTimeout(r, Math.floor(entry.crawlDelay * 1000)),
          );
        }
        return evaluatePath(
          new URL(urlStr).pathname,
          entry.allow,
          entry.disallow,
        );
      } catch {
        return true;
      }
    };

    const robotsAllowedSync = (urlStr: string): boolean => {
      try {
        const u = new URL(urlStr);
        const origin = u.origin;
        const entry = robotsCache.get(origin);
        if (!entry) return true; // not fetched yet; allow enqueue, pre-nav will check
        return evaluatePath(u.pathname, entry.allow, entry.disallow);
      } catch {
        return true;
      }
    };

    const parseRobots = (
      content: string,
      ua: string,
    ): { allow: string[]; disallow: string[]; crawlDelay?: number } => {
      if (!content) return { allow: [], disallow: [] };
      const lines = content.split(/\r?\n/).map((l) => l.trim());
      let active = false;
      let activeAny = false;
      const allow: string[] = [];
      const disallow: string[] = [];
      let crawlDelay: number | undefined;
      for (const line of lines) {
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const key = line.slice(0, idx).toLowerCase().trim();
        const value = line.slice(idx + 1).trim();
        if (key === 'user-agent') {
          const agent = value.toLowerCase();
          active = agent === '*' || ua.toLowerCase().includes(agent);
          activeAny = agent === '*';
        } else if (active || activeAny) {
          if (key === 'allow') allow.push(value);
          else if (key === 'disallow') disallow.push(value);
          else if (key === 'crawl-delay') {
            const n = Number(value);
            if (!Number.isNaN(n)) crawlDelay = n;
          }
        }
      }
      return { allow, disallow, crawlDelay };
    };

    const evaluatePath = (
      path: string,
      allow: string[],
      disallow: string[],
    ): boolean => {
      const matches = (patterns: string[], type: 'allow' | 'disallow') =>
        patterns
          .filter((p) => p === '' || path.startsWith(p))
          .map((p) => ({ p, type, len: p.length }));
      const all = [
        ...matches(allow, 'allow'),
        ...matches(disallow, 'disallow'),
      ];
      if (all.length === 0) return true;
      all.sort((a, b) => b.len - a.len);
      return all[0].type === 'allow';
    };

    const extractMarkdown = (html: string, url: string): string => {
      try {
        const dom = new JSDOM(html, { url });
        ['script', 'style', 'nav', 'header', 'footer', 'noscript'].forEach(
          (sel) => {
            dom.window.document
              .querySelectorAll(sel)
              .forEach((n) => n.remove());
          },
        );
        const article = new Readability(dom.window.document as any).parse();
        if (article?.content) {
          const title = article?.title || dom.window.document.title || '';
          return turndown.turndown(`<h1>${title}</h1>${article.content}`);
        }
        const $ = cheerio.load(html);
        const selectors = [
          'article',
          'main',
          '[role="main"]',
          '.content',
          '.post',
          '.topic-post',
          '.post-content',
          '.markdown',
          '.entry-content',
          '.cooked',
        ];
        const chunks: string[] = [];
        for (const sel of selectors) {
          $(sel).each((_, el) => {
            const frag = $(el).html() || '';
            if (frag.length > 50) chunks.push(frag);
          });
          if (chunks.length > 0) break;
        }
        if (chunks.length > 0) return turndown.turndown(chunks.join('\n\n'));
        const bodyHtml = dom.window.document.body?.innerHTML || '';
        if (bodyHtml) return turndown.turndown(bodyHtml);
        return (dom.window.document.body?.textContent || '').trim();
      } catch {
        return '';
      }
    };

    await crawler.addRequests([
      { url: policy.startUrl, userData: { depth: 0 } as any },
    ]);
    await crawler.run();
    return results;
  }

  // Helper methods inlined in crawl() to keep a single transformation path per DEVELOPMENT_RULES
}
