import {Module, Global, forwardRef, DynamicModule} from '@nestjs/common';
import { createLogger, Logger, format, transports } from 'winston';
import {AppConfigService} from "../config/app-config.service";
import {AppLoggerService} from "./app-logger.service";
import {AppConfigModule} from "../config/app-config.module";

@Global()
@Module({})
export class AppLoggerModule {
    static forRoot(): DynamicModule {
        return {
            module: AppLoggerModule,
            imports: [AppConfigModule],
            providers: [
                AppLoggerService,
                {
                    provide: 'LOGGER',
                    useFactory: (config: AppConfigService) => {
                        return createLogger({
                            level: 'info',
                            format: format.combine(
                                format.timestamp(),
                                format.errors({ stack: true }),
                                format.splat(),
                                format.json()
                            ),
                            defaultMeta: {
                                service: config.getServiceName,
                            },
                            transports: [
                                new transports.Console({
                                    format: format.combine(
                                        format.colorize(),
                                        format.simple()
                                    )
                                }),
                                // Add transport for APM and such
                            ]
                        });
                    },
                    inject: [AppConfigService]
                }
            ],
            exports: [
                'LOGGER',
                AppLoggerService
            ]
        };
    }
}