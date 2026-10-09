import { IsNotEmpty, IsString } from 'class-validator';

export class InvokedFormulasDto {
  @IsNotEmpty()
  @IsString()
  encryptedFunction: string;
}
