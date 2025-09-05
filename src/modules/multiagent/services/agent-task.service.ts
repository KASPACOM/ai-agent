import { Injectable, Logger } from '@nestjs/common';
import { QdrantRepository } from '../../database/qdrant/services/qdrant.repository';
import { MessageSource } from '../../indexer/shared/models/message-source.enum';
import { OpenAiAdapter } from '../../llm/openai.service';
import {
  BUCKET_SUMMARY_SYSTEM_PROMPT,
  buildBucketUserPrompt,
} from '../../prompt-builder/prompts/orchestrator/summary.prompts';

@Injectable()
export class AgentTaskService {
  private readonly logger = new Logger(AgentTaskService.name);

  constructor(
    private readonly qdrantRepository: QdrantRepository,
    private readonly openai: OpenAiAdapter,
  ) {}

  async createWeeklySummary(days: number = 7): Promise<any> {
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const docs =
      await this.qdrantRepository.getUnifiedDocumentsByDateAndSources({
        sources: [MessageSource.TWITTER, MessageSource.TELEGRAM],
        sinceIso: since.toISOString(),
        untilIso: now.toISOString(),
        limit: 1000,
      });

    const twitterBuckets = new Map<string, any[]>();
    const telegramBuckets = new Map<string, any[]>();

    for (const doc of docs) {
      if (doc.source === MessageSource.TWITTER) {
        const key = (doc.authorHandle || 'unknown').toLowerCase();
        if (!twitterBuckets.has(key)) twitterBuckets.set(key, []);
        twitterBuckets.get(key)!.push(doc);
      } else if (doc.source === MessageSource.TELEGRAM) {
        const channel = doc.telegramChannelTitle || 'Telegram';
        const topic = doc.telegramTopicTitle
          ? `#${doc.telegramTopicTitle}`
          : '';
        const key = topic ? `${channel} ${topic}` : channel;
        if (!telegramBuckets.has(key)) telegramBuckets.set(key, []);
        telegramBuckets.get(key)!.push(doc);
      }
    }

    const summarizeBucket = async (key: string, items: any[]) => {
      const sorted = items
        .filter((i) => typeof i?.text === 'string' && i.text.trim().length > 0)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      // Build richer lines: author display name, date, and url if available
      const joined = sorted
        .map((i) => {
          const author = i.author || i.authorHandle || 'Unknown';
          const date = i.createdAt || '';
          const url = i.url || '';
          return `- [${author}] ${i.text}${url ? ` (link: ${url})` : ''} [${date}]`;
        })
        .join('\n');

      const conversation = {
        messages: [
          {
            role: 'system',
            content: BUCKET_SUMMARY_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: buildBucketUserPrompt({ bucketKey: key, lines: joined }),
          },
        ],
      } as any;

      const schema = {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          key_points: { type: 'array', items: { type: 'string' } },
          key_links: { type: 'array', items: { type: 'string' } },
          notable_authors: { type: 'array', items: { type: 'string' } },
        },
        required: ['summary', 'key_points'],
      } as const;

      const result = await this.openai.generateStructuredOutput<any>(
        conversation,
        schema,
        { temperature: 0.5, maxTokens: 800 },
      );

      return {
        key,
        count: sorted.length,
        summary: result.summary || '',
        key_points: result.key_points || [],
        key_links: result.key_links || [],
        notable_authors: result.notable_authors || [],
      };
    };

    const bucketResults: any[] = [];
    for (const [k, v] of twitterBuckets) {
      bucketResults.push(await summarizeBucket(`twitter:@${k}`, v));
    }
    for (const [k, v] of telegramBuckets) {
      bucketResults.push(await summarizeBucket(`telegram:${k}`, v));
    }

    return {
      buckets: bucketResults,
      overall: {
        highlights: [],
        themes: [],
      },
      window: { days, since: since.toISOString(), until: now.toISOString() },
    };
  }
}
