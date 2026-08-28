/**
 * Carga y verificación de la clave de cifrado.
 *
 * Antes, la clave se leía en el constructor del servicio con `process.env
 * .ENCRYPTION_KEY!`: la afirmación del `!` no comprueba nada, así que un
 * despliegue sin clave, o con una clave de largo equivocado, arrancaba bien y
 * fallaba en la primera petición de cifrado. Peor aún, fallaba con un error
 * de criptografía que no dice qué está mal configurado.
 *
 * `aes-256-cbc` exige exactamente 32 bytes. Se comprueba al arrancar y, si no
 * se cumple, el proceso no arranca.
 */

export const ENCRYPTION_KEY_ENV = 'ENCRYPTION_KEY';

/** Longitud exacta en bytes que exige aes-256-cbc. */
export const ENCRYPTION_KEY_BYTES = 32;

export class EncryptionKeyError extends Error {}

/**
 * Devuelve la clave de cifrado ya verificada.
 *
 * @throws EncryptionKeyError si falta o no mide 32 bytes.
 */
export const loadEncryptionKey = (
  env: NodeJS.ProcessEnv = process.env,
): Buffer => {
  const raw = env[ENCRYPTION_KEY_ENV];

  if (raw === undefined || raw === '') {
    throw new EncryptionKeyError(
      `Falta la variable de entorno ${ENCRYPTION_KEY_ENV}. ` +
        `aes-256-cbc necesita una clave de ${ENCRYPTION_KEY_BYTES} bytes.`,
    );
  }

  const key = Buffer.from(raw, 'utf8');

  if (key.length !== ENCRYPTION_KEY_BYTES) {
    throw new EncryptionKeyError(
      `${ENCRYPTION_KEY_ENV} debe medir exactamente ${ENCRYPTION_KEY_BYTES} bytes ` +
        `y mide ${key.length}. Las fórmulas ya cifradas dependen de esta clave: ` +
        `cambiarla las vuelve ilegibles.`,
    );
  }

  return key;
};
