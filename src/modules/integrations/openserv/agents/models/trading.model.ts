// Trading-specific interfaces
export interface TradeStatsResponse {
  totalTradesKaspiano: number;
  totalVolumeKasKaspiano: number;
  totalVolumeUsdKaspiano: number;
  tokens?: any[];
  items?: any[];
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
  orders: any[];
  totalCount: number;
}

export interface GetUserOrdersResponse {
  orders: any[];
  totalCount: number;
  allTickers: string[];
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
