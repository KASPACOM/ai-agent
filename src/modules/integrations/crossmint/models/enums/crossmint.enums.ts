// === ENUMS ===

export enum WalletType {
  CUSTODIAL = 'custodial',
  NON_CUSTODIAL = 'non-custodial',
  SMART_WALLET = 'smart-wallet',
}

export enum WalletStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  DISABLED = 'disabled',
}

export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
  ACH = 'ach',
  CRYPTO = 'crypto',
}

export enum FundingStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum PurchaseStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum ProductAvailability {
  IN_STOCK = 'in_stock',
  OUT_OF_STOCK = 'out_of_stock',
  LIMITED = 'limited',
}

export enum ProductSource {
  AMAZON = 'amazon',
  SHOPIFY = 'shopify',
  ALL = 'all',
}

export enum CrossmintEnvironment {
  STAGING = 'staging',
  PRODUCTION = 'production',
}

export enum ServiceName {
  CROSSMINT = 'crossmint',
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * Blockchain Networks supported by Crossmint
 * Based on Crossmint's official supported chains documentation
 */
export enum BlockchainNetwork {
  // Ethereum & Layer 2s
  ETHEREUM = 'ethereum',
  ARBITRUM = 'arbitrum',
  ARBITRUM_NOVA = 'arbitrumnova',
  BASE = 'base',
  OPTIMISM = 'optimism',
  POLYGON = 'polygon',
  SCROLL = 'scroll',
  MODE = 'mode',
  STORY = 'story-mainnet',
  ZORA = 'zora',

  // Alternative Layer 1s
  SOLANA = 'solana',
  APTOS = 'aptos',
  SUI = 'sui',
  AVALANCHE = 'avalanche',
  BSC = 'bsc',
  FANTOM = 'fantom',

  // Emerging Networks
  CELO = 'celo',
  MANTLE = 'mantle',
  CHILIZ = 'chiliz',
  HEDERA = 'hedera',
  SEI = 'sei-pacific-1',
  XION = 'xion',
  ZENCHAIN = 'zenchain',

  // Gaming & Specialized
  APECHAIN = 'apechain',
  IMMUTABLE = 'immutable',
  RONIN = 'ronin',

  // Enterprise & Institutional
  COTI = 'coti',
  RARI = 'rari',
  SHAPE = 'shape',
  SONEIUM = 'soneium',

  // Bitcoin & Derivatives
  BITCOIN = 'bitcoin',

  // Other EVM Compatible
  LINEA = 'linea',
  ZKSYNC = 'zksync',
  POLYGON_ZKEVM = 'polygon-zkevm',

  // Testing Networks (for development)
  ETHEREUM_SEPOLIA = 'ethereum-sepolia',
  POLYGON_AMOY = 'polygon-amoy',
  BASE_SEPOLIA = 'base-sepolia',
}

/**
 * Currencies supported by Crossmint
 * Based on Crossmint's payment methods and supported tokens
 */
export enum Currency {
  // Fiat Currencies
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  CAD = 'CAD',
  AUD = 'AUD',
  JPY = 'JPY',

  // Stablecoins (Most Common)
  USDC = 'USDC',
  USDT = 'USDT',
  EURC = 'EURC',
  DAI = 'DAI',

  // Native Blockchain Tokens
  ETH = 'ETH', // Ethereum
  SOL = 'SOL', // Solana
  MATIC = 'MATIC', // Polygon
  BNB = 'BNB', // Binance Smart Chain
  AVAX = 'AVAX', // Avalanche
  FTM = 'FTM', // Fantom
  CELO = 'CELO', // Celo

  // Layer 2 & Popular Alt Tokens
  ARB = 'ARB', // Arbitrum
  OP = 'OP', // Optimism
  BASE_ETH = 'BASE_ETH', // Base (ETH)

  // Bitcoin & Derivatives
  BTC = 'BTC',
  WBTC = 'WBTC',

  // Other Popular Tokens
  LINK = 'LINK', // Chainlink
  UNI = 'UNI', // Uniswap
  AAVE = 'AAVE', // Aave
  CRV = 'CRV', // Curve

  // Cross-chain representations
  WETH = 'WETH', // Wrapped Ethereum
  WSOL = 'WSOL', // Wrapped Solana
}
