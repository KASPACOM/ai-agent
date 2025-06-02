import { BackendTokenResponse } from '../models/token-registry.model';
import {
  MarketDataResponse,
  TokenStatsItem,
  TradeStatsItem,
} from '../models/trading.model';

/**
 * Trading Data Transformers
 *
 * This module contains functions to transform raw API responses
 * into properly typed application models.
 */

/**
 * Transform BackendTokenResponse to MarketDataResponse
 */
export function transformToMarketData(
  tokenData: BackendTokenResponse,
  timeFrame: string,
): MarketDataResponse {
  return {
    ticker: tokenData?.ticker || '',
    price: tokenData?.price || 0,
    volume24h: (tokenData as any)?.volume24h || 0,
    trades24h: (tokenData as any)?.trades24h || 0,
    marketCap: tokenData?.marketCap || 0,
    holders: tokenData?.holders || 0,
    change24h: (tokenData as any)?.change24h || 0,
    timeFrame,
    message: `Market data for ${tokenData?.ticker} (using token info endpoint)`,
  };
}

/**
 * Transform raw trading stats data to TokenStatsItem array
 */
export function transformToTokenStats(rawStats: any[]): TokenStatsItem[] {
  if (!Array.isArray(rawStats)) return [];

  return rawStats.map((item) => ({
    ticker: item.ticker || '',
    volume: item.volume || 0,
    trades: item.trades || 0,
    price: item.price || 0,
    change24h: item.change24h || item.priceChange24h || 0,
  }));
}

/**
 * Transform raw trade history data to TradeStatsItem array
 */
export function transformToTradeHistory(rawHistory: any[]): TradeStatsItem[] {
  if (!Array.isArray(rawHistory)) return [];

  return rawHistory.map((item) => ({
    timestamp: item.timestamp || item.createdAt || new Date().toISOString(),
    volume: item.volume || 0,
    price: item.price || 0,
    trades: item.trades || item.count || 1,
  }));
}

/**
 * Transform raw sell order data to SellOrder
 */
export function transformToSellOrder(rawOrder: any) {
  return {
    id: rawOrder.id || '',
    ticker: rawOrder.ticker || '',
    quantity: rawOrder.quantity || 0,
    totalPrice: rawOrder.totalPrice || rawOrder.total_price || 0,
    pricePerToken: rawOrder.pricePerToken || rawOrder.price_per_token || 0,
    sellerAddress: rawOrder.sellerAddress || rawOrder.seller_address || '',
    status: rawOrder.status || 'active',
    createdAt:
      rawOrder.createdAt || rawOrder.created_at || new Date().toISOString(),
    expiresAt: rawOrder.expiresAt || rawOrder.expires_at,
  };
}

/**
 * Transform raw user order data to UserOrder
 */
export function transformToUserOrder(rawOrder: any) {
  return {
    id: rawOrder.id || '',
    ticker: rawOrder.ticker || '',
    quantity: rawOrder.quantity || 0,
    totalPrice: rawOrder.totalPrice || rawOrder.total_price || 0,
    pricePerToken: rawOrder.pricePerToken || rawOrder.price_per_token || 0,
    type: rawOrder.type || 'sell',
    status: rawOrder.status || 'pending',
    createdAt:
      rawOrder.createdAt || rawOrder.created_at || new Date().toISOString(),
  };
}
