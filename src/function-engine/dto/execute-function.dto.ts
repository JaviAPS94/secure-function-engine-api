import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExecuteFunctionDto {
  @IsNotEmpty()
  @IsString()
  encryptedFunction: string;

  @IsNotEmpty()
  parameters: Record<string, number>;

  @IsOptional()
  constants: Record<string, number>;
}
