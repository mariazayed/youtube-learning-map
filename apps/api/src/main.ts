import './instrument';
import 'reflect-metadata';
import { ConsoleLogger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { requestIdMiddleware } from './common/validation/request-id';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
    logger: new ConsoleLogger({ json: true, colors: false }),
  });
  const config = app.get(ConfigService);
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  app.use(requestIdMiddleware);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  app.use(
    json({
      limit: config.get<number>('REQUEST_BODY_LIMIT_BYTES') ?? 16_384,
      strict: true,
      type: 'application/json',
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.enableCors({
    origin: config.getOrThrow<string>('WEB_URL').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    maxAge: 600,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Client-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LearnMap API')
    .setDescription('YouTube learning summary and mind-map API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addApiKey({ type: 'apiKey', name: 'X-Client-Id', in: 'header' }, 'clientId')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
}

void bootstrap();
