import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { DeFiAgentService } from '../../../src/modules/integrations/openserv/agents/defi-agent.service';
import { TradingAgentService } from '../../../src/modules/integrations/openserv/agents/trading-agent.service';
import { WalletAgentService } from '../../../src/modules/integrations/openserv/agents/wallet-agent.service';
import { TokenRegistryAgentService } from '../../../src/modules/integrations/openserv/agents/token-registry-agent.service';
import { UserManagementAgentService } from '../../../src/modules/integrations/openserv/agents/user-management-agent.service';

describe('Agent Capabilities', () => {
  let defiAgent: DeFiAgentService;
  let tradingAgent: TradingAgentService;
  let walletAgent: WalletAgentService;
  let tokenRegistryAgent: TokenRegistryAgentService;
  let userManagementAgent: UserManagementAgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule, ConfigModule],
      providers: [
        DeFiAgentService,
        TradingAgentService,
        WalletAgentService,
        TokenRegistryAgentService,
        UserManagementAgentService,
      ],
    }).compile();

    defiAgent = module.get<DeFiAgentService>(DeFiAgentService);
    tradingAgent = module.get<TradingAgentService>(TradingAgentService);
    walletAgent = module.get<WalletAgentService>(WalletAgentService);
    tokenRegistryAgent = module.get<TokenRegistryAgentService>(
      TokenRegistryAgentService,
    );
    userManagementAgent = module.get<UserManagementAgentService>(
      UserManagementAgentService,
    );
  });

  describe('DeFiAgentService', () => {
    it('should have getCapabilities method', () => {
      expect(defiAgent.getCapabilities).toBeDefined();
      expect(typeof defiAgent.getCapabilities).toBe('function');
    });

    it('should return valid capabilities', () => {
      const capabilities = defiAgent.getCapabilities();
      expect(Array.isArray(capabilities)).toBe(true);
      expect(capabilities.length).toBeGreaterThan(0);

      capabilities.forEach((cap) => {
        expect(cap.name).toBeDefined();
        expect(cap.description).toBeDefined();
        expect(Array.isArray(cap.parameters)).toBe(true);
        expect(Array.isArray(cap.examples)).toBe(true);
      });
    });

    it('should include expected DeFi capabilities', () => {
      const capabilities = defiAgent.getCapabilities();
      const capabilityNames = capabilities.map((cap) => cap.name);

      expect(capabilityNames).toContain('defi_swap_tokens');
      expect(capabilityNames).toContain('defi_get_swap_quote');
      expect(capabilityNames).toContain('defi_add_liquidity');
      expect(capabilityNames).toContain('defi_general_query');
    });
  });

  describe('TradingAgentService', () => {
    it('should have getCapabilities method', () => {
      expect(tradingAgent.getCapabilities).toBeDefined();
      expect(typeof tradingAgent.getCapabilities).toBe('function');
    });

    it('should return valid capabilities', () => {
      const capabilities = tradingAgent.getCapabilities();
      expect(Array.isArray(capabilities)).toBe(true);
      expect(capabilities.length).toBeGreaterThan(0);

      capabilities.forEach((cap) => {
        expect(cap.name).toBeDefined();
        expect(cap.description).toBeDefined();
        expect(Array.isArray(cap.parameters)).toBe(true);
        expect(Array.isArray(cap.examples)).toBe(true);
      });
    });

    it('should include expected trading capabilities', () => {
      const capabilities = tradingAgent.getCapabilities();
      const capabilityNames = capabilities.map((cap) => cap.name);

      expect(capabilityNames).toContain('trading_get_market_data');
      expect(capabilityNames).toContain('trading_get_floor_price');
      expect(capabilityNames).toContain('trading_get_orders');
      expect(capabilityNames).toContain('trading_estimate_gas');
    });
  });

  describe('WalletAgentService', () => {
    it('should have getCapabilities method', () => {
      expect(walletAgent.getCapabilities).toBeDefined();
      expect(typeof walletAgent.getCapabilities).toBe('function');
    });

    it('should return valid capabilities', () => {
      const capabilities = walletAgent.getCapabilities();
      expect(Array.isArray(capabilities)).toBe(true);
      expect(capabilities.length).toBeGreaterThan(0);

      capabilities.forEach((cap) => {
        expect(cap.name).toBeDefined();
        expect(cap.description).toBeDefined();
        expect(Array.isArray(cap.parameters)).toBe(true);
        expect(Array.isArray(cap.examples)).toBe(true);
      });
    });

    it('should include expected wallet capabilities', () => {
      const capabilities = walletAgent.getCapabilities();
      const capabilityNames = capabilities.map((cap) => cap.name);

      expect(capabilityNames).toContain('wallet_get_portfolio');
      expect(capabilityNames).toContain('wallet_get_token_balance');
      expect(capabilityNames).toContain('wallet_validate_address');
      expect(capabilityNames).toContain('wallet_get_activity');
    });
  });

  describe('TokenRegistryAgentService', () => {
    it('should have getCapabilities method', () => {
      expect(tokenRegistryAgent.getCapabilities).toBeDefined();
      expect(typeof tokenRegistryAgent.getCapabilities).toBe('function');
    });

    it('should return valid capabilities', () => {
      const capabilities = tokenRegistryAgent.getCapabilities();
      expect(Array.isArray(capabilities)).toBe(true);
      expect(capabilities.length).toBeGreaterThan(0);

      capabilities.forEach((cap) => {
        expect(cap.name).toBeDefined();
        expect(cap.description).toBeDefined();
        expect(Array.isArray(cap.parameters)).toBe(true);
        expect(Array.isArray(cap.examples)).toBe(true);
      });
    });

    it('should include expected token registry capabilities', () => {
      const capabilities = tokenRegistryAgent.getCapabilities();
      const capabilityNames = capabilities.map((cap) => cap.name);

      expect(capabilityNames).toContain('token_get_info');
      expect(capabilityNames).toContain('token_search');
      expect(capabilityNames).toContain('token_get_price_history');
      expect(capabilityNames).toContain('nft_get_collections');
    });
  });

  describe('UserManagementAgentService', () => {
    it('should have getCapabilities method', () => {
      expect(userManagementAgent.getCapabilities).toBeDefined();
      expect(typeof userManagementAgent.getCapabilities).toBe('function');
    });

    it('should return capabilities marked as internal', () => {
      const capabilities = userManagementAgent.getCapabilities();
      expect(Array.isArray(capabilities)).toBe(true);
      expect(capabilities.length).toBeGreaterThan(0);

      // All capabilities for user management should be internal
      capabilities.forEach((cap) => {
        expect(cap.isInternal).toBe(true);
        expect(cap.name).toBeDefined();
        expect(cap.description).toBeDefined();
        expect(Array.isArray(cap.parameters)).toBe(true);
        expect(Array.isArray(cap.examples)).toBe(true);
      });
    });

    it('should be marked as internal only', () => {
      expect(userManagementAgent.isInternalOnly).toBe(true);
    });
  });

  describe('Cross-Agent Capability Validation', () => {
    it('should ensure no duplicate capability names across agents', () => {
      const allCapabilities = [
        ...defiAgent.getCapabilities(),
        ...tradingAgent.getCapabilities(),
        ...walletAgent.getCapabilities(),
        ...tokenRegistryAgent.getCapabilities(),
        ...userManagementAgent.getCapabilities(),
      ];

      const capabilityNames = allCapabilities.map((cap) => cap.name);
      const uniqueNames = [...new Set(capabilityNames)];

      expect(capabilityNames.length).toBe(uniqueNames.length);
    });

    it('should have consistent parameter schema structure', () => {
      const allCapabilities = [
        ...defiAgent.getCapabilities(),
        ...tradingAgent.getCapabilities(),
        ...walletAgent.getCapabilities(),
        ...tokenRegistryAgent.getCapabilities(),
        ...userManagementAgent.getCapabilities(),
      ];

      allCapabilities.forEach((cap) => {
        cap.parameters.forEach((param) => {
          expect(param.name).toBeDefined();
          expect(param.type).toBeDefined();
          expect(typeof param.required).toBe('boolean');
          expect(param.description).toBeDefined();
        });
      });
    });
  });
});
