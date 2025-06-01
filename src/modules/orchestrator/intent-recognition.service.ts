import { Injectable, Logger } from '@nestjs/common';
import { ConversationContext } from '../integrations/openserv/models/openserv.model';

export interface IntentResult {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  suggestedAgents: string[];
  requiresMultiAgent: boolean;
}

export interface IntentPattern {
  keywords: string[];
  confidence: number;
  agents: string[];
  multiAgent?: boolean;
  entityExtraction?: Record<string, RegExp>;
}

@Injectable()
export class IntentRecognitionService {
  private readonly logger = new Logger(IntentRecognitionService.name);
  private intentPatterns: Map<string, IntentPattern> = new Map();

  constructor() {
    this.initializePatterns();
  }

  async recognizeIntent(
    message: string,
    context?: ConversationContext,
  ): Promise<IntentResult> {
    const lowerMessage = message.toLowerCase();
    let bestMatch: IntentResult = {
      intent: 'general',
      confidence: 0,
      entities: {},
      suggestedAgents: ['defi-agent'],
      requiresMultiAgent: false,
    };

    // Check each pattern
    for (const [intent, pattern] of this.intentPatterns.entries()) {
      const result = this.matchPattern(lowerMessage, intent, pattern);

      if (result.confidence > bestMatch.confidence) {
        bestMatch = result;
      }
    }

    // Enhance with context
    if (context) {
      bestMatch = this.enhanceWithContext(bestMatch, context);
    }

    // Extract entities
    bestMatch.entities = this.extractEntities(message, bestMatch.intent);

    this.logger.debug(
      `Intent recognized: ${bestMatch.intent} (${(bestMatch.confidence * 100).toFixed(1)}%)`,
    );

    return bestMatch;
  }

  private initializePatterns(): void {
    // Portfolio & Wallet Management
    this.intentPatterns.set('portfolio-analysis', {
      keywords: [
        'portfolio',
        'balance',
        'holdings',
        'wallet',
        'assets',
        'my tokens',
      ],
      confidence: 0.9,
      agents: ['wallet-agent'],
      entityExtraction: {
        walletAddress: /kaspa:[a-zA-Z0-9]{61}/g,
      },
    });

    // Token Research & Information
    this.intentPatterns.set('token-research', {
      keywords: [
        'token',
        'coin',
        'price',
        'info',
        'research',
        'details',
        'about',
      ],
      confidence: 0.85,
      agents: ['token-registry-agent', 'trading-agent'],
      multiAgent: true,
      entityExtraction: {
        tokenSymbol: /\b[A-Z]{2,10}\b/g,
      },
    });

    // Trading Operations
    this.intentPatterns.set('trading', {
      keywords: ['trade', 'buy', 'sell', 'order', 'market', 'exchange'],
      confidence: 0.9,
      agents: ['trading-agent'],
      entityExtraction: {
        tokenSymbol: /\b[A-Z]{2,10}\b/g,
        amount: /\d+\.?\d*/g,
      },
    });

    // DeFi Operations
    this.intentPatterns.set('defi-operations', {
      keywords: ['swap', 'liquidity', 'pool', 'yield', 'farm', 'stake', 'dex'],
      confidence: 0.9,
      agents: ['defi-agent'],
      entityExtraction: {
        tokenSymbol: /\b[A-Z]{2,10}\b/g,
        amount: /\d+\.?\d*/g,
      },
    });

    // Complex Analysis
    this.intentPatterns.set('complex-analysis', {
      keywords: [
        'analyze',
        'compare',
        'strategy',
        'recommend',
        'optimize',
        'best',
      ],
      confidence: 0.8,
      agents: ['wallet-agent', 'trading-agent', 'token-registry-agent'],
      multiAgent: true,
    });

    // User Management
    this.intentPatterns.set('user-management', {
      keywords: [
        'settings',
        'preferences',
        'notifications',
        'profile',
        'account',
      ],
      confidence: 0.85,
      agents: ['user-management-agent'],
    });

    // Market Data & Monitoring
    this.intentPatterns.set('market-monitoring', {
      keywords: ['market', 'trending', 'gainers', 'losers', 'volume', 'cap'],
      confidence: 0.8,
      agents: ['trading-agent', 'token-registry-agent'],
      multiAgent: true,
    });

    // General Help
    this.intentPatterns.set('help', {
      keywords: ['help', 'how', 'what', 'explain', 'guide', 'tutorial'],
      confidence: 0.7,
      agents: ['defi-agent'],
    });
  }

