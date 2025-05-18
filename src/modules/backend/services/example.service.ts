import {Injectable} from "@nestjs/common";
import {AppLoggerService} from "../../core/modules/logger/app-logger.service";
import {AppConfigService} from "../../core/modules/config/app-config.service";
import {HttpService} from "@nestjs/axios";

@Injectable()
export class ExampleService {

    constructor(
        private readonly httpService: HttpService,
        private readonly logger: AppLoggerService,
        private readonly config: AppConfigService) {}

    async example() {
        const res = await this.httpService.get('http://google.com');
        this.logger.info('test!');
        return 'Hello world'
    }
}