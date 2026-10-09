import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { FunctionEngineService } from './function-engine.service';
import {
  ENCRYPTION_KEY_ENV,
  loadEncryptionKey,
  EncryptionKeyError,
} from '../config/encryption-key';

/** 32 bytes exactos, como exige aes-256-cbc. */
const TEST_KEY = '01234567890123456789012345678901';

describe('loadEncryptionKey', () => {
  it('acepta una clave de 32 bytes', () => {
    expect(loadEncryptionKey({ [ENCRYPTION_KEY_ENV]: TEST_KEY })).toHaveLength(
      32,
    );
  });

  it('rechaza la ausencia de la clave nombrando la variable', () => {
    expect(() => loadEncryptionKey({})).toThrow(EncryptionKeyError);
    expect(() => loadEncryptionKey({})).toThrow(/ENCRYPTION_KEY/);
  });

  it('rechaza una clave de largo equivocado indicando ambas longitudes', () => {
    expect(() => loadEncryptionKey({ [ENCRYPTION_KEY_ENV]: 'corta' })).toThrow(
      /32 bytes y mide 5/,
    );
  });
});

describe('FunctionEngineService', () => {
  let service: FunctionEngineService;

  beforeEach(() => {
    process.env[ENCRYPTION_KEY_ENV] = TEST_KEY;
    service = new FunctionEngineService();
  });

  describe('sustitución de constantes', () => {
    // Estos cuatro casos son el defecto que motivó la reescritura. El
    // servicio sustituía las constantes con un `replace` sobre el texto de
    // la expresión, así que ninguno de ellos daba error: daban un número
    // equivocado, en silencio.

    it('no deja que una constante corrompa a otra cuyo nombre la contiene', () => {
      const { encrypted } = service.encryptFunction('y = CONST_10 + CONST_1');

      // Con el reemplazo por subcadena, CONST_10 se volvía "40" (el valor de
      // CONST_1 seguido del 0), y el resultado era 44 en vez de 13.
      expect(
        service.evaluateFunction(encrypted, {}, { CONST_1: 4, CONST_10: 9 }),
      ).toEqual({
        result: 13,
      });
    });

    it('no deja que una constante destruya el nombre de una función', () => {
      const { encrypted } = service.encryptFunction('y = cos(x) + c');

      // Con el reemplazo por subcadena, `cos(x)` se volvía `2os(x)`.
      expect(service.evaluateFunction(encrypted, { x: 0 }, { c: 2 })).toEqual({
        result: 3,
      });
    });

    it('ignora una constante que la expresión no usa', () => {
      const { encrypted } = service.encryptFunction('y = x^2');

      expect(
        service.evaluateFunction(encrypted, { x: 3 }, { NO_USADA: 99 }),
      ).toEqual({
        result: 9,
      });
    });

    it('rechaza una constante que no es un número finito', () => {
      const { encrypted } = service.encryptFunction('y = x + K');

      expect(() =>
        service.evaluateFunction(
          encrypted,
          { x: 1 },
          { K: Number.POSITIVE_INFINITY },
        ),
      ).toThrow(/constante K debe ser un número finito/);

      expect(() =>
        service.evaluateFunction(
          encrypted,
          { x: 1 },
          { K: 'diez' as unknown as number },
        ),
      ).toThrow(BadRequestException);
    });

    it('la constante gana sobre la variable con el mismo nombre', () => {
      // Es el comportamiento anterior: la constante se horneaba en el texto
      // antes de evaluar con las variables.
      const { encrypted } = service.encryptFunction('y = a * 2');

      expect(service.evaluateFunction(encrypted, { a: 1 }, { a: 5 })).toEqual({
        result: 10,
      });
    });
  });

  describe('validación', () => {
    it('acepta una fórmula válida y declara sus símbolos', () => {
      const result = service.validateFunction('y = x^2 + CONST_1');

      expect(result.valid).toBe(true);
      expect(result.symbols?.sort()).toEqual(['CONST_1', 'x']);
    });

    it('no exige declarar las funciones matemáticas ni las constantes de mathjs', () => {
      const result = service.validateFunction('y = cos(x) * pi');

      expect(result.symbols).toEqual(['x']);
      expect(result.functions).toEqual(['cos']);
    });

    it('rechaza una sintaxis inválida señalando el problema', () => {
      const result = service.validateFunction('y = x^^2');

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Sintaxis matemática inválida/);
    });

    it('rechaza una ecuación que no empieza con "y ="', () => {
      const result = service.validateFunction('V = I * R');

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/debe empezar con "y ="/);
    });

    it('rechaza una ecuación sin signo igual', () => {
      expect(service.validateFunction('x^2').valid).toBe(false);
    });

    it('rechaza las funciones que se salen de la aritmética', () => {
      const result = service.validateFunction('y = import("http://ajeno")');

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/no está permitida/);
    });

    it('no altera nada al validar', () => {
      const expression = 'y = x^2';
      service.validateFunction(expression);

      expect(expression).toBe('y = x^2');
    });
  });

  describe('cifrado y descifrado', () => {
    it('descifra lo que cifró', () => {
      const { encrypted } = service.encryptFunction('y = x^3 + 2*x');

      expect(service.decryptFunction(encrypted)).toEqual({
        plainTextFunction: 'y = x^3 + 2*x',
      });
    });

    it('produce un texto cifrado distinto cada vez para la misma fórmula', () => {
      const a = service.encryptFunction('y = x^2').encrypted;
      const b = service.encryptFunction('y = x^2').encrypted;

      // El vector de inicialización es aleatorio: dos cifrados iguales
      // revelarían que dos fórmulas son la misma.
      expect(a).not.toEqual(b);
      expect(service.decryptFunction(a)).toEqual(service.decryptFunction(b));
    });

    it('rechaza el cifrado de una fórmula inválida', () => {
      expect(() => service.encryptFunction('y = x^^2')).toThrow(
        BadRequestException,
      );
    });

    it('rechaza un texto cifrado ajeno sin detallar la criptografía', () => {
      expect(() => service.decryptFunction('no-es-un-texto-cifrado')).toThrow(
        /formato esperado/,
      );

      expect(() => service.decryptFunction('aabb:ccdd')).toThrow(
        /No se pudo descifrar/,
      );
    });
  });

  describe('compatibilidad con lo ya cifrado', () => {
    it('evalúa una expresión cifrada por la versión anterior del servicio', () => {
      // Reproduce el formato exacto que hay hoy en la base de datos:
      // `iv:ciphertext` en hexadecimal, con la clave como cadena utf8. Si
      // esto se rompiera, las 6 fórmulas en producción quedarían ilegibles.
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        'aes-256-cbc',
        Buffer.from(TEST_KEY),
        iv,
      );
      const encrypted = Buffer.concat([
        cipher.update('y = x^2 + CONST_1'),
        cipher.final(),
      ]);
      const legacy = iv.toString('hex') + ':' + encrypted.toString('hex');

      expect(
        service.evaluateFunction(legacy, { x: 3 }, { CONST_1: 7 }),
      ).toEqual({
        result: 16,
      });
    });
  });

  describe('evaluación', () => {
    it('evalúa con variables y constantes', () => {
      const { encrypted } = service.encryptFunction('y = x^3 + b');

      expect(service.evaluateFunction(encrypted, { x: 2, b: 5 })).toEqual({
        result: 13,
      });
    });

    it('rechaza un resultado que no es un número finito', () => {
      const { encrypted } = service.encryptFunction('y = x / 0');

      expect(() => service.evaluateFunction(encrypted, { x: 1 })).toThrow(
        /número finito/,
      );
    });

    it('falla con un mensaje claro si falta una variable', () => {
      const { encrypted } = service.encryptFunction('y = x + z');

      expect(() => service.evaluateFunction(encrypted, { x: 1 })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('fórmulas que invocan a otras', () => {
    const dependencia = (plain: string, variables: string[], constants = {}) => ({
      encryptedFunction: service.encryptFunction(plain).encrypted,
      variables,
      constants,
    });

    it('evalúa una fórmula que invoca a otra', () => {
      const { encrypted } = service.encryptFunction('y = QUADRATIC(x) * 2');
      const dependencies = {
        QUADRATIC: dependencia('y = x^2 + 2*x + 1', ['x']),
      };

      expect(
        service.evaluateFunction(encrypted, { x: 3 }, {}, dependencies),
      ).toEqual({ result: 32 });
    });

    it('resuelve una dependencia que a su vez depende de otra', () => {
      const { encrypted } = service.encryptFunction('y = A(x) + 1');
      const dependencies = {
        A: dependencia('y = B(x) * 2', ['x']),
        B: dependencia('y = C(x) + 3', ['x']),
        C: dependencia('y = x * k', ['x'], { k: 10 }),
      };

      // C(2) = 20, B = 23, A = 46, y = 47
      expect(
        service.evaluateFunction(encrypted, { x: 2 }, {}, dependencies),
      ).toEqual({ result: 47 });
    });

    it('asigna los argumentos a las variables en su orden declarado', () => {
      const { encrypted } = service.encryptFunction('y = RESTA(10, 4)');
      const dependencies = { RESTA: dependencia('y = a - b', ['a', 'b']) };

      expect(
        service.evaluateFunction(encrypted, {}, {}, dependencies),
      ).toEqual({ result: 6 });
    });

    it('las constantes de una dependencia no se mezclan con las de quien la invoca', () => {
      const { encrypted } = service.encryptFunction('y = F(x) + k');
      const dependencies = { F: dependencia('y = x * k', ['x'], { k: 100 }) };

      expect(
        service.evaluateFunction(encrypted, { x: 1 }, { k: 1 }, dependencies),
      ).toEqual({ result: 101 });
    });

    it('sin la dependencia, falla como hasta ahora nombrando la función', () => {
      const { encrypted } = service.encryptFunction('y = QUADRATIC(x) * 2');

      expect(() => service.evaluateFunction(encrypted, { x: 3 })).toThrow(
        /QUADRATIC/,
      );
    });

    it('rechaza un ciclo sin evaluar, mostrando la cadena', () => {
      const { encrypted } = service.encryptFunction('y = A(x)');
      const dependencies = {
        A: dependencia('y = B(x)', ['x']),
        B: dependencia('y = A(x)', ['x']),
      };

      expect(() =>
        service.evaluateFunction(encrypted, { x: 1 }, {}, dependencies),
      ).toThrow(/circular.*A → B → A/);
    });

    it('rechaza un anidamiento de más de 5 niveles', () => {
      const { encrypted } = service.encryptFunction('y = F1(x)');
      const dependencies: Record<string, ReturnType<typeof dependencia>> = {};
      for (let level = 1; level <= 6; level++) {
        dependencies[`F${level}`] = dependencia(
          level === 6 ? 'y = x' : `y = F${level + 1}(x)`,
          ['x'],
        );
      }

      expect(() =>
        service.evaluateFunction(encrypted, { x: 1 }, {}, dependencies),
      ).toThrow(/más de 5 niveles/);
    });

    it('admite exactamente 5 niveles', () => {
      const { encrypted } = service.encryptFunction('y = F1(x)');
      const dependencies: Record<string, ReturnType<typeof dependencia>> = {};
      for (let level = 1; level <= 5; level++) {
        dependencies[`F${level}`] = dependencia(
          level === 5 ? 'y = x + 1' : `y = F${level + 1}(x)`,
          ['x'],
        );
      }

      expect(
        service.evaluateFunction(encrypted, { x: 1 }, {}, dependencies),
      ).toEqual({ result: 2 });
    });

    it('una aridad equivocada nombra a la dependencia', () => {
      const { encrypted } = service.encryptFunction('y = F(x, 2)');
      const dependencies = { F: dependencia('y = x', ['x']) };

      expect(() =>
        service.evaluateFunction(encrypted, { x: 1 }, {}, dependencies),
      ).toThrow(/F espera 1 argumento/);
    });

    it('sin dependencias el resultado es idéntico al de siempre', () => {
      const { encrypted } = service.encryptFunction('y = x^3 + b');

      expect(service.evaluateFunction(encrypted, { x: 2, b: 5 }, {}, {})).toEqual(
        service.evaluateFunction(encrypted, { x: 2, b: 5 }),
      );
    });
  });

  describe('fórmulas invocadas', () => {
    it('validar devuelve las fórmulas invocadas, sin las funciones de mathjs', () => {
      const result = service.validateFunction(
        'y = QUADRATIC(x) + sqrt(CUBIC(x))',
      );

      expect(result.formulas?.sort()).toEqual(['CUBIC', 'QUADRATIC']);
      expect(result.formulaCalls).toEqual([
        { name: 'QUADRATIC', argCount: 1 },
        { name: 'CUBIC', argCount: 1 },
      ]);
      expect(result.functions).toContain('sqrt');
      expect(result.symbols).toEqual(['x']);
    });

    it('sin invocaciones la lista está vacía', () => {
      expect(service.validateFunction('y = x^2 + 1').formulas).toEqual([]);
    });

    it('de una expresión cifrada, sin devolver su texto', () => {
      const { encrypted } = service.encryptFunction('y = QUADRATIC(x) * 2');
      const result = service.invokedFormulas(encrypted);

      expect(result).toEqual({
        formulas: ['QUADRATIC'],
        formulaCalls: [{ name: 'QUADRATIC', argCount: 1 }],
      });
      expect(JSON.stringify(result)).not.toContain('* 2');
    });
  });
});
