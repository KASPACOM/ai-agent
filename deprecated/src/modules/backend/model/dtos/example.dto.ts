import {IsArray, IsNumber, IsOptional, IsString} from "class-validator";

export class ExampleDto {
    @IsString()
    test: string;

    @IsOptional()
    @IsNumber()
    optionalProperty: number;

    @IsArray()
    @IsNumber({}, {each: true})
    @IsOptional()
    arrayProperty: number[];
}