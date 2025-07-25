# 🚀 KaspaRebro Development Rules

## Overview
This document outlines the development standards and practices for the KaspaRebro project. These rules ensure consistency, maintainability, and code quality across the entire codebase.

---

## 📝 Code Organization & Structure

### Module Architecture
- **Separation of Concerns**: Each module should have a single, well-defined responsibility
- **Dependency Direction**: Dependencies should flow inward (domain ← application ← infrastructure)
- **Interface Segregation**: Create focused interfaces rather than large, monolithic ones

### File Organization
```
src/modules/[domain]/
├── controllers/          # HTTP controllers (if needed)
├── services/            # Business logic services
├── models/              # Domain models and interfaces
├── config/              # Module configuration
├── transformers/        # Data transformation logic
└── [domain].module.ts   # Module definition
```

---

## 🎯 TypeScript Best Practices

### Type Safety Rules

#### 1. **NO `any` Types**
```typescript
// ❌ BAD
function processData(data: any): any {
  return data.someProperty;
}

// ✅ GOOD
interface ProcessDataInput {
  someProperty: string;
  otherField: number;
}

interface ProcessDataResult {
  processedValue: string;
}

function processData(data: ProcessDataInput): ProcessDataResult {
  return { processedValue: data.someProperty };
}
```

#### 2. **Use Enums Instead of Union Types**
```typescript
// ❌ BAD
type Status = 'pending' | 'processing' | 'completed' | 'failed';

// ✅ GOOD
enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
```

#### 3. **Predefined Interfaces Over Inline Object Types**
```typescript
// ❌ BAD - Inline object types
async function processData(input: string): Promise<{
  success: boolean;
  result: any;
  errors: string[];
}> {
  // implementation
}

function updateStats(stats: {
  processed: number;
  failed: number;
  lastRun: Date;
}): void {
  // implementation
}

// ✅ GOOD - Predefined interfaces
interface ProcessingResult {
  success: boolean;
  result: ProcessedData;
  errors: string[];
}

interface ProcessingStatistics {
  processed: number;
  failed: number;
  lastRun: Date;
}

async function processData(input: string): Promise<ProcessingResult> {
  // implementation
}

function updateStats(stats: ProcessingStatistics): void {
  // implementation
}
```

**Rule**: All object types in function parameters, return types, and class properties MUST be predefined as interfaces and imported by name. No inline object type definitions allowed.

### Interface Design
- **Single Responsibility**: Each interface should represent one cohesive concept
- **Descriptive Names**: Use clear, descriptive names that indicate the interface's purpose
- **Documentation**: Include JSDoc comments for complex interfaces
- **Composition**: Prefer composition over inheritance for interface design

---

## 🏗️ Service Design Patterns

### Dependency Injection
- Use NestJS DI container for all service dependencies
- Constructor injection is preferred over property injection
- Services should be stateless when possible

### Error Handling
```typescript
// ✅ GOOD - Proper error handling
async function riskyOperation(): Promise<OperationResult> {
  try {
    const result = await externalService.call();
    return { success: true, data: result };
  } catch (error) {
    this.logger.error('Operation failed', error);
    return { 
      success: false, 
      error: error.message,
      data: null 
    };
  }
}
```

### Logging Standards
- Use structured logging with context
- Log at appropriate levels (debug, info, warn, error)
- Include operation IDs for traceability
- Never log sensitive information (API keys, passwords, etc.)

---

## 📊 Data Modeling

### Entity Design
- Use interfaces for data transfer objects (DTOs)
- Use classes for domain entities with behavior
- Separate persistence models from domain models

### Validation
- Use class-validator for input validation
- Validate at the boundary (controllers, external integrations)
- Provide meaningful error messages

---

## 🔄 Data Flow & Transformation

### Single Transformation Principle
**Rule**: Transform data ONCE and correctly at the point of entry, then use a consistent model throughout the entire flow.

#### ❌ BAD - Multiple Transformations
```typescript
// Raw data → TelegramMessage → TransformedData → QdrantPayload → Storage
// Multiple object structures, complex mappings, unnecessary conversions

// Step 1: Create TelegramMessage
const telegramMessage: TelegramMessage = {
  telegramChannelTitle: 'My Channel',
  // ... other fields
};

// Step 2: Transform to different structure
const transformedData = {
  channelTitle: telegramMessage.telegramChannelTitle, // Different field name!
  // ... field mapping
};

// Step 3: Transform again for storage
const storagePayload = {
  channel_title: transformedData.channelTitle, // Different naming again!
  // ... more mapping
};
```

#### ✅ GOOD - Single Transformation
```typescript
// Raw data → TelegramMessage → (minimal conversions) → Storage
// One clean model flows through entire pipeline

// Step 1: Build complete model ONCE
const telegramMessage: TelegramMessage = {
  id: rawData.id,
  text: rawData.message,
  createdAt: new Date(rawData.date * 1000),
  telegramChannelTitle: channelInfo.title,
  telegramChannelId: channelInfo.id,
  // ... all fields correctly populated
};

// Step 2: Use same model everywhere
await processMessage(telegramMessage);      // ✅ Same structure
await analyzeContent(telegramMessage);      // ✅ Same structure
await embedMessage(telegramMessage);       // ✅ Same structure

// Step 3: Only convert what storage requires
const payload = {
  ...telegramMessage,                       // ✅ Keep all fields as-is
  createdAt: telegramMessage.createdAt.toISOString(), // Only convert Date → string
  stored_at: new Date().toISOString(),      // Add storage metadata
};
```

### Data Flow Rules

