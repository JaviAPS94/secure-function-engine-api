import { IsNotEmpty, IsString } from 'class-validator';

export class DecryptFunctionDto {
  @IsNotEmpty()
  @IsString()
  encryptedFunction: string;
}
