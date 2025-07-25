import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  get isProduction(): boolean {
    return this.configService.get('nodeEnv') === 'production';
  }

  get getServiceName(): string {
    return this.configService.get('name') || 'default-service';
  }

  get getEnv(): string {
    return this.configService.get('env');
  }

  get getServicePort(): number {
    return this.configService.get('port');
  }

  get getMailTransport(): string {
    return this.configService.get('MAIL_TRANSPORT');
  }

  // Telegram config
  get getTelegramBotToken(): string {
    return this.configService.get('TELEGRAM_BOT_TOKEN');
  }

  get getTelegramChannelId(): string {
    return this.configService.get('TELEGRAM_CHANNEL_ID');
  }

  // OpenAI config
  get getOpenAiApiKey(): string {
    return this.configService.get('OPENAI_API_KEY');
  }

  get getOpenAiModelName(): string {
    return this.configService.get('openai.model') || 'gpt-4o';
  }

  // Qdrant Vector Database config
  get getQdrantUrl(): string {
    return this.configService.get('QDRANT_URL') || 'http://localhost:6333';
  }

  get getQdrantApiKey(): string {
    return this.configService.get('QDRANT_API_KEY');
  }

  get getQdrantCollectionName(): string {
    return this.configService.get('QDRANT_COLLECTION_NAME') || 'kaspa_tweets';
  }

  // Twitter/X Data Collection config
  get getTwitterAccountsConfig(): string[] {
    const accounts = this.configService.get('TWITTER_ACCOUNTS_CONFIG');
    try {
      return JSON.parse(accounts);
    } catch (error) {
      throw new Error(
        `Failed to parse TWITTER_ACCOUNTS_CONFIG: ${error.message}. Expected valid JSON array format.`,
      );
    }
  }

  get getTwitterUsername(): string {
    return this.configService.get('TWITTER_USERNAME');
  }

  get getTwitterPassword(): string {
    return this.configService.get('TWITTER_PASSWORD');
  }

  get getTwitterEmail(): string {
    return this.configService.get('TWITTER_EMAIL');
  }

  get getTwitterBearerToken(): string {
    return this.configService.get('TWITTER_BEARER_TOKEN');
  }

  get getOpenAiEmbeddingModel(): string {
    return (
      this.configService.get('OPENAI_EMBEDDING_MODEL') ||
      'text-embedding-3-large'
    );
  }

  get getOpenAiEmbeddingDimensions(): number {
    return parseInt(
      this.configService.get('OPENAI_EMBEDDING_DIMENSIONS') || '3072',
      10,
    );
  }

  // Twitter API v2 config
  get getTwitterApiKey(): string {
    return this.configService.get('TWITTER_API_KEY');
  }

  get getTwitterApiSecret(): string {
    return this.configService.get('TWITTER_API_SECRET');
  }

  get getTwitterAccessToken(): string {
    return this.configService.get('TWITTER_ACCESS_TOKEN');
  }

  get getTwitterAccessTokenSecret(): string {
    return this.configService.get('TWITTER_ACCESS_TOKEN_SECRET');
  }

  // ETL and Cron config
  get getEtlScheduleInterval(): string {
    return this.configService.get('ETL_SCHEDULE_INTERVAL') || '*/1 * * * *';
  }

  get getEtlEnabled(): boolean {
    return this.configService.get('ETL_ENABLED') === 'true';
  }

  get getEtlBatchSize(): number {
    return parseInt(this.configService.get('ETL_BATCH_SIZE') || '100', 10);
  }

  get getEtlMaxHistoricalDays(): number {
    return parseInt(
      this.configService.get('ETL_MAX_HISTORICAL_DAYS') || '30',
      10,
    );
  }

  // Additional Telegram Bot API config
  get getTelegramApiId(): string {
    return this.configService.get('TELEGRAM_API_ID');
  }

  get getTelegramApiHash(): string {
    return this.configService.get('TELEGRAM_API_HASH');
  }

  get getTelegramChannelsConfig(): any[] {
    const channels = this.configService.get('TELEGRAM_CHANNELS_CONFIG');
    
    // Handle empty, undefined, or whitespace-only values
    if (!channels || typeof channels !== 'string' || channels.trim() === '') {
      return [];
    }

    // Clean up the string - remove any extra whitespace and newlines that might interfere
    const cleanedChannels = channels.trim().replace(/\s+/g, ' ');
    
    try {
      const parsed = JSON.parse(cleanedChannels);
      console.log(`✅ Successfully parsed TELEGRAM_CHANNELS_CONFIG: ${parsed.length} channels configured`);
      return parsed;
    } catch (error) {
      console.warn(
        `❌ Failed to parse TELEGRAM_CHANNELS_CONFIG: ${error.message}. Returning empty array. Expected valid JSON array format.`,
      );
      console.warn(`Raw value: "${channels}"`);
      console.warn(`Cleaned value: "${cleanedChannels}"`);
      return []; // Return empty array instead of throwing error during startup
    }
  }

  // Service Configuration
  get getServiceType(): 'ETL' | 'AGENT' {
    const serviceType = this.configService.get('SERVICE_TYPE');
    if (serviceType === 'ETL' || serviceType === 'AGENT') {
      return serviceType;
    }
    return 'ETL'; // Default fallback
  }
}