#### 1. **Build Complete Models Early**
- Create the complete domain model as soon as you receive raw data
- Include ALL necessary fields in the initial transformation
- Use proper types from the start (enums, interfaces, etc.)

#### 2. **Minimize Conversions**
Only transform data when absolutely necessary:
- **Dates**: Convert to ISO strings for database storage
- **Enums**: Ensure consistent string values
- **Arrays**: Serialize complex arrays to JSON for storage
- **Nested Objects**: Flatten only if required by storage layer

#### 3. **No Synthetic Data**
- Don't create "unknown" or placeholder values
- Store `null`/`undefined` for missing data
- Avoid synthetic IDs or generated content

#### 4. **Consistent Field Names**
- Use the same field names throughout the entire flow
- If a field is `telegramChannelTitle`, keep it as `telegramChannelTitle` everywhere
- Don't rename fields between services (`channelTitle` → `channel_title` → `title`)

#### 5. **Single Source of Truth**
```typescript
// ✅ GOOD - One interface defines the structure
interface TelegramMessage extends BaseMessage {
  telegramChannelTitle: string;
  telegramMessageId: number;
  telegramAuthorName?: string;
}

// Use this SAME interface in:
// - Services: processMessage(message: TelegramMessage)
// - Transformers: cleanText(message: TelegramMessage)
// - Storage: storeMessage(message: TelegramMessage)
// - Indexers: indexMessage(message: TelegramMessage)
```

### Implementation Guidelines

#### Service Layer
```typescript
// ✅ Build complete model in service
class TelegramIndexerService {
  async fetchMessages(): Promise<TelegramMessage[]> {
    const rawMessages = await this.mtproto.getMessages();
    
    // Transform ONCE to complete model
    return rawMessages.map(raw => ({
      id: `telegram_${raw.id}`,
      text: raw.message,
      createdAt: new Date(raw.date * 1000),
      author: this.channelInfo.title,
      authorHandle: this.channelInfo.username,
      telegramChannelTitle: this.channelInfo.title,
      telegramChannelId: this.channelInfo.id,
      telegramMessageId: raw.id,
      // ... complete model built here
    }));
  }
}
```

#### Storage Layer
```typescript
// ✅ Minimal conversion for storage
async storeTelegramMessages(messages: TelegramMessage[]) {
  const points = messages.map(message => ({
    id: generateId(message.id),
    vector: message.vector,
    payload: {
      ...message,  // Keep all fields as-is!
      // Only convert what Qdrant can't handle
      createdAt: message.createdAt.toISOString(),
      processedAt: message.processedAt.toISOString(),
    }
  }));
  
  return this.qdrant.upsert(points);
}
```

**Remember**: If you find yourself mapping fields between different object structures, you're probably over-engineering. Build it right the first time and keep it consistent throughout the flow.

---

## 🔧 Configuration Management

### Environment Variables
- All configuration through environment variables
- Use Joi for configuration validation
- Provide sensible defaults where appropriate
- Document all configuration options

### Service Configuration
```typescript
// ✅ GOOD - Centralized configuration service
@Injectable()
export class MyServiceConfig {
  constructor(private appConfig: AppConfigService) {}
  
  getTimeout(): number {
    return this.appConfig.getMyServiceTimeout;
  }
}
```

---

## 🧪 Testing Standards

### Unit Tests
- Test business logic in isolation
- Mock external dependencies
- Use descriptive test names
- Aim for high code coverage on business logic

### Integration Tests
- Test module interactions
- Use real implementations where practical
- Test error scenarios
- Validate end-to-end flows

---

## 📚 Documentation

### Code Documentation
- Use JSDoc for public APIs
- Include examples for complex functions
- Document business rules and assumptions
- Keep documentation up-to-date with code changes

### API Documentation
- OpenAPI/Swagger for REST APIs
- Include request/response examples
- Document error codes and scenarios

---

## 🚀 Performance Guidelines

### Async/Await
- Use async/await for asynchronous operations
- Handle promise rejections appropriately
- Avoid blocking operations in async functions

### Database Access
- Use connection pooling
- Implement proper indexing strategies
- Optimize queries for common use cases
- Use pagination for large result sets

---

## 🔒 Security Practices

### Input Validation
- Validate all inputs at API boundaries
- Sanitize data before processing
- Use parameterized queries to prevent injection

### Authentication & Authorization
- Implement proper JWT handling
- Use role-based access control
- Log security events

---

## 📋 Code Review Guidelines

### Before Submitting
- Run linting and formatting tools
- Execute all tests
- Update documentation if needed
- Self-review your changes

### Review Checklist
- Code follows established patterns
- Proper error handling implemented
- Tests cover new functionality
- No security vulnerabilities introduced
- Performance implications considered

---

## 🛠️ Tools & Automation

### Required Tools
- ESLint for code linting
- Prettier for code formatting
- Jest for testing
- TypeScript for type checking

### Pre-commit Hooks
- Automatic code formatting
- Linting validation
- Test execution
- Type checking

---

## 📈 Monitoring & Observability

### Logging
- Structured JSON logging in production
- Include correlation IDs for request tracing
- Log performance metrics
- Monitor error rates and patterns

### Health Checks
- Implement health check endpoints
- Monitor external service dependencies
- Track resource utilization
- Set up alerting for critical issues

---

## 🔄 Development Workflow

### Branch Strategy
- Use feature branches for new development
- Require pull request reviews
- Maintain a clean main branch
- Use semantic versioning for releases

### Commit Messages
- Use conventional commit format
- Include ticket/issue references
- Write descriptive commit messages
- Keep commits focused and atomic

---

*These rules are living guidelines that evolve with the project. When in doubt, prioritize code clarity and maintainability over cleverness.* 