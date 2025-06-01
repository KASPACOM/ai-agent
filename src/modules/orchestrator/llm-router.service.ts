import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AgentCapability } from '../integrations/openserv/models/openserv.model';
import { RoutingDecision } from '../multiagent/models/agent.model';
import { PromptBuilderService } from '../prompt-builder/prompt-builder.service';
import { OpenAiAdapter } from './llms/openai.service';
import { LlmConversation } from './llms/llm-adapter.interface';

// === Types for intelligent routing ===
interface RoutingContext {
  conversationHistory?: string[];
  userPreferences?: Record<string, any>;
  recentActions?: string[];
}

/**
 * LLM-based intelligent routing service
 * Uses an LLM to reason about which agent and capability should handle a request
 */
@Injectable()
export class LLMRouterService {
  private readonly logger = new Logger(LLMRouterService.name);
  private readonly availableCapabilities: AgentCapability[] = [];

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly openaiAdapter: OpenAiAdapter,
  ) {
    this.initializeCapabilities();
  }

  /**
   * Use LLM reasoning to determine the best agent and capability for a request
   */
  async routeRequest(
    message: string,
    context?: RoutingContext,
  ): Promise<RoutingDecision> {
    try {
      // Build routing prompt using PromptBuilder
      const builtPrompt = this.promptBuilder.buildRoutingPrompt({
        message,
        context,
      });

      const llmResponse = await this.callLLM(builtPrompt.prompt);
      return this.parseRoutingResponse(llmResponse);
    } catch (error) {
      this.logger.error('LLM routing failed, falling back to default', error);
      return this.getFallbackRouting(message);
    }
  }

  private initializeCapabilities(): void {
    this.availableCapabilities.push(
      // DeFi Agent Capabilities
      {
        agent: 'defi-agent',
        name: 'defi_swap_tokens',
        description: 'Execute token swaps on DeFi protocols',
        schema: {
          examples: [
            'swap 100 KAS for USDT',
            'exchange my tokens',
            'trade KAS to BTC',
          ],
          specializes_in: [
            'token_swapping',
            'dex_interactions',
            'defi_transactions',
          ],
        },
      },
      {
        agent: 'defi-agent',
        name: 'defi_calculate_yield',
        description: 'Calculate yield farming opportunities and APR/APY',
        schema: {
          examples: [
            'what yield can I get?',
            'best farming opportunities',
            'calculate staking rewards',
          ],
          specializes_in: [
            'yield_farming',
            'staking_rewards',
            'liquidity_mining',
          ],
        },
      },
      {
        agent: 'defi-agent',
        name: 'defi_get_pools',
        description: 'Get information about liquidity pools',
        schema: {
          examples: [
            'show me pools',
            'liquidity pool info',
            'available pools for KAS',
          ],
          specializes_in: ['liquidity_pools', 'pool_analytics', 'tvl_data'],
        },
      },
      {
        agent: 'defi-agent',
        name: 'defi_general_query',
        description: 'General DeFi-related queries and education',
        schema: {
          examples: [
            'what is DeFi?',
            'explain liquidity',
            'how does yield farming work?',
          ],
          specializes_in: [
            'defi_education',
            'protocol_explanations',
            'general_defi_info',
          ],
        },
      },

      // Trading Agent Capabilities
      {
        agent: 'trading-agent',
        name: 'trading_get_market_data',
        description: 'Get current market prices, volume, and trading data',
        schema: {
          examples: [
            'KAS price',
            'current NACHO price',
            'market data for token',
            'price of BTC',
          ],
          specializes_in: [
            'current_prices',
            'market_data',
            'trading_volumes',
            'price_feeds',
          ],
        },
      },
      {
        agent: 'trading-agent',
        name: 'trading_get_price_history',
        description: 'Get historical price data and charts',
        schema: {
          examples: [
            'KAS price history',
            'chart for last week',
            'price trends',
            'historical data',
          ],
          specializes_in: [
            'price_history',
            'charts',
            'technical_analysis',
            'price_trends',
          ],
        },
      },
      {
        agent: 'trading-agent',
        name: 'trading_get_order_book',
        description: 'Get order book data and trading depth',
        schema: {
          examples: [
            'order book for KAS',
            'trading depth',
            'buy/sell orders',
            'market depth',
          ],
          specializes_in: [
            'order_books',
            'market_depth',
            'bid_ask_spreads',
            'trading_data',
          ],
        },
      },

      // Token Registry Agent Capabilities
      {
        agent: 'token-registry-agent',
        name: 'token_get_info',
        description:
          'Get comprehensive token information, metadata, and details',
        schema: {
          examples: [
            'tell me about NACHO',
            'token info for KAS',
            'what is this token',
            'token details',
          ],
          specializes_in: [
            'token_metadata',
            'token_details',
            'contract_info',
            'token_research',
          ],
        },
      },
      {
        agent: 'token-registry-agent',
        name: 'token_search',
        description: 'Search for tokens by name, symbol, or description',
        schema: {
          examples: [
            'find tokens with "kas"',
            'search for meme tokens',
            'tokens starting with N',
          ],
          specializes_in: ['token_discovery', 'token_search', 'token_lists'],
        },
      },
      {
        agent: 'token-registry-agent',
        name: 'token_get_price_history',
        description:
          'Get detailed price history and analytics for specific tokens',
        schema: {
          examples: [
            'NACHO price over time',
            'token price analysis',
            'long-term price data',
          ],
          specializes_in: [
            'token_analytics',
            'price_analysis',
            'token_performance',
          ],
        },
      },
      {
        agent: 'token-registry-agent',
        name: 'token_get_holders',
        description: 'Get token holder information and distribution',
        schema: {
          examples: [
            'who holds NACHO?',
            'token distribution',
            'holder analytics',
          ],
          specializes_in: [
            'holder_analysis',
            'token_distribution',
            'whale_tracking',
          ],
        },
      },

      // Wallet Agent Capabilities
      {
        agent: 'wallet-agent',
        name: 'wallet_get_balance',
        description: 'Check wallet balances for specific addresses',
        schema: {
          examples: ['my balance', 'wallet balance', 'check my KAS balance'],
          specializes_in: ['balance_checking', 'wallet_data', 'asset_balances'],
        },
      },
      {
        agent: 'wallet-agent',
        name: 'wallet_get_portfolio',
        description: 'Get complete portfolio overview and analysis',
        schema: {
          examples: [
            'my portfolio',
            'portfolio analysis',
            'what do I own',
            'my holdings',
          ],
          specializes_in: [
            'portfolio_management',
            'asset_allocation',
            'portfolio_analytics',
          ],
        },
      },
      {
        agent: 'wallet-agent',
        name: 'wallet_get_activity',
        description: 'Get transaction history and wallet activity',
        schema: {
          examples: [
            'my transactions',
            'wallet activity',
            'transaction history',
            'recent trades',
          ],
          specializes_in: [
            'transaction_history',
            'activity_tracking',
            'trade_history',
          ],
        },
      },

      // User Management Agent Capabilities
      {
        agent: 'user-management-agent',
        name: 'user_get_profile',
        description: 'Get user profile and account information',
        schema: {
          examples: ['my profile', 'account info', 'user settings'],
          specializes_in: [
            'user_data',
            'profile_management',
            'account_settings',
          ],
        },
      },
      {
        agent: 'user-management-agent',
        name: 'user_update_preferences',
        description: 'Update user preferences and settings',
        schema: {
          examples: [
            'update my settings',
            'change preferences',
            'modify notifications',
          ],
          specializes_in: [
            'preference_management',
            'settings_updates',
            'user_customization',
          ],
        },
      },
    );
  }

  private async callLLM(prompt: string): Promise<string> {
    try {
      const conversation: LlmConversation = {
        messages: [
          {
            role: 'system',
            content:
              'You are a Routing Agent for a DeFi platform. Analyze user requests and route them to the appropriate agent. Respond only with valid JSON matching the expected RoutingDecision format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      };

      const response = await this.openaiAdapter.generateStructuredOutput<{
        primaryAgent: string;
        capability: string;
        confidence: number;
        reasoning: string;
        fallbackAgents: string[];
        parameters: Record<string, any>;
      }>(
        conversation,
        {
          type: 'object',
          properties: {
            primaryAgent: { type: 'string' },
            capability: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string' },
            fallbackAgents: {
              type: 'array',
              items: { type: 'string' },
            },
            parameters: { type: 'object' },
          },
          required: [
            'primaryAgent',
            'capability',
            'confidence',
            'reasoning',
            'fallbackAgents',
            'parameters',
          ],
        },
        {
          temperature: 0.3,
          maxTokens: 500,
        },
      );

      return JSON.stringify(response);
    } catch (error) {
      this.logger.error('LLM Router call failed:', error);
      // Fallback to default routing
      return JSON.stringify({
        primaryAgent: 'trading-agent',
        capability: 'trading_get_market_data',
        confidence: 0.6,
        reasoning: 'Default routing for price-related queries due to LLM error',
        fallbackAgents: ['defi-agent'],
        parameters: {},
      });
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private parseRoutingResponse(response: string): RoutingDecision {
    try {
      const parsed = JSON.parse(response);
      return {
        primaryAgent: parsed.primaryAgent,
        capability: parsed.capability,
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'LLM routing decision',
        fallbackAgents: parsed.fallbackAgents || [],
        parameters: parsed.parameters || {},
      };
    } catch (error) {
      this.logger.error('Failed to parse LLM response', error);
      throw new Error('Invalid LLM response format');
    }
  }

  private getFallbackRouting(message: string): RoutingDecision {
    const lowerMessage = message.toLowerCase();

    // Simple fallback logic
    if (lowerMessage.includes('price')) {
      return {
        primaryAgent: 'trading-agent',
        capability: 'trading_get_market_data',
        confidence: 0.7,
        reasoning: 'Fallback routing for price queries',
        fallbackAgents: ['token-registry-agent'],
      };
    }

    return {
      primaryAgent: 'defi-agent',
      capability: 'defi_general_query',
      confidence: 0.5,
      reasoning: 'Default fallback routing',
      fallbackAgents: [],
      parameters: { query: message },
    };
  }

  /**
   * Get all available capabilities for a specific agent
   */
  getAgentCapabilities(agentName: string): AgentCapability[] {
    return this.availableCapabilities.filter((cap) => cap.agent === agentName);
  }

  /**
   * Get all available agents
   */
  getAvailableAgents(): string[] {
    return [...new Set(this.availableCapabilities.map((cap) => cap.agent))];
  }
}
