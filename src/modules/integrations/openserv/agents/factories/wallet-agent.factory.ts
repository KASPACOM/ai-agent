import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AgentBuilder, BuiltAgent } from '../agent-builder.service';
import { BackendApiService } from '../../services/backend-api.service';
import { KasplexKrc20Service } from '../../services/kasplex-krc20.service';
import { KaspaApiService } from '../../services/kaspa-api.service';

/**
 * WalletAgentFactory - Creates wallet agent with all wallet management capabilities
 */
@Injectable()
export class WalletAgentFactory {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly backendApiService: BackendApiService,
    private readonly kasplexKrc20Service: KasplexKrc20Service,
    private readonly kaspaApiService: KaspaApiService,
  ) {}

  createAgent(): BuiltAgent {
    return (
      AgentBuilder.create(this.httpService, this.configService, 'wallet-agent')
        .withDescription('Wallet portfolios, activity tracking, and balances')
        .withVersion('2.0.0')
        .withCategory('financial')
        .withApiConfig('BACKEND_API_BASE_URL')

        // === Portfolio Management Capabilities ===
        .addCapability(
          'wallet_get_portfolio',
          'Get complete wallet portfolio including all token balances and values',
          [
            {
              name: 'wallet_address',
              type: 'string',
              required: true,
              description: 'Wallet address to get portfolio for',
            },
            {
              name: 'paginationKey',
              type: 'string',
              required: false,
              description: 'Pagination key for next/prev results',
            },
            {
              name: 'direction',
              type: 'string',
              required: false,
              description: 'Direction: "next" or "prev"',
            },
          ],
          [
            'show my portfolio',
            'wallet balance',
            'my token holdings',
            'portfolio overview',
          ],
          async (args) =>
            await this.backendApiService.fetchWalletKRC20TokensBalance(
              args.wallet_address,
              args.paginationKey || null,
              (args.direction as 'next' | 'prev') || null,
            ),
        )

        .addCapability(
          'wallet_get_token_balance',
          'Get balance for a specific token in a wallet',
          [
            {
              name: 'wallet_address',
              type: 'string',
              required: true,
              description: 'Wallet address to check',
            },
            {
              name: 'ticker',
              type: 'string',
              required: true,
              description: 'Token ticker to get balance for (e.g., KAS, NACHO)',
            },
          ],
          [
            'my KAS balance',
            'how much NACHO do I have?',
            'check my token balance',
          ],
          async (args) =>
            await this.kasplexKrc20Service.getTokenWalletBalanceInfo(
              args.wallet_address,
              args.ticker,
            ),
        )

        .addCapability(
          'wallet_get_kaspa_balance',
          'Get native Kaspa balance for a wallet',
          [
            {
              name: 'wallet_address',
              type: 'string',
              required: true,
              description: 'Wallet address to check Kaspa balance for',
            },
          ],
          ['my Kaspa balance', 'how much KAS do I have?', 'native balance'],
          async (args) => {
            const balance = await this.kaspaApiService.fetchWalletBalance(
              args.wallet_address,
            );
            return { address: args.wallet_address, balance, currency: 'KAS' };
          },
        )

        // === Activity and Transaction Capabilities ===
        .addCapability(
          'wallet_get_activity',
          'Get wallet activity and transaction history',
          [
            {
              name: 'wallet_address',
              type: 'string',
              required: true,
              description: 'Wallet address to analyze',
            },
            {
              name: 'paginationKey',
              type: 'string',
              required: false,
              description: 'Pagination key for results',
            },
            {
              name: 'direction',
              type: 'string',
              required: false,
              description: 'Direction: "next" or "prev"',
            },
          ],
          [
            'my wallet activity',
            'wallet transaction history',
            'show my transactions',
          ],
          async (args) =>
            await this.kasplexKrc20Service.getWalletActivity(
              args.wallet_address,
              args.paginationKey || null,
              args.direction || null,
            ),
        )

        .addCapability(
          'wallet_get_token_list',
          'Get list of all tokens in a wallet',
          [
            {
              name: 'wallet_address',
              type: 'string',
              required: true,
              description: 'Wallet address to get token list for',
            },
            {
              name: 'paginationKey',
              type: 'string',
              required: false,
              description: 'Pagination key for results',
            },
            {
              name: 'direction',
              type: 'string',
              required: false,
              description: 'Direction: "next" or "prev"',
            },
          ],
          ['list my tokens', 'what tokens do I have?', 'token inventory'],
          async (args) =>
            await this.kasplexKrc20Service.getWalletTokenList(
              args.wallet_address,
              args.paginationKey || null,
              (args.direction as 'next' | 'prev') || null,
            ),
        )

        // === Validation and Network Capabilities ===
        .addCapability(
          'wallet_validate_address',
          'Validate if a wallet address is properly formatted',
          [
            {
              name: 'wallet_address',
              type: 'string',
              required: true,
              description: 'Wallet address to validate',
            },
          ],
          [
            'is this wallet address valid?',
            'check address format',
            'validate my wallet address',
          ],
          async (args) => {
            const isValid = this.kaspaApiService.isValidKaspaAddress(
              args.wallet_address,
            );
            return { address: args.wallet_address, isValid };
          },
        )

        .addCapability(
          'wallet_get_utxos',
          'Get UTXO information for a wallet',
          [
            {
              name: 'wallet_address',
              type: 'string',
              required: true,
              description: 'Wallet address to get UTXOs for',
            },
          ],
          ['show my UTXOs', 'wallet UTXO count', 'unspent outputs'],
          async (args) => {
            const utxos = await this.kaspaApiService.getWalletUtxos(
              args.wallet_address,
            );
            const count = await this.kaspaApiService.getWalletUtxosCount(
              args.wallet_address,
            );
            return { address: args.wallet_address, utxos, count };
          },
        )

        // === Network and Fee Information ===
        .addCapability(
          'wallet_get_fee_estimate',
          'Get current fee estimates for transactions',
          [],
          ['transaction fees', 'fee estimate', 'gas costs'],
          async () => await this.kaspaApiService.getFeeEstimate(),
        )

        .addCapability(
          'wallet_get_kaspa_price',
          'Get current Kaspa price',
          [],
          ['KAS price', 'current Kaspa price', 'market price'],
          async () => {
            const price = await this.kaspaApiService.getKaspaPrice();
            return { price, currency: 'USD', timestamp: new Date() };
          },
        )

        .build()
    );
  }
}
