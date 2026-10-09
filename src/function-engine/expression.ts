/**
 * Análisis de una expresión de fórmula: forma canónica, símbolos que usa y
 * funciones que invoca.
 *
 * Aquí vive la corrección del defecto de las constantes. El servicio las
 * sustituía con `rightSide.replace(new RegExp(key, 'g'), value)`, un
 * reemplazo de subcadenas sobre el texto de la expresión. Con `CONST_1 = 4`,
 * la expresión `CONST_10` se convertía en `40`; con una constante llamada
 * `c`, `cos(x)` se convertía en `2os(x)`. Ninguno de los dos casos daba
 * error: daban un número equivocado.
 *
 * La sustitución pasa a hacerse por símbolo: las constantes entran en el
 * ámbito de evaluación junto a las variables, y mathjs resuelve cada nombre
 * completo o no lo resuelve. El texto de la expresión no se toca nunca.
 */

import * as math from 'mathjs';
import { parse, type MathNode } from 'mathjs';

/**
 * Funciones de mathjs que pueden salirse de la aritmética: cargan código,
 * definen unidades o vuelven a evaluar texto. Una expresión de fórmula no
 * las necesita, y admitirlas convertiría el motor en un intérprete de
 * propósito general.
 */
const FORBIDDEN_FUNCTIONS = new Set([
  'import',
  'createUnit',
  'evaluate',
  'parse',
  'simplify',
  'derivative',
  'compile',
  'chain',
  'config',
  'help',
  'resolve',
]);

/** Símbolos que mathjs resuelve por sí mismo y no hay que declarar. */
const BUILT_IN_SYMBOLS = new Set([
  'pi',
  'PI',
  'e',
  'E',
  'tau',
  'phi',
  'Infinity',
  'NaN',
  'null',
  'true',
  'false',
]);

export interface ExpressionAnalysis {
  /** Lado derecho de la ecuación, sin el `y =`. */
  rightSide: string;
  /** Símbolos que la expresión usa y que hay que declarar como variable o constante. */
  symbols: string[];
  /** Funciones matemáticas que invoca. */
  functions: string[];
  /**
   * Las que invoca y mathjs no conoce: son otras fórmulas de diseño, por su
   * código. Es lo que project-back necesita para registrar dependencias sin
   * leer el texto plano.
   */
  formulas: string[];
  /** Cada invocación a otra fórmula con cuántos argumentos recibe, para comprobar la aridad. */
  formulaCalls: { name: string; argCount: number }[];
}

/** Si mathjs resuelve el nombre por sí mismo como función. */
export const isMathFunction = (name: string): boolean =>
  typeof (math as unknown as Record<string, unknown>)[name] === 'function';

export class ExpressionError extends Error {}

/**
 * Comprueba la forma `y = <expresión>` y devuelve el lado derecho.
 *
 * La forma es obligatoria y no es decorativa: el evaluador supone que la
 * incógnita es `y` y que todo lo demás es entrada.
 */
export const requireCanonicalForm = (equation: string): string => {
  const parts = equation.split('=');

  if (parts.length !== 2) {
    throw new ExpressionError(
      'La fórmula debe contener exactamente un signo igual (=)',
    );
  }

  if (parts[0].trim() !== 'y') {
    throw new ExpressionError('La fórmula debe empezar con "y ="');
  }

  const rightSide = parts[1].trim();
  if (rightSide === '') {
    throw new ExpressionError('La fórmula no tiene expresión a la derecha');
  }

  return rightSide;
};

/** Analiza el lado derecho ya extraído, o lanza `ExpressionError`. */
export const parseRightSide = (rightSide: string): MathNode => {
  let node: MathNode;
  try {
    node = parse(rightSide);
  } catch (error) {
    throw new ExpressionError(
      'Sintaxis matemática inválida: ' + (error as Error).message,
    );
  }

  const invoked = collectFunctionNames(node);
  for (const name of invoked) {
    if (FORBIDDEN_FUNCTIONS.has(name)) {
      throw new ExpressionError(`La función "${name}" no está permitida`);
    }
  }

  return node;
};

const collectFunctionNames = (node: MathNode): Set<string> => {
  const functions = new Set<string>();
  node.traverse((child) => {
    if (child.type === 'FunctionNode') {
      const name = (child as unknown as { fn?: { name?: string } }).fn?.name;
      if (name !== undefined) functions.add(name);
    }
  });
  return functions;
};

