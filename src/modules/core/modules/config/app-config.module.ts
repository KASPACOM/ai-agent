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
