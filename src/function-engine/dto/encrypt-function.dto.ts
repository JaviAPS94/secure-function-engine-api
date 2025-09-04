import { IsNotEmpty, IsString } from 'class-validator';

export class EncryptFunctionDto {
  @IsNotEmpty()
  @IsString()
  plainTextFunction: string;
}
