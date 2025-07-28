import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TwitterCron {
    private readonly logger = new Logger(TwitterCron.name);

    constructor() { }
}
