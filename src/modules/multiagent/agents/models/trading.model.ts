// Trading-specific interfaces
export interface TradeStatsResponse {
  totalTradesKaspiano: number;
  totalVolumeKasKaspiano: number;
  totalVolumeUsdKaspiano: number;
  tokens?: TokenStatsItem[];
  items?: TradeStatsItem[];
}

export interface TokenStatsItem {
  ticker: string;
  volume: number;
  trades: number;
  price: number;
  change24h?: number;
}

export interface TradeStatsItem {
  timestamp: string;
  volume: number;
  price: number;
  trades: number;
}

export interface MarketDataResponse {
  ticker: string;
  price: number;
  volume24h?: number;
  trades24h?: number;
  marketCap?: number;
  holders?: number;
  change24h?: number;
  timeFrame: string;
  message?: string;
}

export interface FloorPriceResponse {
  ticker: string;
  floor_price: number;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface SortParams {
  field?: string;
  direction: 'asc' | 'desc';
}

export interface GetSellOrdersResponse {
  orders: SellOrder[];
  totalCount: number;
}

export interface SellOrder {
  id: string;
  ticker: string;
  quantity: number;
  totalPrice: number;
  pricePerToken: number;
  sellerAddress: string;
  status: 'active' | 'sold' | 'cancelled';
  createdAt: string;
  expiresAt?: string;
}

export interface GetUserOrdersResponse {
  orders: UserOrder[];
  totalCount: number;
  allTickers: string[];
}

export interface UserOrder {
  id: string;
  ticker: string;
  quantity: number;
  totalPrice: number;
  pricePerToken: number;
  type: 'buy' | 'sell';
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface BuyTokenResponse {
  success: boolean;
  temporaryWalletAddress: string;
  status: string;
}

export interface ConfirmBuyOrderResponse {
  confirmed: boolean;
  transactions: {
    commitTransactionId: string;
    revealTransactionId: string;
    sellerTransactionId: string;
    buyerTransactionId: string;
  };
  priorityFeeTooHigh: boolean;
}

export interface ConfirmBuyOrderRequest {
  transactionId: string;
}

export interface RemoveListingResponse {
  success: boolean;
  message: string;
}

export interface DecentralizedUserOrder {
  id: string;
  ticker: string;
  quantity: number;
  totalPrice: number;
  pricePerToken: number;
  status: string;
}

export interface BuyDecentralizedOrderResponse {
  success: boolean;
  transactionId: string;
}

export interface SoldOrder {
  id: string;
  ticker: string;
  quantity: number;
  price: number;
  timestamp: string;
}

export interface SoldOrdersResponse {
  orders: SoldOrder[];
}
