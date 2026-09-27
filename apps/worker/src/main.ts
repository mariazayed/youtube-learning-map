import './instrument';
import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
    logger: new ConsoleLogger({ json: true, colors: false }),
  });
  app.enableShutdownHooks();
}

void bootstrap();
