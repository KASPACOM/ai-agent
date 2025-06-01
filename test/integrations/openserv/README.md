# OpenServ Three-Stage Orchestrator - Modular Agent Capabilities

## Overview

This implementation addresses the critical architecture flaw where agent capabilities were hardcoded in the orchestrator. Now each agent owns and exposes its own capabilities through a `getCapabilities()` method, making the system truly modular and agent-agnostic.

## Architecture Changes

### Before (Hardcoded Capabilities)
```typescript
// OLD: Hardcoded in orchestrator
private async getAvailableAgentCapabilities(): Promise<AgentCapabilityInfo[]> {
  return [
    {
      agent: 'defi-agent',
      capabilities: [
        // Hardcoded capabilities...
      ],
    },
    // More hardcoded agents...
  ];
}
```

### After (Dynamic Discovery)
```typescript
// NEW: Dynamic discovery from agents
private async getAvailableAgentCapabilities(): Promise<AgentCapabilityInfo[]> {
  const agents = [
    { name: 'defi-agent', service: this.defiAgent },
    { name: 'trading-agent', service: this.tradingAgent },
    // ...other agents
  ];

  for (const agent of agents) {
    const capabilities = agent.service.getCapabilities();
    // Dynamic discovery...
  }
}
```

## Agent Implementation Pattern

Each agent service now implements a `getCapabilities()` method:

```typescript
@Injectable()
export class DeFiAgentService {
  getCapabilities(): CapabilityDetail[] {
    return [
      {
        name: 'defi_swap_tokens',
        description: 'Execute token swaps on DeFi protocols',
        parameters: [
          {
            name: 'fromToken',
            type: 'string',
            required: true,
            description: 'Token to swap from',
          },
          // ... more parameters
        ],
        examples: ['swap 100 KAS for USDT'],
      },
      // ... more capabilities
    ];
  }
}
```

## Internal vs Public Capabilities

The system supports internal-only capabilities that are filtered out from external exposure:

```typescript
{
  name: 'user_get_notifications',
  description: '[INTERNAL] Get user notifications',
  isInternal: true, // Filtered out from public discovery
}
```

## Benefits

1. **True Modularity**: Each agent owns its capabilities
2. **Dynamic Discovery**: No hardcoded capability definitions
3. **Agent Agnostic**: Orchestrator doesn't need to know about specific agents
4. **Easy Extension**: Adding new agents doesn't require orchestrator changes
5. **Internal Filtering**: Support for internal-only capabilities

## Test Structure

### Test Files
- `three-stage-orchestrator.spec.ts` - Tests orchestrator's dynamic discovery
- `agents.capabilities.spec.ts` - Tests all agent capabilities

### Key Test Scenarios
1. **Dynamic Discovery**: Verify orchestrator discovers capabilities from all agents
2. **Capability Validation**: Ensure all capabilities have required fields
3. **Internal Filtering**: Verify internal capabilities are filtered out
4. **Cross-Agent Validation**: No duplicate capability names
5. **Schema Consistency**: Parameter schemas are consistent

## Running Tests

```bash
# Run all OpenServ tests
npm test -- test/integrations/openserv

# Run specific test files
npm test -- test/integrations/openserv/three-stage-orchestrator.spec.ts
npm test -- test/integrations/openserv/agents.capabilities.spec.ts
```

## Agent Services Included

1. **DeFiAgentService** - DeFi operations (swaps, liquidity, pools)
2. **TradingAgentService** - Trading operations (orders, market data, analytics)
3. **WalletAgentService** - Wallet management (portfolio, balances, activity)
4. **TokenRegistryAgentService** - Token discovery (search, info, NFTs, KNS)
5. **UserManagementAgentService** - Internal user operations (notifications, auth)

## Next Steps

The architecture is now properly modular. Future enhancements can include:

1. **Real LLM Integration**: Replace mock decision/synthesis LLMs
2. **Capability Caching**: Cache discovered capabilities for performance
3. **Agent Registration**: Dynamic agent registration at runtime
4. **Capability Versioning**: Support for evolving agent capabilities 