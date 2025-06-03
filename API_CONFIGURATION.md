# API Configuration & Integration Guide

## 🔧 Environment Configuration

### **Required Environment Variables**

```env
# OpenAI LLM Integration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_TEMPERATURE=0.3
OPENAI_MAX_TOKENS=1000

# Kaspa Blockchain APIs
KASPA_API_BASE_URL=https://api.kaspa.org
KASPA_NETWORK=mainnet

# Kasplex KRC20 APIs
KASPLEX_API_BASE_URL=https://api.kasplex.org/v1
KASPLEX_TIMEOUT=30000

# Kaspiano Backend APIs
BACKEND_API_BASE_URL=https://api.kaspiano.com
BACKEND_TIMEOUT=15000

# Telegram Integration (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook

# OpenServ Integration (Optional)
OPENSERV_API_KEY=your_openserv_api_key
OPENSERV_API_BASE_URL=https://api.openserv.com

# Application Settings
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
```

## 📡 API Integrations

### **1. Kaspa Blockchain API**

**Service**: `KaspaApiService`  
**Purpose**: Direct blockchain queries for KAS balances, UTXOs, transactions

```typescript
// Endpoints Used
GET /addresses/{address}/balance
GET /addresses/{address}/utxos  
GET /addresses/{address}/transactions
GET /network/info
GET /transactions/{txId}

// Example Integration
const balance = await kaspaApi.getBalance(walletAddress);
const utxos = await kaspaApi.getUtxos(walletAddress);
```

**Capabilities Using This API:**
- `wallet_get_kaspa_balance`
- `wallet_get_utxos`
- `wallet_get_activity`
- `wallet_validate_address`

### **2. Kasplex KRC20 API**

**Service**: `KasplexKrc20Service`  
**Purpose**: KRC20 token data, balances, and metadata

```typescript
// Endpoints Used
GET /krc20/address/{address}/tokens
GET /krc20/token/{ticker}
GET /krc20/tokens
GET /krc20/token/{ticker}/holders
GET /krc20/token/{ticker}/info

// Example Integration
const tokens = await kasplex.getTokens(walletAddress);
const tokenInfo = await kasplex.getTokenInfo(ticker);
```

**Capabilities Using This API:**
- `wallet_get_token_balance`
- `wallet_get_portfolio`
- `token_get_kasplex_info`
- `token_get_holders`
- `token_list_all`

### **3. Kaspiano Backend API**

**Service**: `BackendApiService`  
**Purpose**: Market data, trading information, DeFi operations, NFT collections

```typescript
// Trading & Market Endpoints
GET /api/market/stats
GET /api/tokens/{ticker}
GET /api/trading/orders
GET /api/gas/estimate
POST /api/tokens/search

// NFT Collection Endpoints
GET /krc721                  // All NFT collections
GET /krc721/{ticker}/stats   // Collection statistics
GET /p2p-data/floor-price/{ticker}  // Floor prices

// Example Integration
const marketData = await backend.getMarketData(ticker);
const nftCollections = await backend.fetchAllNFTCollections();
const floorPrice = await backend.getFloorPrice('KASPUNKS');
```

**Capabilities Using This API:**
- `trading_get_market_data`
- `trading_get_floor_price`
- `trading_get_sell_orders`
- `defi_get_token_info`
- `token_get_info`
- `nft_get_collection_info`
- `nft_get_floor_price`
- `nft_list_collections`
- `nft_get_collection_stats`

### **4. OpenAI API**

**Service**: `OpenAiAdapter`  
**Purpose**: LLM processing for decision making and response synthesis

```typescript
// OpenAI GPT-4 Integration
const decision = await openai.generateStructuredOutput(conversation, schema);
const response = await openai.generateCompletion(messages);

// Used in 3-Stage Processing:
// Stage 1: Decision Agent - Route user input to capabilities
// Stage 3: Synthesis Agent - Generate natural language responses
```

## 🔐 Authentication Patterns

### **Current Status: Public APIs Only**

All 32 active capabilities use **public APIs** that require no authentication:

```typescript
// No authentication headers required
const headers = {
  'Content-Type': 'application/json',
  'User-Agent': 'Kasparebro/1.0.0'
};
```

### **Future: Wallet Authentication** 

For private capabilities (pending implementation):

```typescript
// JWT-based authentication (planned)
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${jwtToken}`,
  'X-Wallet-Address': walletAddress
};

