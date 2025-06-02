import {
  TradedToken,
  TradedNftToken,
  WalletPortfolioToken,
  WalletOrder,
  TokenMetadata,
  NftMetadata,
  TradingDataEntry,
} from '../models/wallet.model';

/**
 * Wallet Data Transformers
 *
 * This module contains functions to transform raw API responses
 * into properly typed wallet models.
 */

/**
 * Transform raw traded token data to TradedToken
 */
export function transformToTradedToken(rawToken: any): TradedToken {
  return {
    ticker: rawToken.ticker || '',
    volume: rawToken.volume || 0,
    trades: rawToken.trades || rawToken.tradeCount || 0,
    lastTradeDate:
      rawToken.lastTradeDate ||
      rawToken.last_trade_date ||
      new Date().toISOString(),
    averagePrice: rawToken.averagePrice || rawToken.avg_price || 0,
  };
}

/**
 * Transform raw traded NFT data to TradedNftToken
 */
export function transformToTradedNftToken(rawNft: any): TradedNftToken {
  return {
    collectionId: rawNft.collectionId || rawNft.collection_id || '',
    collectionName: rawNft.collectionName || rawNft.collection_name || '',
    volume: rawNft.volume || 0,
    trades: rawNft.trades || rawNft.tradeCount || 0,
    lastTradeDate:
      rawNft.lastTradeDate ||
      rawNft.last_trade_date ||
      new Date().toISOString(),
    floorPrice: rawNft.floorPrice || rawNft.floor_price,
  };
}

/**
 * Transform raw portfolio token data to WalletPortfolioToken
 */
export function transformToWalletPortfolioToken(
  rawToken: any,
): WalletPortfolioToken {
  return {
    ticker: rawToken.ticker || '',
    balance: rawToken.balance?.toString() || '0',
    value: rawToken.value || 0,
    price: rawToken.price || 0,
    change24h: rawToken.change24h || rawToken.price_change_24h,
    metadata: rawToken.metadata
      ? transformToTokenMetadata(rawToken.metadata)
      : undefined,
  };
}

/**
 * Transform raw wallet order data to WalletOrder
 */
export function transformToWalletOrder(rawOrder: any): WalletOrder {
  return {
    id: rawOrder.id || '',
    ticker: rawOrder.ticker || '',
    type: rawOrder.type || 'sell',
    quantity: rawOrder.quantity || 0,
    price: rawOrder.price || rawOrder.pricePerToken || 0,
    totalValue: rawOrder.totalValue || rawOrder.totalPrice || 0,
    status: rawOrder.status || 'pending',
    createdAt:
      rawOrder.createdAt || rawOrder.created_at || new Date().toISOString(),
    updatedAt: rawOrder.updatedAt || rawOrder.updated_at,
  };
}

/**
 * Transform raw token metadata to TokenMetadata
 */
export function transformToTokenMetadata(rawMetadata: any): TokenMetadata {
  return {
    name: rawMetadata.name,
    symbol: rawMetadata.symbol,
    description: rawMetadata.description,
    image: rawMetadata.image || rawMetadata.logo,
    website: rawMetadata.website || rawMetadata.websiteUrl,
    totalSupply:
      rawMetadata.totalSupply?.toString() ||
      rawMetadata.total_supply?.toString(),
    decimals: rawMetadata.decimals || 8,
  };
}

/**
 * Transform raw NFT metadata to NftMetadata
 */
export function transformToNftMetadata(rawMetadata: any): NftMetadata {
  return {
    name: rawMetadata.name,
    description: rawMetadata.description,
    image: rawMetadata.image,
    attributes:
      rawMetadata.attributes?.map((attr: any) => ({
        trait_type: attr.trait_type || attr.traitType || '',
        value: attr.value,
        rarity: attr.rarity,
      })) || [],
    rarity: rawMetadata.rarity || rawMetadata.rank,
  };
}

/**
 * Transform raw trading data entry to TradingDataEntry
 */
export function transformToTradingDataEntry(rawData: any): TradingDataEntry {
  return {
    volume: rawData.volume || 0,
    trades: rawData.trades || rawData.tradeCount || 0,
    profitLoss: rawData.profitLoss || rawData.profit_loss || rawData.pnl,
    averagePrice: rawData.averagePrice || rawData.avg_price || 0,
  };
}

/**
 * Transform array of raw traded tokens
 */
export function transformTradedTokens(rawTokens: any[]): TradedToken[] {
  if (!Array.isArray(rawTokens)) return [];
  return rawTokens.map(transformToTradedToken);
}

/**
 * Transform array of raw traded NFTs
 */
export function transformTradedNftTokens(rawNfts: any[]): TradedNftToken[] {
  if (!Array.isArray(rawNfts)) return [];
  return rawNfts.map(transformToTradedNftToken);
}

/**
 * Transform array of raw portfolio tokens
 */
export function transformWalletPortfolioTokens(
  rawTokens: any[],
): WalletPortfolioToken[] {
  if (!Array.isArray(rawTokens)) return [];
  return rawTokens.map(transformToWalletPortfolioToken);
}

/**
 * Transform array of raw wallet orders
 */
export function transformWalletOrders(rawOrders: any[]): WalletOrder[] {
  if (!Array.isArray(rawOrders)) return [];
  return rawOrders.map(transformToWalletOrder);
}