  private matchPattern(
    message: string,
    intent: string,
    pattern: IntentPattern,
  ): IntentResult {
    const matches = pattern.keywords.filter((keyword) =>
      message.includes(keyword),
    );

    const confidence =
      matches.length > 0
        ? (matches.length / pattern.keywords.length) * pattern.confidence
        : 0;

    return {
      intent,
      confidence,
      entities: {},
      suggestedAgents: pattern.agents,
      requiresMultiAgent: pattern.multiAgent || false,
    };
  }

  private enhanceWithContext(
    result: IntentResult,
    context: ConversationContext,
  ): IntentResult {
    // Check for continuation patterns
    if (context.activeWorkflow) {
      // User is continuing an existing workflow
      result.confidence += 0.1;
    }

    // Check recent conversation context
    const recentMessages = context.messages.slice(-3);
    const recentContent = recentMessages
      .map((m) => m.content.toLowerCase())
      .join(' ');

    // Boost confidence if similar topics discussed recently
    if (this.intentPatterns.has(result.intent)) {
      const pattern = this.intentPatterns.get(result.intent)!;
      const contextMatches = pattern.keywords.filter((keyword) =>
        recentContent.includes(keyword),
      );

      if (contextMatches.length > 0) {
        result.confidence += 0.1;
      }
    }

    // Update intent based on context
    if (context.currentIntent && context.currentIntent !== result.intent) {
      // Check if this is a follow-up question
      const followUpKeywords = ['also', 'and', 'what about', 'how about'];
      const hasFollowUp = followUpKeywords.some((keyword) =>
        recentContent.includes(keyword),
      );

      if (hasFollowUp) {
        result.requiresMultiAgent = true;
      }
    }

    return result;
  }

  private extractEntities(
    message: string,
    intent: string,
  ): Record<string, any> {
    const entities: Record<string, any> = {};
    const pattern = this.intentPatterns.get(intent);

    if (!pattern?.entityExtraction) {
      return entities;
    }

    for (const [entityType, regex] of Object.entries(
      pattern.entityExtraction,
    )) {
      const matches = message.match(regex);
      if (matches) {
        entities[entityType] = matches.length === 1 ? matches[0] : matches;
      }
    }

    // Extract additional common entities
    entities.mentions = this.extractMentions(message);
    entities.amounts = this.extractAmounts(message);
    entities.timeframes = this.extractTimeframes(message);

    return entities;
  }

  private extractMentions(message: string): string[] {
    const mentions = message.match(/@\w+/g) || [];
    return mentions.map((mention) => mention.substring(1));
  }

  private extractAmounts(message: string): number[] {
    const amounts = message.match(/\d+\.?\d*/g) || [];
    return amounts.map((amount) => parseFloat(amount)).filter((n) => !isNaN(n));
  }

  private extractTimeframes(message: string): string[] {
    const timeframes = [
      '1h',
      '24h',
      '7d',
      '30d',
      '1y',
      'hour',
      'day',
      'week',
      'month',
      'year',
    ];
    return timeframes.filter((tf) => message.toLowerCase().includes(tf));
  }

  // Add custom patterns dynamically
  addPattern(intent: string, pattern: IntentPattern): void {
    this.intentPatterns.set(intent, pattern);
    this.logger.debug(`Added custom intent pattern: ${intent}`);
  }

  // Get all available intents
  getAvailableIntents(): string[] {
    return Array.from(this.intentPatterns.keys());
  }

  // Update pattern confidence based on user feedback
  updatePatternConfidence(
    intent: string,
    feedback: 'correct' | 'incorrect',
  ): void {
    const pattern = this.intentPatterns.get(intent);
    if (pattern) {
      // Adjust confidence based on feedback
      const adjustment = feedback === 'correct' ? 0.05 : -0.05;
      pattern.confidence = Math.max(
        0.1,
        Math.min(1.0, pattern.confidence + adjustment),
      );

      this.logger.debug(
        `Updated confidence for ${intent}: ${pattern.confidence}`,
      );
    }
  }
}
