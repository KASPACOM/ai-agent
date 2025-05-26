import { Injectable, Inject, Scope } from '@nestjs/common';
import { Logger } from 'winston';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class AppLoggerService {
    private context: string;

    constructor(
        @Inject('LOGGER') private readonly logger: Logger,
        @Inject(REQUEST) private readonly request: Request
    ) {
        this.context = 'Default';
    }

    setContext(context: string) {
        this.context = context;
    }

    private getMessageWithContext(message: string): string {
        return `[${this.context}] ${message}`;
    }

    private getMetadata() {
        return {
            requestId: this.request.headers['x-request-id'] || 'N/A',
            userId: (this.request as any).user?.id || 'N/A',
            path: this.request.path,
            method: this.request.method,
        };
    }

    error(message: string, trace?: string, meta?: object) {
        this.logger.error(this.getMessageWithContext(message), {
            ...this.getMetadata(),
            ...meta,
            trace,
        });
    }

    warn(message: string, meta?: object) {
        this.logger.warn(this.getMessageWithContext(message), {
            ...this.getMetadata(),
            ...meta,
        });
    }

    info(message: string, meta?: object) {
        this.logger.info(this.getMessageWithContext(message), {
            ...this.getMetadata(),
            ...meta,
        });
    }

    http(message: string, meta?: object) {
        this.logger.http(this.getMessageWithContext(message), {
            ...this.getMetadata(),
            ...meta,
        });
    }

    verbose(message: string, meta?: object) {
        this.logger.verbose(this.getMessageWithContext(message), {
            ...this.getMetadata(),
            ...meta,
        });
    }

    debug(message: string, meta?: object) {
        this.logger.debug(this.getMessageWithContext(message), {
            ...this.getMetadata(),
            ...meta,
        });
    }

    silly(message: string, meta?: object) {
        this.logger.silly(this.getMessageWithContext(message), {
            ...this.getMetadata(),
            ...meta,
        });
    }
}