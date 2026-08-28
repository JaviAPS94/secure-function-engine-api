import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { EncryptionKeyError, loadEncryptionKey } from './config/encryption-key';

dotenv.config();

async function bootstrap() {
  // La clave se verifica antes de construir la aplicación. El servicio
  // también la verifica al inyectarse, pero si se dejara solo ahí, el fallo
  // llegaría envuelto en un error de inyección de dependencias de Nest y
  // costaría entender que lo que falta es una variable de entorno.
  loadEncryptionKey();

  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend applications
  app.enableCors();

  // Apply global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on port: ${process.env.PORT || 3000}`);
}

/**
 * Sin este manejo, un fallo de arranque queda como rechazo no atendido y el
 * proceso se queda colgado en vez de terminar: un despliegue mal configurado
 * parecería estar vivo sin poder atender nada.
 */
bootstrap().catch((error: unknown) => {
  if (error instanceof EncryptionKeyError) {
    new Logger('Bootstrap').error(error.message);
  } else {
    new Logger('Bootstrap').error(
      'No se pudo iniciar el servicio',
      error instanceof Error ? error.stack : String(error),
    );
  }
  process.exit(1);
});
