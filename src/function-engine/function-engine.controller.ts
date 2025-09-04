import { Controller, Post, Body } from '@nestjs/common';
import { FunctionEngineService } from './function-engine.service';
// import { ExecuteFunctionDto } from './dto/execute-function.dto';
import { EncryptFunctionDto } from './dto/encrypt-function.dto';
import { ExecuteFunctionDto } from './dto/execute-function.dto';

@Controller('function-engine')
export class FunctionEngineController {
  constructor(private readonly functionEngineService: FunctionEngineService) {}

  @Post('evaluate-function')
  evaluateFunction(@Body() executeFunctionDto: ExecuteFunctionDto) {
    return this.functionEngineService.evaluateFunction(
      executeFunctionDto.encryptedFunction,
      executeFunctionDto.parameters,
      executeFunctionDto.constants,
    );
  }

  @Post('encrypt')
  encryptFunction(@Body() encryptFunctionDto: EncryptFunctionDto) {
    return this.functionEngineService.encryptFunction(
      encryptFunctionDto.plainTextFunction,
    );
  }
}
