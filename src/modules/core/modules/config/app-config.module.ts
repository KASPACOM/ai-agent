import { Global, Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';
import * as Joi from '@hapi/joi';
import { AppConfigService } from './app-config.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['production.env', 'development.env'],
      validationSchema: Joi.object({
        SERVICE_NAME: Joi.string(),
        NODE_ENV: Joi.string()
          .valid('development', 'production')
          .default('development'),
        ENV: Joi.string().valid('test', 'prod').default('test'),
        LOG_LEVEL: Joi.string().default('debug'),
        PORT: Joi.number().port().default(8080),
        SALT: Joi.number().integer().positive(),

        // Qdrant Vector Database
        QDRANT_URL: Joi.string().uri().optional(),
        QDRANT_API_KEY: Joi.string().allow('').optional(),
        QDRANT_COLLECTION_NAME: Joi.string().optional(),

        // Twitter/X Data Collection
        TWITTER_ACCOUNTS_CONFIG: Joi.string().optional().default('[]'),
        TWITTER_USERNAME: Joi.string().optional(),
        TWITTER_PASSWORD: Joi.string().optional(),
        TWITTER_EMAIL: Joi.string().optional(),

        // Twitter API v2 Configuration
        TWITTER_CLIENT_ID: Joi.string().optional(),
        TWITTER_CLIENT_SECRET: Joi.string().optional(),
        TWITTER_BEARER_TOKEN: Joi.string().optional(),
        TWITTER_ACCESS_TOKEN: Joi.string().optional(),
        TWITTER_ACCESS_TOKEN_SECRET: Joi.string().optional(),

        OPENAI_EMBEDDING_MODEL: Joi.string().optional(),
        OPENAI_EMBEDDING_DIMENSIONS: Joi.number()
          .integer()
          .positive()
          .optional(),

        // ETL and Cron Configuration
        ETL_SCHEDULE_INTERVAL: Joi.string().optional(),
        ETL_ENABLED: Joi.string()
          .valid('true', 'false')
          .optional()
          .default('false'),
        ETL_BATCH_SIZE: Joi.number().integer().positive().optional(),
        ETL_MAX_HISTORICAL_DAYS: Joi.number().integer().positive().optional(),

        // Telegram Bot API Configuration
        TELEGRAM_BOT_TOKEN: Joi.string().optional(),
        TELEGRAM_API_ID: Joi.string().optional(),
        TELEGRAM_API_HASH: Joi.string().optional(),
        TELEGRAM_CHANNELS_CONFIG: Joi.string().optional().default('[]'),

        // Service Configuration
        SERVICE_TYPE: Joi.string()
          .valid('ETL', 'AGENT')
          .optional()
          .default('ETL'),
      }),
      validationOptions: {
        abortEarly: true,
      },
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
