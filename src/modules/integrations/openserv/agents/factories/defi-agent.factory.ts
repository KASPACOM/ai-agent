import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AgentBuilder, BuiltAgent } from '../agent-builder.service';
import { BackendApiService } from '../../services/backend-api.service';

/**
 * DeFiAgentFactory - Creates DeFi agent with real backend API capabilities and educational guidance
 *
 * NOTE: Smart contract operations requiring wallet authentication are commented out
 * until we implement agent wallet authentication system.
 */
@Injectable()
export class DeFiAgentFactory {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly backendApiService: BackendApiService,
  ) {}

  createAgent(): BuiltAgent {
    return (
      AgentBuilder.create(this.httpService, this.configService, 'defi-agent')
        .withDescription('DeFi operations and token management')
        .withVersion('2.0.0')
        .withCategory('defi')
        .withApiConfig('DEFI_API_BASE_URL')

        // === DeFi Backend API Capabilities (No Auth Required) ===
        .addCapability(
          'defi_get_token_info',
          'Get detailed information about a specific DeFi token',
          [
            {
              name: 'address',
              type: 'string',
              required: true,
              description: 'Token contract address',
            },
          ],
          [
            'get DeFi token info for address',
            'DeFi token details',
            'check DeFi token contract',
          ],
          async (args) => {
            try {
              const response = await this.httpService.axiosRef.get(
                `https://dev-api.kaspa.com/swap/tokens/${args.address}`,
              );
              return response.data;
            } catch (error) {
              throw new Error(
                `Failed to get DeFi token info: ${error.message}`,
              );
            }
          },
        )

        .addCapability(
          'defi_search_tokens',
          'Search for DeFi tokens by symbol',
          [
            {
              name: 'symbol',
              type: 'string',
              required: true,
              description: 'Token symbol to search for (e.g., USDC, WETH)',
            },
          ],
          [
            'search DeFi tokens by symbol',
            'find DeFi token USDC',
            'look for DeFi token',
          ],
          async (args) => {
            try {
              const response = await this.httpService.axiosRef.get(
                `https://dev-api.kaspa.com/swap/tokens/search?symbol=${args.symbol}`,
              );
              return response.data;
            } catch (error) {
              throw new Error(`Failed to search DeFi tokens: ${error.message}`);
            }
          },
        )

        .addCapability(
          'defi_create_token',
          'Create a new DeFi token registration',
          [
            {
              name: 'symbol',
              type: 'string',
              required: true,
              description: 'Token symbol',
            },
            {
              name: 'name',
              type: 'string',
              required: true,
              description: 'Token name',
            },
            {
              name: 'address',
              type: 'string',
              required: true,
              description: 'Token contract address',
            },
            {
              name: 'decimals',
              type: 'number',
              required: true,
              description: 'Token decimals',
            },
            {
              name: 'chainId',
              type: 'number',
              required: true,
              description:
                'Network chain ID (12211 for Kasplex, 2600 for Igra)',
            },
            {
              name: 'telegram',
              type: 'string',
              required: false,
              description: 'Telegram link',
            },
            {
              name: 'website',
              type: 'string',
              required: false,
              description: 'Website URL',
            },
            {
              name: 'description',
              type: 'string',
              required: false,
              description: 'Token description',
            },
            {
              name: 'x',
              type: 'string',
              required: false,
              description: 'X/Twitter handle',
            },
          ],
          [
            'register new DeFi token',
            'create DeFi token entry',
            'add token to DeFi registry',
          ],
          async (args) => {
            try {
              const formData = new FormData();
              formData.append('symbol', args.symbol);
              formData.append('name', args.name);
              formData.append('address', args.address);
              formData.append('decimals', args.decimals.toString());
              formData.append('chain_id', args.chainId.toString());

              if (args.telegram) formData.append('telegram', args.telegram);
              if (args.website) formData.append('website', args.website);
              if (args.description)
                formData.append('description', args.description);
              if (args.x) formData.append('x', args.x);

              const response = await this.httpService.axiosRef.post(
                'https://dev-api.kaspa.com/swap/create-token',
                formData,
                {
                  headers: {
                    'Content-Type': 'multipart/form-data',
                  },
                },
              );
              return response.data;
            } catch (error) {
              throw new Error(`Failed to create DeFi token: ${error.message}`);
            }
          },
        )

        .addCapability(
          'defi_create_pool',
          'Create a new liquidity pool',
          [
            {
              name: 'poolAddress',
              type: 'string',
              required: true,
              description: 'Pool contract address',
            },
            {
              name: 'token0Address',
              type: 'string',
              required: true,
              description: 'First token address',
            },
            {
              name: 'token1Address',
              type: 'string',
              required: true,
              description: 'Second token address',
            },
          ],
          [
            'create liquidity pool',
            'add new DeFi pool',
            'register liquidity pair',
          ],
          async (args) => {
            try {
              const response = await this.httpService.axiosRef.post(
                'https://dev-api.kaspa.com/swap/create-pool',
                {
                  poolAddress: args.poolAddress,
                  token0Address: args.token0Address,
                  token1Address: args.token1Address,
                },
                {
                  headers: {
                    'Content-Type': 'application/json',
                  },
                },
              );
              return response.data;
            } catch (error) {
              throw new Error(`Failed to create DeFi pool: ${error.message}`);
            }
          },
        )

        // === Educational and General Capabilities ===
        .addCapability(
          'defi_general_query',
          'Handle general DeFi-related questions and education',
          [
            {
              name: 'query',
              type: 'string',
              required: true,
              description: 'The DeFi question or topic to address',
            },
          ],
          [
            'what is DeFi?',
            'explain liquidity pools',
            'how does yield farming work?',
            'what are smart contracts?',
            'DeFi vs traditional finance',
          ],
          async (args) => {
            // Educational responses for DeFi concepts
            const query = args.query.toLowerCase();

            if (
              query.includes('defi') ||
              query.includes('decentralized finance')
            ) {
              return {
                topic: 'DeFi Overview',
                explanation:
                  'DeFi (Decentralized Finance) refers to financial services built on blockchain networks that operate without traditional intermediaries like banks.',
                benefits: [
                  'Open access for anyone with an internet connection',
                  'Programmable money and automated contracts',
                  'Lower fees compared to traditional banking',
                  'Global availability 24/7',
                  'Transparency through public blockchains',
                ],
                examples: [
                  'Decentralized exchanges (DEXs)',
                  'Lending protocols',
                  'Yield farming',
                  'Liquidity mining',
                ],
                networks: [
                  'Kasplex (Chain ID: 12211)',
                  'Igra (Chain ID: 2600)',
                ],
              };
            }

            if (query.includes('liquidity pool')) {
              return {
                topic: 'Liquidity Pools',
                explanation:
                  'Liquidity pools are smart contracts that hold tokens and allow users to trade against them. Users who provide liquidity earn fees from trades.',
                howItWorks: [
                  'Users deposit token pairs (e.g., KAS/USDT)',
                  'Traders swap against the pool reserves',
                  'Liquidity providers earn trading fees proportionally',
                  'Prices adjust automatically based on supply and demand',
                ],
                benefits: [
                  'Earn passive income',
                  'Enable decentralized trading',
                  'Price discovery',
                ],
                risks: [
                  'Impermanent loss',
                  'Smart contract risks',
                  'Market volatility',
                ],
              };
            }

            if (query.includes('yield farming') || query.includes('yield')) {
              return {
                topic: 'Yield Farming',
                explanation:
                  'Yield farming is the practice of lending or staking crypto assets to generate returns through interest, rewards, or fees.',
                strategies: [
                  'Provide liquidity to DEX pools',
                  'Stake tokens in protocols',
                  'Lend assets for interest',
                  'Participate in governance for rewards',
                ],
                considerations: [
                  'Higher yields often mean higher risks',
                  'Gas fees can eat into profits',
                  'Requires active management',
                ],
              };
            }

            if (query.includes('smart contract')) {
              return {
                topic: 'Smart Contracts',
                explanation:
                  'Smart contracts are self-executing contracts with terms directly written into code on the blockchain.',
                features: [
                  'Automatic execution when conditions are met',
                  'No need for intermediaries',
                  'Transparent and immutable',
                  'Programmable money and logic',
                ],
                useCases: [
                  'Automated trading',
                  'Lending protocols',
                  'Insurance',
                  'Governance systems',
                ],
              };
            }

            if (query.includes('swap') || query.includes('exchange')) {
              return {
                topic: 'Token Swapping',
                explanation:
                  'Token swapping allows you to exchange one cryptocurrency for another directly without a centralized exchange.',
                process: [
                  'Connect your wallet to a DEX',
                  'Select tokens to swap',
                  'Set slippage tolerance',
                  'Confirm transaction and pay gas fees',
                ],
                tips: [
                  'Check slippage before swapping',
                  'Be aware of gas fees',
                  'Verify token contracts',
                ],
                walletAuthRequired:
                  'Note: Actual swapping requires wallet authentication - coming soon!',
              };
            }

            return {
              topic: 'General DeFi Information',
              message:
                'I can help explain DeFi concepts like liquidity pools, yield farming, smart contracts, and token swapping. I can also help you interact with DeFi tokens and pools on Kasplex and Igra networks.',
              availableTopics: [
                'DeFi basics',
                'Liquidity pools',
                'Yield farming',
                'Smart contracts',
                'Token swapping',
                'DeFi risks and benefits',
              ],
              supportedNetworks: [
                'Kasplex (Chain ID: 12211)',
                'Igra (Chain ID: 2600)',
              ],
              note: 'Smart contract operations requiring wallet authentication are planned for future implementation.',
            };
          },
        )

        /*
        TODO: WALLET-AUTH-REQUIRED CAPABILITIES - Implement when agent wallet authentication is ready
        
        These capabilities require wallet connection and transaction signing:
        
        === Read-Only Smart Contract Operations (No wallet auth, but need Web3 connection) ===
        - defi_calculate_swap_output: Calculate expected swap output without executing
        - defi_get_pair_address: Check if liquidity pair exists between two tokens  
        - defi_check_token_balance: Get token balance for any address
        - defi_check_token_allowance: Check token allowance between addresses
        - defi_get_pair_reserves: Get liquidity pool reserves information
        
        === Wallet-Auth-Required Smart Contract Operations ===
        - defi_swap_tokens: Execute token-to-token swap (requires approval + signing)
        - defi_swap_eth_for_tokens: Execute ETH-to-token swap (requires signing)
        - defi_add_liquidity: Add liquidity to pools (requires approval + signing)
        - defi_remove_liquidity: Remove liquidity from pools (requires signing)
        - defi_approve_token: Approve token spending (requires signing)
        - defi_transfer_token: Transfer tokens (requires signing)
        - defi_create_pair: Deploy new liquidity pair (requires signing + gas)
        
        === High-Level Manager Operations (All require wallet auth) ===
        - defi_execute_swap: SwapManager.swapTokens() with auto-approvals
        - defi_execute_add_liquidity: LiquidityManager.addLiquidity() with auto-approvals  
        - defi_execute_remove_liquidity: LiquidityManager.removeLiquidity() with auto-approvals
        
        Implementation notes:
        - Need to implement agent wallet system (private key management)
        - Need Web3 provider connection to Kasplex/Igra networks
        - Need gas management and transaction monitoring
        - Consider using high-level managers for better UX (auto-approvals)
        
        Network details for implementation:
        Kasplex: { chainId: 12211, rpc: "https://rpc.kasplextest.xyz" }
        Igra: { chainId: 2600, rpc: "https://devnet.igralabs.com:8545/ad32094f78934ba484bd16c97e20f056/" }
        */

        .build()
    );
  }
}
