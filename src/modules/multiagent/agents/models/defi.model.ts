// DeFi-specific interfaces
export interface CreateErc20TokenDto {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chain_id: number;
  telegram?: string;
  website?: string;
  description?: string;
  x?: string;
  logo?: File;
}

export interface CreatePoolDto {
  poolAddress: string;
  token0Address: string;
  token1Address: string;
}

export interface Erc20BackendResponse {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chain_id: number;
  logo?: string;
  telegram?: string;
  website?: string;
  description?: string;
  x?: string;
}

export interface CreatePoolBackendResponse {
  poolAddress: string;
  token0Address: string;
  token1Address: string;
}

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
}

export interface SwapResult {
  txHash: string;
  expectedOutput?: string;
  actualOutput?: string;
}

export interface LiquidityResult {
  txHash: string;
  pairAddress: string;
  amountA?: string;
  amountB?: string;
}

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorer: string;
  contracts: {
    factory: string;
    router: string;
    erc20Deployer: string;
  };
}

export interface SwapQuote {
  expectedOutput: string;
  minimumOutput: string;
  priceImpact: number;
  path: string[];
}
