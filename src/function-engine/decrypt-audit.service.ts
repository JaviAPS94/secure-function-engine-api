/**
 * Auditoría de los accesos al texto plano.
 *
 * El descifrado convierte el activo protegido en algo legible. Que sea
 * posible es una decisión deliberada — sin ella no se puede editar una
 * fórmula — pero tiene que dejar rastro.
 *
 * Lo que se registra es que *ocurrió* un acceso, nunca *qué* se accedió: ni
 * la expresión, ni el texto cifrado, ni la clave. Un registro que incluyera
 * la expresión anularía el cifrado, porque los registros suelen viajar a
 * sitios con menos control que la base de datos.
 */

import { Injectable, Logger } from '@nestjs/common';

export type DecryptOutcome = 'atendido' | 'rechazado' | 'fallido';

@Injectable()
export class DecryptAuditService {
  private readonly logger = new Logger('DescifradoAuditoría');

  record(
    outcome: DecryptOutcome,
    correlationId: string,
    reason?: string,
  ): void {
    const entry = {
      evento: 'descifrado',
      resultado: outcome,
      correlacion: correlationId,
      momento: new Date().toISOString(),
      ...(reason !== undefined ? { motivo: reason } : {}),
    };

    if (outcome === 'atendido') this.logger.log(JSON.stringify(entry));
    else this.logger.warn(JSON.stringify(entry));
  }
}
