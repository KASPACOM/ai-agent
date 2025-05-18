import {Module} from "@nestjs/common";
import {ExampleController} from "./controllers/example.controller";
import {ExampleProvider} from "./providers/example.provider";
import {ExampleService} from "./services/example.service";
import {HttpModule} from "@nestjs/axios";

@Module({
    controllers: [ExampleController],
    providers: [
        ExampleProvider,
        ExampleService,
    ],
    imports: [
        HttpModule,
    ],
    exports: []
})
export class BackendModule {}