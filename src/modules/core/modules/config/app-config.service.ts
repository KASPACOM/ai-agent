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

  get getOpenAiEmbeddingModel(): string {
    return (
      this.configService.get('OPENAI_EMBEDDING_MODEL') ||
      'text-embedding-3-small'
    );
  }

  get getOpenAiEmbeddingDimensions(): number {
    return parseInt(
      this.configService.get('OPENAI_EMBEDDING_DIMENSIONS') || '1536',
      10,
    );
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
}
