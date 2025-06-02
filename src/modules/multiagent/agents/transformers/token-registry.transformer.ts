import {
  TokenListItemResponse,
  BackendTokenResponse,
  BackendTokenStatsResponse,
  HolderChangeResponse,
  TokenSearchItems,
  TickerPortfolioBackend,
} from '../models/token-registry.model';

/**
 * Token Registry Data Transformers
 *
 * This module contains functions to transform raw API responses
 * into properly typed token registry models.
 */

/**
 * Transform raw token list data to TokenListItemResponse
 */
export function transformToTokenListItem(rawToken: any): TokenListItemResponse {
  return {
    ticker: rawToken.ticker || '',
    name: rawToken.name || rawToken.tokenName || '',
    price: rawToken.price || 0,
    marketCap: rawToken.marketCap || rawToken.market_cap || 0,
    volume24h: rawToken.volume24h || rawToken.volume_24h || 0,
    change24h: rawToken.change24h || rawToken.price_change_24h || 0,
  };
}

/**
 * Transform raw backend token data to BackendTokenResponse
 */
export function transformToBackendToken(rawToken: any): BackendTokenResponse {
  return {
    ticker: rawToken.ticker || '',
    name: rawToken.name || rawToken.tokenName || '',
    description: rawToken.description || '',
    totalSupply: rawToken.totalSupply || rawToken.total_supply || 0,
    circulatingSupply:
      rawToken.circulatingSupply || rawToken.circulating_supply || 0,
    holders: rawToken.holders || rawToken.holdersCount || 0,
    price: rawToken.price || 0,
    marketCap: rawToken.marketCap || rawToken.market_cap || 0,
    volume24h: rawToken.volume24h || rawToken.volume_24h || 0,
    change24h: rawToken.change24h || rawToken.price_change_24h || 0,
  };
}

/**
 * Transform raw token stats data to BackendTokenStatsResponse
 */
export function transformToTokenStats(
  rawStats: any,
): BackendTokenStatsResponse {
  return {
    ticker: rawStats.ticker || '',
    stats: rawStats.stats || rawStats,
  };
}

/**
 * Transform raw holder change data to HolderChangeResponse
 */
export function transformToHolderChange(rawChange: any): HolderChangeResponse {
  return {
    ticker: rawChange.ticker || '',
    holderChange:
      rawChange.holderChange ||
      rawChange.holder_change ||
      rawChange.change ||
      0,
    timeInterval: rawChange.timeInterval || rawChange.time_interval || '24h',
  };
}

/**
 * Transform raw search item to TokenSearchItems
 */
export function transformToTokenSearchItem(rawItem: any): TokenSearchItems {
  return {
    ticker: rawItem.ticker || '',
    name: rawItem.name || rawItem.tokenName || '',
    price: rawItem.price || 0,
  };
}

/**
 * Transform raw portfolio data to TickerPortfolioBackend
 */
export function transformToTickerPortfolio(
  rawPortfolio: any,
): TickerPortfolioBackend {
  return {
    ticker: rawPortfolio.ticker || '',
    balance: rawPortfolio.balance || 0,
    value: rawPortfolio.value || 0,
  };
}

/**
 * Transform array of raw token list items
 */
export function transformTokenList(rawTokens: any[]): TokenListItemResponse[] {
  if (!Array.isArray(rawTokens)) return [];
  return rawTokens.map(transformToTokenListItem);
}

/**
 * Transform array of raw search results
 */
export function transformTokenSearchResults(
  rawResults: any[],
): TokenSearchItems[] {
  if (!Array.isArray(rawResults)) return [];
  return rawResults.map(transformToTokenSearchItem);
}

/**
 * Transform array of raw portfolio items
 */
export function transformTokenPortfolio(
  rawPortfolio: any[],
): TickerPortfolioBackend[] {
  if (!Array.isArray(rawPortfolio)) return [];
  return rawPortfolio.map(transformToTickerPortfolio);
}

/**
 * Safe price extraction with fallback values
 */
export function extractPrice(rawData: any): number {
  return rawData?.price || rawData?.currentPrice || rawData?.last_price || 0;
}

/**
 * Safe volume extraction with fallback values
 */
export function extractVolume24h(rawData: any): number {
  return rawData?.volume24h || rawData?.volume_24h || rawData?.dailyVolume || 0;
}

/**
 * Safe market cap extraction with fallback values
 */
export function extractMarketCap(rawData: any): number {
  return rawData?.marketCap || rawData?.market_cap || rawData?.mcap || 0;
}
