// Wallet-specific interfaces
export interface FetchWalletPortfolioResponse {
  portfolioItems: Array<{
    ticker: string;
    balance: number;
    logoUrl: string;
  }>;
  next: string | null;
  prev: string | null;
  orders: WalletOrder[];
  totalValue?: number;
  tokens?: WalletPortfolioToken[];
  pagination?: {
    hasNext: boolean;
    hasPrev: boolean;
    nextKey?: string;
    prevKey?: string;
  };
}

export interface TickerPortfolioBackend {
  ticker: string;
  balance: number;
  value: number;
}

export interface WalletActivityResponse {
  walletAddress: string;
  scores: {
    deployments: number;
    mints: number;
    airdrops: number;
    referals: number;
    buyOrders: number;
    sellOrders: number;
    createdLaunchpads: number;
    launchpadParticipation: number;
    total: number;
    volume: number;
  };
  tradeVolume: number;
  totalTrades: number;
  topTradedTokens: TradedToken[];
  topTradedNftTokens: TradedNftToken[];
  scoreFromReferrals: number;
}

export interface TradedToken {
  ticker: string;
  volume: number;
  trades: number;
  lastTradeDate: string;
  averagePrice: number;
}

export interface TradedNftToken {
  collectionId: string;
  collectionName: string;
  volume: number;
  trades: number;
  lastTradeDate: string;
  floorPrice?: number;
}

export interface WalletTradingDataResponse {
  [key: string]: TradingDataEntry;
}

export interface TradingDataEntry {
  volume: number;
  trades: number;
  profitLoss?: number;
  averagePrice?: number;
}

export interface WalletPortfolioToken {
  ticker: string;
  balance: string;
  value?: number;
  price?: number;
  change24h?: number;
  metadata?: TokenMetadata;
}

export interface TokenMetadata {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  website?: string;
  totalSupply?: string;
  decimals?: number;
}

export interface WalletNftToken {
  tokenId: string;
  collectionTicker: string;
  collectionName?: string;
  metadata?: NftMetadata;
}

export interface NftMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: NftAttribute[];
  rarity?: number;
}

export interface NftAttribute {
  trait_type: string;
  value: string | number;
  rarity?: number;
}

export interface WalletOrder {
  id: string;
  ticker: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  totalValue: number;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt?: string;
}

export interface UserHoldingsResponse {
  ticker: string;
  tokenId: string;
  balance: number;
  metadata?: any;
}

export interface UserHoldingsResponseV2 {
  ticker: string;
  tokenId: string;
  balance: number;
  metadata?: any;
  rank?: number;
}

export interface GetSellOrdersResponse {
  orders: any[];
  totalCount: number;
}
