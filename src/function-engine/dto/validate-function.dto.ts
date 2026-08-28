import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateFunctionDto {
  @IsNotEmpty()
  @IsString()
  plainTextFunction: string;
}
