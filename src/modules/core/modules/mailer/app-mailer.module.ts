import { DynamicModule, Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { EjsAdapter } from '@nestjs-modules/mailer/dist/adapters/ejs.adapter';
import { AppConfigService } from '../config/app-config.service';
import { AppMailerService } from './app-mailer.service';

@Global()
@Module({
  imports: [AppConfigModule],
})
export class AppMailerModule {
  static forRoot(): DynamicModule {
    return {
      module: AppMailerModule,
      imports: [
        AppConfigModule,
        MailerModule.forRootAsync({
          imports: [AppConfigModule],
          inject: [AppConfigService],
          useFactory: async (appConfigService: AppConfigService) => ({
            transport: appConfigService.getMailTransport, // e.g., 'smtps://user@domain.com:pass@smtp.domain.com'
            defaults: {
              from: '"KAS ADMIN" <admin@kas.test>',
            },
            template: {
              dir: __dirname + '/templates',
              adapter: new EjsAdapter(),
              options: {
                strict: true,
              },
            },
          }),
        }),
      ],
      providers: [AppMailerService],
      exports: [AppMailerService],
    };
  }
}
