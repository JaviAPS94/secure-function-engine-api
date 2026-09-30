import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Una fórmula que la evaluada invoca por su código, cifrada como está
 * guardada. El motor la descifra, y su texto no sale de aquí.
 */
export interface DependencyDto {
  encryptedFunction: string;
  /** En el orden en que se le pasan los argumentos: es contrato. */
  variables: string[];
  constants?: Record<string, number>;
}

export class ExecuteFunctionDto {
  @IsNotEmpty()
  @IsString()
  encryptedFunction: string;

  @IsNotEmpty()
  parameters: Record<string, number>;

  @IsOptional()
  constants: Record<string, number>;

  /**
   * El cierre de fórmulas que la evaluada invoca, directa o indirectamente,
   * por código. Opcional: sin él, el comportamiento es el de siempre.
   */
  @IsOptional()
  @IsObject()
  dependencies?: Record<string, DependencyDto>;
}
