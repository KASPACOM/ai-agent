/**
 * Crossmint Integration Models
 *
 * Type-safe interfaces for all Crossmint financial operations
 * Following project's no-any-types principle and enum standards
 */

import {
  WalletType,
  BlockchainNetwork,
  WalletStatus,
  Currency,
  TransactionStatus,
  PaymentMethod,
  FundingStatus,
  PurchaseStatus,
  ProductSource,
  ProductAvailability,
  CrossmintEnvironment,
  ServiceName,
  HealthStatus,
} from './enums/crossmint.enums';

export interface AgentWallet {
  id: string;
  address: string;
  userId: string;
  type: WalletType;
  chain: BlockchainNetwork;
  status: WalletStatus;
  createdAt: Date;
  spendingLimits?: WalletSpendingLimits;
  allowedOperations?: string[];
}

export interface WalletSpendingLimits {
  daily?: number;
  weekly?: number;
  monthly?: number;
  perTransaction?: number;
  currency: Currency;
}

export interface WalletBalance {
  walletId: string;
  balances: Array<{
    token: string;
    amount: string;
    decimals: number;
    usdValue?: number;
    chain: BlockchainNetwork;
  }>;
  totalUsdValue: number;
  lastUpdated: Date;
}

// === Transaction Models ===
export interface TransactionRequest {
  from: string;
  to: string;
  amount: string;
  token: string;
  chain: BlockchainNetwork;
  memo?: string;
  gasLimit?: string;
  gasPrice?: string;
}

export interface TransactionResult {
  txHash: string;
  status: TransactionStatus;
  from: string;
  to: string;
  amount: string;
  token: string;
  chain: BlockchainNetwork;
  gasUsed?: string;
  blockNumber?: number;
  timestamp: Date;
  error?: string;
}

// === Swap Models ===
export interface SwapRequest {
  fromToken: string;
  toToken: string;
  amount: string;
  walletAddress: string;
  slippage?: number;
  chain: BlockchainNetwork;
}

export interface SwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  slippage: number;
  fees: {
    networkFee: string;
    protocolFee: string;
    totalFee: string;
  };
  estimatedGas: string;
  validUntil: Date;
}

// === Payment/Funding Models ===
export interface FundingRequest {
  walletId: string;
  amount: number;
  currency: Currency;
  paymentMethod: PaymentMethod;
  paymentDetails?: {
    cardToken?: string;
    cryptoAddress?: string;
    cryptoAmount?: string;
  };
}

export interface FundingResult {
  transactionId: string;
  status: FundingStatus;
  amount: number;
  currency: Currency;
  paymentMethod: string;
  fees?: {
    processingFee: number;
    networkFee?: number;
  };
  completedAt?: Date;
  error?: string;
}

// === Purchase Models ===
export interface PurchaseItem {
  sku?: string;
  productId?: string;
  name: string;
  description?: string;
  price: number;
  currency: Currency;
  quantity: number;
  category?: string;
  metadata?: Record<string, any>;
}

export interface PurchaseRequest {
  items: PurchaseItem[];
  paymentMethod: string;
  walletId?: string;
  shippingAddress?: {
    name: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    name: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
}

export interface PurchaseResult {
  orderId: string;
  status: PurchaseStatus;
  items: PurchaseItem[];
  totalAmount: number;
  currency: Currency;
  paymentMethod: string;
  transactionId?: string;
  trackingNumber?: string;
  estimatedDelivery?: Date;
  createdAt: Date;
  error?: string;
}

// === Product Catalog Models ===
export interface ProductSearchRequest {
  query?: string;
  category?: string;
  priceRange?: {
    min: number;
    max: number;
    currency: Currency;
  };
  source?: ProductSource;
  limit?: number;
  offset?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: Currency;
  category: string;
  brand?: string;
  images: string[];
  rating?: number;
  reviewCount?: number;
  availability: ProductAvailability;
  source: string;
  sourceProductId: string;
  shippingInfo?: {
    freeShipping: boolean;
    estimatedDays: number;
  };
}

// === Authentication Models ===
export interface CrossmintAuthConfig {
  apiKey: string;
  environment: CrossmintEnvironment;
  projectId?: string;
}

export interface UserCredential {
  userId: string;
  walletAddress: string;
  permissions: string[];
  spendingLimits?: WalletSpendingLimits;
  issuedAt: Date;
  expiresAt?: Date;
}

// === Response Wrappers ===
export interface CrossmintResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?:
    | string
    | {
        code: string;
        message: string;
        details?: any;
      };
  timestamp?: Date;
}

export interface CrossmintHealthStatus {
  service: ServiceName;
  status: HealthStatus;
  timestamp: Date;
  environment: CrossmintEnvironment;
  version: string;
  apiConnection?: boolean;
  walletService?: boolean;
  paymentService?: boolean;
  responseTime?: number;
}
