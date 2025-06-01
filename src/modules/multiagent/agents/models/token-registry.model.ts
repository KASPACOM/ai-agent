// Token Registry interfaces
export interface TokenListItemResponse {
  ticker: string;
  name: string;
  price: number;
  volume24h: number;
  change24h: number;
  marketCap: number;
}

export interface BackendTokenResponse {
  ticker: string;
  name: string;
  description: string;
  price: number;
  totalSupply: number;
  circulatingSupply: number;
  holders: number;
  volume24h: number;
  change24h: number;
  marketCap: number;
}

export interface BackendTokenStatsResponse {
  ticker: string;
  stats: any;
}

export interface HolderChangeResponse {
  ticker: string;
  holderChange: number;
  timeInterval: string;
}

export interface TokenSearchItems {
  ticker: string;
  name: string;
  price: number;
}

export interface TickerPortfolioBackend {
  ticker: string;
  balance: number;
  value: number;
}

export interface MintInfoResponseDto {
  ticker: string;
  mintable: boolean;
  totalSupply: number;
  maxSupply: number;
}

export interface BackendTokenMetadata {
  ticker: string;
  name: string;
  description: string;
  logoUrl: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export interface TokenSentiment {
  bullish: number;
  bearish: number;
  neutral: number;
}

export interface BackendKrc721Response {
  collections: NFTCollectionDetails[];
  totalCount: number;
}

export interface NFTCollectionDetails {
  ticker: string;
  name: string;
  description: string;
  totalSupply: number;
  holders: number;
  floorPrice: number;
  volume24h: number;
  logoUrl: string;
}

export interface Krc721TokenFilterRequest {
  ticker: string;
  pagination?: { limit: number; offset: number };
  sort?: { field: string; direction: 'asc' | 'desc' };
  filters?: any;
}

export interface Krc721TokenResponse {
  items: any[];
  totalCount: number;
}

export interface NFTCollectionSearch {
  ticker: string;
  name: string;
  logoUrl: string;
}

export interface CollectionPriceHistory {
  price: number;
  date: string;
}

export interface DailyTradingVolume {
  date: string;
  volume: number;
  trades: number;
}

export interface KnsDailyTradeStats {
  date: string;
  volume: number;
  trades: number;
}

export interface KnsSoldOrdersResponse {
  orders: any[];
}
