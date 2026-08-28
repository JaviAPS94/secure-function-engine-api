/**
 * Autenticación servicio-a-servicio para las operaciones privilegiadas.
 *
 * El descifrado es la única operación que devuelve el activo que este
 * servicio existe para proteger. No basta con que no esté documentada: hace
 * falta que solo project-back pueda invocarla.
 *
 * Ventana de transición: mientras `SFE_SERVICE_SECRET` no esté configurada,
 * el guard deja pasar y avisa por registro. Es deliberado y temporal — si
 * este servicio se desplegara exigiendo el secreto antes de que project-back
 * lo envíe, el descifrado respondería 401 y el administrador no podría
 * editar ninguna fórmula. Se cierra en el paso 8.9 del plan.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { DecryptAuditService } from '../decrypt-audit.service';

export const SERVICE_SECRET_ENV = 'SFE_SERVICE_SECRET';
export const SERVICE_SECRET_HEADER = 'x-service-secret';
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Compara en tiempo constante.
 *
 * Se comparan los resúmenes SHA-256 y no los valores: `timingSafeEqual`
 * exige que ambos búferes midan lo mismo, y comprobar la longitud antes
 * filtraría por sí sola el largo del secreto. El resumen es de largo fijo,
 * así que la comparación no revela nada, ni por resultado ni por duración.
 */
const secretsMatch = (received: string, expected: string): boolean =>
  timingSafeEqual(
    createHash('sha256').update(received).digest(),
    createHash('sha256').update(expected).digest(),
  );

/** Identificador de correlación que envía el servicio llamante, si lo envía. */
export const correlationIdOf = (request: Request): string => {
  const value = request.headers[CORRELATION_ID_HEADER];
  return typeof value === 'string' && value !== '' ? value : 'sin-correlación';
};

@Injectable()
export class ServiceSecretGuard implements CanActivate {
  private readonly logger = new Logger(ServiceSecretGuard.name);

  constructor(private readonly audit: DecryptAuditService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = process.env[SERVICE_SECRET_ENV];

    if (expected === undefined || expected === '') {
      this.logger.warn(
        `${SERVICE_SECRET_ENV} no está configurada: las operaciones privilegiadas ` +
          `están abiertas. Configúrala antes de exponer este servicio.`,
      );
      return true;
    }

    const received = request.headers[SERVICE_SECRET_HEADER];

    if (typeof received !== 'string' || !secretsMatch(received, expected)) {
      // El rechazo se audita aquí y no en el controlador: el guard corta la
      // petición antes, y un intento fallido es justo lo que interesa ver.
      this.audit.record(
        'rechazado',
        correlationIdOf(request),
        typeof received === 'string' ? 'secreto incorrecto' : 'sin secreto',
      );
      throw new UnauthorizedException();
    }

    return true;
  }
}