// PSKT transaction signing (planned)
const psktSignature = await wallet.signPSKT(transaction);
```

## 🛡️ Error Handling

### **Standardized Error Responses**

```typescript
// API Integration Errors
try {
  const result = await apiService.getData();
} catch (error) {
  if (error.response?.status === 404) {
    throw new CapabilityError('Resource not found', 'NOT_FOUND');
  }
  if (error.response?.status >= 500) {
    throw new CapabilityError('Service unavailable', 'SERVICE_ERROR');
  }
  throw new CapabilityError('Request failed', 'API_ERROR');
}

// User-Friendly Error Messages
{
  "success": false,
  "error": "Token 'INVALID' not found in registry",
  "errorCode": "NOT_FOUND",
  "suggestion": "Please check the token symbol and try again"
}
```

### **Timeout & Retry Logic**

```typescript
// Configurable timeouts per service
const kaspaConfig = {
  timeout: 30000,
  retries: 3,
  backoff: 'exponential'
};

// Circuit breaker for failing services
if (consecutiveFailures > 5) {
  throw new ServiceUnavailableError('API temporarily unavailable');
}
```

## 📊 Rate Limiting

### **API Rate Limits**

| Service | Rate Limit | Retry Strategy |
|---------|------------|----------------|
| Kaspa API | 60 req/min | Exponential backoff |
| Kasplex API | 100 req/min | Linear backoff |
| Backend API | 200 req/min | Immediate retry |
| OpenAI API | 3000 req/min | Queue-based |

### **Implementation**

```typescript
// Rate limiting per service
class RateLimiter {
  async execute<T>(apiCall: () => Promise<T>): Promise<T> {
    await this.waitForSlot();
    try {
      return await apiCall();
    } catch (error) {
      if (error.status === 429) {
        await this.backoff();
        return this.execute(apiCall);
      }
      throw error;
    }
  }
}
```

## 🔄 API Response Caching

### **Caching Strategy**

```typescript
// Cache configuration by data type
const cacheConfig = {
  tokenInfo: { ttl: 300000 },      // 5 minutes
  marketData: { ttl: 60000 },     // 1 minute  
  walletBalance: { ttl: 30000 },  // 30 seconds
  priceData: { ttl: 15000 }       // 15 seconds
};

// Redis-based caching (planned)
const cachedResult = await redis.get(`token:${ticker}`);
if (!cachedResult) {
  const result = await apiCall();
  await redis.setex(`token:${ticker}`, 300, JSON.stringify(result));
}
```

## 🧪 Testing Configuration

### **Test Environment**

```env
# Test API endpoints
KASPA_API_BASE_URL=https://testnet-api.kaspa.org
KASPLEX_API_BASE_URL=https://testnet-api.kasplex.org
BACKEND_API_BASE_URL=https://dev-api.kaspiano.com

# Test credentials
OPENAI_API_KEY=test_openai_key
TELEGRAM_BOT_TOKEN=test_telegram_token
```

### **Mock Services for Testing**

```typescript
// Use real APIs in tests when possible
describe('Token Registry Agent', () => {
  it('should fetch real token data', async () => {
    const result = await agent.executeCapability('token_get_info', {
      ticker: 'NACHO'
    });
    expect(result.success).toBe(true);
    expect(result.data.ticker).toBe('NACHO');
  });
});
```

## 📈 Monitoring & Observability

### **API Health Monitoring**

```typescript
// Health check endpoints
GET /health/kaspa-api
GET /health/kasplex-api  
GET /health/backend-api
GET /health/openai-api

// Response format
{
  "service": "kaspa-api",
  "status": "healthy",
  "responseTime": 156,
  "lastError": null,
  "uptime": "99.9%"
}
```

### **Performance Metrics**

- **Response Times**: Track API response latencies
- **Success Rates**: Monitor API call success percentages
- **Error Rates**: Track and alert on error spikes
- **Rate Limit Usage**: Monitor API quota consumption

## 🔧 Development Tools

### **API Testing**

```bash
# Test individual capabilities
curl -X POST http://localhost:3000/api/capability \
  -H "Content-Type: application/json" \
  -d '{"capability": "token_get_info", "args": {"ticker": "NACHO"}}'

# Test health endpoints
curl http://localhost:3000/health

# Test with different environments
NODE_ENV=test npm run start:dev
```

### **Configuration Validation**

```typescript
// Environment validation on startup
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'KASPA_API_BASE_URL', 
  'KASPLEX_API_BASE_URL',
  'BACKEND_API_BASE_URL'
];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});
```

---

**Status**: ✅ All API integrations production-ready with 32 active capabilities using real endpoints. 