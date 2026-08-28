import { Module } from '@nestjs/common';
import { FunctionEngineService } from './function-engine.service';
import { FunctionEngineController } from './function-engine.controller';
import { DecryptAuditService } from './decrypt-audit.service';
import { ServiceSecretGuard } from './guards/service-secret.guard';

@Module({
  controllers: [FunctionEngineController],
  providers: [FunctionEngineService, DecryptAuditService, ServiceSecretGuard],
  exports: [FunctionEngineService],
})
export class FunctionEngineModule {}
