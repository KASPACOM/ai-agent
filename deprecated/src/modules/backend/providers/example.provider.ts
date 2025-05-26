import {Injectable} from "@nestjs/common";
import {ExampleService} from "../services/example.service";

@Injectable()
export class ExampleProvider {
    constructor(private readonly exampleService: ExampleService) {}

    async example() {
        return this.exampleService.example();
    }
}