import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { FunctionEngineService } from './function-engine.service';
import { EncryptFunctionDto } from './dto/encrypt-function.dto';
import { ExecuteFunctionDto } from './dto/execute-function.dto';
import { DecryptFunctionDto } from './dto/decrypt-function.dto';
import { ValidateFunctionDto } from './dto/validate-function.dto';
import { InvokedFormulasDto } from './dto/invoked-formulas.dto';
import {
  correlationIdOf,
  ServiceSecretGuard,
} from './guards/service-secret.guard';
import { DecryptAuditService } from './decrypt-audit.service';

@Controller('function-engine')
export class FunctionEngineController {
  constructor(
    private readonly functionEngineService: FunctionEngineService,
    private readonly decryptAudit: DecryptAuditService,
  ) {}

  @Post('evaluate-function')
  evaluateFunction(@Body() executeFunctionDto: ExecuteFunctionDto) {
    return this.functionEngineService.evaluateFunction(
      executeFunctionDto.encryptedFunction,
      executeFunctionDto.parameters,
      executeFunctionDto.constants,
      executeFunctionDto.dependencies,
    );
  }

  /**
   * Qué fórmulas invoca una expresión cifrada. No devuelve su texto, pero sí
   * algo de su estructura, así que exige el secreto servicio-a-servicio.
   */
  @Post('invoked-formulas')
  @UseGuards(ServiceSecretGuard)
  invokedFormulas(@Body() dto: InvokedFormulasDto) {
    return this.functionEngineService.invokedFormulas(dto.encryptedFunction);
  }

  @Post('encrypt')
  encryptFunction(@Body() encryptFunctionDto: EncryptFunctionDto) {
    return this.functionEngineService.encryptFunction(
      encryptFunctionDto.plainTextFunction,
    );
  }

  /**
   * Valida una expresión sin cifrarla ni guardarla, y declara los símbolos
   * que usa. Alimenta el editor y el probador del administrador.
   */
  @Post('validate')
  validateFunction(@Body() validateFunctionDto: ValidateFunctionDto) {
    return this.functionEngineService.validateFunction(
      validateFunctionDto.plainTextFunction,
    );
  }

  /**
   * Devuelve una expresión en texto plano para que un administrador pueda
   * editarla.
   *
   * Es la única operación que expone el activo protegido: exige el secreto
   * servicio-a-servicio y queda auditada, se atienda o se rechace.
   */
  @Post('decrypt')
  @UseGuards(ServiceSecretGuard)
  decryptFunction(
    @Body() decryptFunctionDto: DecryptFunctionDto,
    @Req() request: Request,
  ) {
    const correlationId = correlationIdOf(request);

    try {
      const result = this.functionEngineService.decryptFunction(
        decryptFunctionDto.encryptedFunction,
      );
      this.decryptAudit.record('atendido', correlationId);
      return result;
    } catch (error) {
      this.decryptAudit.record(
        'fallido',
        correlationId,
        'texto cifrado inválido',
      );
      throw error;
    }
  }
}
