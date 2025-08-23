import { Injectable, Logger } from '@nestjs/common';
import { OpenAiAdapter } from '../../../llm/openai.service';
import { LlmConversation } from '../../../llm/llm-adapter.interface';
import {
  DistilledItem,
  DistillationResultItem,
} from '../models/website-distillation.model';

@Injectable()
export class WebsiteSummarizerService {
  private readonly logger = new Logger(WebsiteSummarizerService.name);
  constructor(private readonly llm: OpenAiAdapter) {}

  async distillCluster(params: {
    clusterId: string;
    rootUrl: string;
    documents: { url: string; text: string }[];
    maxItemChars?: number;
    maxBatchChars?: number; // char-based budget per LLM call (roughly tokens*4)
  }): Promise<DistillationResultItem[]> {
    const { clusterId, documents } = params;
    const maxItemChars = params.maxItemChars ?? 8000;
    const maxBatchChars = params.maxBatchChars ?? 60000; // ~15k tokens budget
    if (!documents || documents.length === 0) return [];
    // Build batches of documents under char budget
    const batches: { url: string; text: string }[][] = [];
    let current: { url: string; text: string }[] = [];
    let currentChars = 0;
    const overheadPerDoc = 64; // prompt scaffolding per doc
    for (const d of documents) {
      const docChars =
        (d.text || '').length + (d.url || '').length + overheadPerDoc;
      if (currentChars + docChars > maxBatchChars && current.length > 0) {
        batches.push(current);
        current = [];
        currentChars = 0;
      }
      current.push(d);
      currentChars += docChars;
    }
    if (current.length > 0) batches.push(current);

    type LlmResponse = { items: DistilledItem[] };
    const allItems: DistilledItem[] = [];

    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              topics: { type: 'array', items: { type: 'string' } },
              keywords: { type: 'array', items: { type: 'string' } },
              sourceUrls: { type: 'array', items: { type: 'string' } },
              text: { type: 'string' },
            },
            required: ['topics', 'keywords', 'sourceUrls', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    } as const;

    for (const batch of batches) {
      const conversation: LlmConversation = {
        messages: [
          {
            role: 'system' as const,
            content:
              'You are an expert technical editor. Distill website pages into a concise set of high-value knowledge items. ' +
              'Remove boilerplate, navigation, and repetition. Focus on accurate, complete, and non-duplicative content. ' +
              'Return strict JSON matching the requested schema.',
          },
          {
            role: 'user' as const,
            content: this.buildUserPrompt(batch),
          },
        ],
      };
      try {
        const responseJson =
          await this.llm.generateStructuredOutput<LlmResponse>(
            conversation,
            schema as any,
            { temperature: 0.2 },
          );
        if (Array.isArray(responseJson.items)) {
          allItems.push(
            ...responseJson.items.map((it) => ({
              ...it,
              sourceUrls:
                it.sourceUrls && it.sourceUrls.length > 0
                  ? it.sourceUrls
                  : batch.map((b) => b.url),
            })),
          );
        }
      } catch (err: any) {
        this.logger.error(
          `LLM distillation batch failed: ${err?.message || err}`,
        );
      }
    }

    // Normalize items into ordered parts with tracking ids
    const normalized: DistillationResultItem[] = [];
    let indexCounter = 0;
    for (const item of allItems) {
      const trackingBase = `${clusterId}-${(++indexCounter)
        .toString()
        .padStart(3, '0')}`;
      const parts = this.splitText(item.text || '', maxItemChars);
      const totalParts = Math.max(1, parts.length);
      for (let i = 0; i < totalParts; i++) {
        normalized.push({
          title: item.title,
          topics: item.topics || [],
          keywords: item.keywords || [],
          sourceUrls: item.sourceUrls || [],
          text: parts[i],
          trackingId:
            totalParts > 1 ? `${trackingBase}-p${i + 1}` : trackingBase,
          order: `${i + 1}/${totalParts}`,
        });
      }
    }

    return normalized;
  }

  private buildUserPrompt(docs: { url: string; text: string }[]): string {
    const header = [
      'Distill the following website pages into a small set of high-value knowledge items.',
      'Rules:',
      '- Remove navigation, boilerplate, and repeated content.',
      '- Merge duplicates; ensure items are self-contained and accurate.',
      '- Include arrays: topics (3-8), keywords (5-15), and sourceUrls (full paths).',
      '- Output JSON only with the schema: { "items": [{ "title?": string, "topics": string[], "keywords": string[], "sourceUrls": string[], "text": string }] }',
      '',
      'Pages:',
    ];
    const body: string[] = [];
    for (const d of docs) {
      const fullText = d.text || '';
      body.push(`URL: ${d.url}\nCONTENT:\n${fullText}`);
    }
    return [...header, ...body].join('\n');
  }

  private splitText(text: string, maxChars: number): string[] {
    if (!text || text.length <= maxChars) return [text];
    const parts: string[] = [];
    let i = 0;
    while (i < text.length) {
      parts.push(text.slice(i, i + maxChars));
      i += maxChars;
    }
    return parts;
  }
}
