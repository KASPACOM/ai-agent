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
}
