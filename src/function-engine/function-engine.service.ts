import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { loadEncryptionKey } from '../config/encryption-key';
import {
  analyzeEquation,
  buildScope,
  ExpressionError,
  parseRightSide,
  requireCanonicalForm,
} from './expression';

/** Longitud del vector de inicialización de aes-256-cbc, en bytes. */
const IV_LENGTH = 16;

@Injectable()
export class FunctionEngineService {
  /**
   * La clave se verifica al construir el servicio, que en Nest ocurre
   * durante el arranque: un despliegue mal configurado no llega a atender
   * peticiones.
   */
  private readonly key = loadEncryptionKey();

  decrypt(text: string): string {
    const parts = text.split(':');
    if (parts.length !== 2) {
      throw new BadRequestException(
        'El texto cifrado no tiene el formato esperado',
      );
    }

    try {
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = Buffer.from(parts[1], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
      const decrypted = Buffer.concat([
        decipher.update(encryptedText),
        decipher.final(),
      ]);
      return decrypted.toString();
    } catch {
      // El detalle del fallo criptográfico no sale del servicio: distinguir
      // "relleno inválido" de "IV de largo equivocado" solo le sirve a quien
      // esté probando textos cifrados ajenos.
      throw new BadRequestException('No se pudo descifrar el texto');
    }
  }

  encrypt(plainText: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  /**
   * Valida una fórmula en texto plano y declara los símbolos que usa.
   *
   * No cifra, no almacena y no registra la expresión: alimenta el editor y
   * el probador del administrador, que necesitan saber si una expresión
   * sirve antes de publicarla.
   */
  validateFunction(plainTextFunction: string): {
    valid: boolean;
    error?: string;
    symbols?: string[];
    functions?: string[];
  } {
    try {
      const analysis = analyzeEquation(plainTextFunction);
      return {
        valid: true,
        symbols: analysis.symbols,
        functions: analysis.functions,
      };
    } catch (error) {
      if (error instanceof ExpressionError) {
        return { valid: false, error: error.message };
      }
      throw error;
    }
  }

  encryptFunction(plainTextFunction: string): { encrypted: string } {
    const validation = this.validateFunction(plainTextFunction);
    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    return { encrypted: this.encrypt(plainTextFunction) };
  }

  /** Descifra una expresión para que un administrador pueda editarla. */
  decryptFunction(encryptedFunction: string): { plainTextFunction: string } {
    return { plainTextFunction: this.decrypt(encryptedFunction) };
  }

  evaluateFunction(
    encryptedFunction: string,
    variables: Record<string, number>,
    constants: Record<string, number> = {},
  ): { result: number } {
    const equation = this.decrypt(encryptedFunction);

    try {
      const rightSide = requireCanonicalForm(equation);
      const node = parseRightSide(rightSide);
      const scope = buildScope(variables ?? {}, constants ?? {});

      const result: unknown = node.evaluate(scope);

      if (typeof result !== 'number' || !Number.isFinite(result)) {
        throw new ExpressionError('La evaluación no produjo un número finito');
      }

      return { result };
    } catch (error) {
      if (error instanceof ExpressionError) {
        throw new BadRequestException(error.message);
      }
      // Un fallo de mathjs al evaluar (símbolo sin definir, dominio
      // inválido) se reporta sin exponer la expresión.
      throw new BadRequestException(
        'No se pudo evaluar la fórmula: ' + (error as Error).message,
      );
    }
  }
}
