import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FunctionEngineModule } from './function-engine/function-engine.module';

@Module({
  imports: [FunctionEngineModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
