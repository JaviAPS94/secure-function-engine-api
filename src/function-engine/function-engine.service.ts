import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { loadEncryptionKey } from '../config/encryption-key';
import type { MathNode } from 'mathjs';
import {
  analyzeEquation,
  buildScope,
  checkInvocationGraph,
  ExpressionError,
  invokedFormulas,
  parseRightSide,
  requireCanonicalForm,
} from './expression';
import type { DependencyDto } from './dto/execute-function.dto';

/** Una dependencia ya descifrada y analizada, lista para invocarse. */
interface CompiledDependency {
  node: MathNode;
  variables: string[];
  constants: Record<string, number>;
  invokes: string[];
}

/** Nombre con el que se identifica a la fórmula evaluada en los mensajes. */
const ROOT = 'la fórmula';

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
    formulas?: string[];
    formulaCalls?: { name: string; argCount: number }[];
  } {
    try {
      const analysis = analyzeEquation(plainTextFunction);
      return {
        valid: true,
        symbols: analysis.symbols,
        functions: analysis.functions,
        formulas: analysis.formulas,
        formulaCalls: analysis.formulaCalls,
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

  /**
   * Qué fórmulas invoca una expresión cifrada, sin devolver su texto.
   *
   * Sirve para que project-back sepa de qué depende una versión ya guardada
   * sin tener que pedir el texto plano, que es acceso auditado.
   */
  invokedFormulas(encryptedFunction: string): {
    formulas: string[];
    formulaCalls: { name: string; argCount: number }[];
  } {
    const equation = this.decrypt(encryptedFunction);
    try {
      const analysis = analyzeEquation(equation);
      return { formulas: analysis.formulas, formulaCalls: analysis.formulaCalls };
    } catch (error) {
      if (error instanceof ExpressionError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Descifra y analiza las dependencias, y comprueba que no formen un ciclo
   * ni superen la profundidad máxima antes de evaluar nada.
   */
  private compileDependencies(
    rootNode: MathNode,
    dependencies: Record<string, DependencyDto>,
  ): Map<string, CompiledDependency> {
    const compiled = new Map<string, CompiledDependency>();

    for (const [code, dependency] of Object.entries(dependencies)) {
      if (
        typeof dependency?.encryptedFunction !== 'string' ||
        !Array.isArray(dependency.variables)
      ) {
        throw new ExpressionError(
          `La dependencia ${code} debe traer su expresión cifrada y sus variables`,
        );
      }
      const node = parseRightSide(
        requireCanonicalForm(this.decrypt(dependency.encryptedFunction)),
      );
      compiled.set(code, {
        node,
        variables: dependency.variables,
        constants: dependency.constants ?? {},
        invokes: invokedFormulas(node),
      });
    }

    const edges = new Map<string, readonly string[]>([
      [ROOT, invokedFormulas(rootNode)],
    ]);
    for (const [code, dependency] of compiled) edges.set(code, dependency.invokes);
    checkInvocationGraph(ROOT, edges);

    return compiled;
  }

  /**
   * Las dependencias como funciones del ámbito de mathjs.
   *
   * Cada una recibe sus argumentos en el orden de sus variables, aplica sus
   * propias constantes y ve a su vez a las demás, para que puedan anidarse.
   */
  private dependencyScope(
    compiled: Map<string, CompiledDependency>,
  ): Record<string, (...args: unknown[]) => number> {
    const functions: Record<string, (...args: unknown[]) => number> = {};

    for (const [code, dependency] of compiled) {
      functions[code] = (...args: unknown[]) => {
        if (args.length !== dependency.variables.length) {
          throw new ExpressionError(
            `${code} espera ${dependency.variables.length} argumento(s) y recibió ${args.length}`,
          );
        }
        const values = Object.fromEntries(
          dependency.variables.map((name, index) => [name, args[index] as number]),
        );
        const result: unknown = dependency.node.evaluate({
          ...functions,
          ...buildScope(values, dependency.constants),
        });
        if (typeof result !== 'number' || !Number.isFinite(result)) {
          throw new ExpressionError(`${code} no produjo un número finito`);
        }
        return result;
      };
    }

    return functions;
  }

  evaluateFunction(
    encryptedFunction: string,
    variables: Record<string, number>,
    constants: Record<string, number> = {},
    dependencies: Record<string, DependencyDto> = {},
  ): { result: number } {
    const equation = this.decrypt(encryptedFunction);

    try {
      const rightSide = requireCanonicalForm(equation);
      const node = parseRightSide(rightSide);
      const scope = buildScope(variables ?? {}, constants ?? {});
      const functions = this.dependencyScope(
        this.compileDependencies(node, dependencies ?? {}),
      );

      const result: unknown = node.evaluate({ ...functions, ...scope });

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
