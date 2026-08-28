import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import {
  ServiceSecretGuard,
  SERVICE_SECRET_ENV,
  SERVICE_SECRET_HEADER,
  CORRELATION_ID_HEADER,
  correlationIdOf,
} from './service-secret.guard';
import { DecryptAuditService } from '../decrypt-audit.service';

const contextWith = (headers: Record<string, string>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('ServiceSecretGuard', () => {
  let audit: DecryptAuditService;
  let record: jest.SpyInstance;
  let guard: ServiceSecretGuard;
  const originalSecret = process.env[SERVICE_SECRET_ENV];

  beforeEach(() => {
    audit = new DecryptAuditService();
    record = jest.spyOn(audit, 'record').mockImplementation(() => undefined);
    guard = new ServiceSecretGuard(audit);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env[SERVICE_SECRET_ENV];
    else process.env[SERVICE_SECRET_ENV] = originalSecret;
  });

  it('admite la petición cuando el secreto coincide', () => {
    process.env[SERVICE_SECRET_ENV] = 'secreto-de-prueba';

    expect(
      guard.canActivate(
        contextWith({ [SERVICE_SECRET_HEADER]: 'secreto-de-prueba' }),
      ),
    ).toBe(true);
  });

  it('rechaza la petición sin secreto y la audita', () => {
    process.env[SERVICE_SECRET_ENV] = 'secreto-de-prueba';

    expect(() => guard.canActivate(contextWith({}))).toThrow(
      UnauthorizedException,
    );
    expect(record).toHaveBeenCalledWith(
      'rechazado',
      expect.any(String),
      'sin secreto',
    );
  });

  it('rechaza un secreto incorrecto y lo audita', () => {
    process.env[SERVICE_SECRET_ENV] = 'secreto-de-prueba';

    expect(() =>
      guard.canActivate(contextWith({ [SERVICE_SECRET_HEADER]: 'otro' })),
    ).toThrow(UnauthorizedException);
    expect(record).toHaveBeenCalledWith(
      'rechazado',
      expect.any(String),
      'secreto incorrecto',
    );
  });

  it('rechaza un secreto que es prefijo del correcto', () => {
    // La comparación es sobre resúmenes de largo fijo, así que un acierto
    // parcial no se distingue de un fallo total, ni por resultado ni por
    // duración.
    process.env[SERVICE_SECRET_ENV] = 'secreto-de-prueba';

    expect(() =>
      guard.canActivate(
        contextWith({ [SERVICE_SECRET_HEADER]: 'secreto-de-prueb' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('deja pasar mientras el secreto no esté configurado', () => {
    // Ventana de transición: el SFE se despliega antes que project-back.
    delete process.env[SERVICE_SECRET_ENV];

    expect(guard.canActivate(contextWith({}))).toBe(true);
  });
});

describe('correlationIdOf', () => {
  it('toma el identificador que envía el llamante', () => {
    const request = { headers: { [CORRELATION_ID_HEADER]: 'abc-123' } };
    expect(correlationIdOf(request as never)).toBe('abc-123');
  });

  it('usa un marcador cuando no viene', () => {
    expect(correlationIdOf({ headers: {} } as never)).toBe('sin-correlación');
  });
});
