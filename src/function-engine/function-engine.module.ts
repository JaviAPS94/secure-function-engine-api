import { Module } from '@nestjs/common';
import { FunctionEngineService } from './function-engine.service';
import { FunctionEngineController } from './function-engine.controller';

@Module({
  imports: [],
  providers: [FunctionEngineService],
  controllers: [FunctionEngineController],
  exports: [FunctionEngineService],
})
export class FunctionEngineModule {}