/**
 * Analiza una ecuación completa (`y = ...`) y devuelve su lado derecho junto
 * con los símbolos y funciones que usa.
 *
 * Los nombres de función se descuentan de los símbolos: mathjs representa
 * `cos(x)` con un nodo de función cuyo `fn` es a su vez un símbolo, y
 * contarlo como tal haría creer que hay que declarar `cos`.
 */
export const analyzeEquation = (equation: string): ExpressionAnalysis => {
  const rightSide = requireCanonicalForm(equation);
  const node = parseRightSide(rightSide);

  const functions = collectFunctionNames(node);
  const symbols = new Set<string>();

  node.traverse((child) => {
    if (child.type !== 'SymbolNode') return;
    const name = (child as unknown as { name: string }).name;
    if (functions.has(name) || BUILT_IN_SYMBOLS.has(name)) return;
    symbols.add(name);
  });

  return {
    rightSide,
    symbols: [...symbols],
    functions: [...functions],
    formulas: [...functions].filter((name) => !isMathFunction(name)),
    formulaCalls: formulaCallsOf(node),
  };
};

const formulaCallsOf = (node: MathNode): { name: string; argCount: number }[] => {
  const calls: { name: string; argCount: number }[] = [];
  node.traverse((child) => {
    if (child.type !== 'FunctionNode') return;
    const call = child as unknown as { fn?: { name?: string }; args?: unknown[] };
    const name = call.fn?.name;
    if (name !== undefined && !isMathFunction(name)) {
      calls.push({ name, argCount: call.args?.length ?? 0 });
    }
  });
  return calls;
};

/** Fórmulas que invoca un lado derecho ya analizado. */
export const invokedFormulas = (node: MathNode): string[] =>
  [...collectFunctionNames(node)].filter((name) => !isMathFunction(name));

/**
 * Cuántos niveles de fórmulas anidadas admite una evaluación.
 *
 * No hay todavía ninguna composición real: el límite existe para que un error
 * de diseño se note enseguida, no para restringir un uso que exista.
 */
export const MAX_NESTING_DEPTH = 5;

/**
 * Comprueba, antes de evaluar nada, que las invocaciones entre fórmulas no
 * formen un ciclo ni superen la profundidad máxima.
 *
 * `edges` va de cada fórmula a las que invoca; `root` es la que se evalúa.
 * Un ciclo que llegara hasta aquí colgaría la evaluación, y el motor no puede
 * fiarse de que quien llama ya lo comprobó.
 */
export const checkInvocationGraph = (
  root: string,
  edges: ReadonlyMap<string, readonly string[]>,
): void => {
  const walk = (name: string, path: string[]): void => {
    if (path.includes(name)) {
      throw new ExpressionError(
        `Referencia circular entre fórmulas: ${[...path, name].join(' → ')}`,
      );
    }
    // La raíz es el nivel 0: la profundidad cuenta las fórmulas anidadas.
    if (path.length > MAX_NESTING_DEPTH) {
      throw new ExpressionError(
        `Las fórmulas se anidan más de ${MAX_NESTING_DEPTH} niveles: ${[...path, name].join(' → ')}`,
      );
    }
    for (const next of edges.get(name) ?? []) walk(next, [...path, name]);
  };
  walk(root, []);
};

/**
 * Construye el ámbito de evaluación a partir de variables y constantes.
 *
 * Las constantes ganan sobre las variables si un nombre está en ambas, que
 * es lo que ocurría antes al sustituirlas dentro del texto.
 */
export const buildScope = (
  variables: Record<string, number>,
  constants: Record<string, number>,
): Record<string, number> => {
  const scope: Record<string, number> = {};

  for (const [name, value] of Object.entries(variables)) {
    scope[name] = requireFiniteNumber(name, value, 'variable');
  }

  for (const [name, value] of Object.entries(constants)) {
    scope[name] = requireFiniteNumber(name, value, 'constante');
  }

  return scope;
};

const requireFiniteNumber = (
  name: string,
  value: unknown,
  kind: 'variable' | 'constante',
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ExpressionError(`La ${kind} ${name} debe ser un número finito`);
  }
  return value;
};
