// Wallet-specific interfaces
export interface FetchWalletPortfolioResponse {
  portfolioItems: Array<{
    ticker: string;
    balance: number;
    logoUrl: string;
  }>;
  next: string | null;
  prev: string | null;
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
  topTradedTokens: any[];
  topTradedNftTokens: any[];
  scoreFromReferrals: number;
}

export interface WalletTradingDataResponse {
  [key: string]: any;
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
