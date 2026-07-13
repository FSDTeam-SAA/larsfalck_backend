import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppLogger } from './common/logger/app-logger.service';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody:    true,
    bodyParser: false,   // ← disable default body parser so we control it
  });

  // ─── Body size limits ──────────────────────────────────────────────────
  // Must be set BEFORE any middleware — covers JSON + raw body for Stripe webhook
  //
  // NOTE: bodyParser is disabled above (bodyParser: false), so Nest's automatic
  // req.rawBody population does NOT happen. We must attach it ourselves via the
  // `verify` callback — otherwise req.rawBody stays undefined and Stripe's
  // constructEvent() will ALWAYS throw a signature-verification error (400).
  const rawBodySaver = (req: any, _res: any, buf: Buffer) => {
    if (buf?.length) {
      req.rawBody = buf;
    }
  };

  app.use(bodyParser.json({ limit: '50mb', verify: rawBodySaver }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, verify: rawBodySaver }));

  const configService = app.get(ConfigService);
  const logger = app.get(AppLogger);
  logger.setContext('Bootstrap');
  app.useLogger(logger);

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: [
      configService.get<string>('app.frontendUrl'),
      configService.get<string>('app.adminUrl'),
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:              true,
      forbidNonWhitelisted:   false,
      transform:              true,
      transformOptions:       { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter(configService));
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = configService.get<number>('app.port', 5000);
  await app.listen(port);
  logger.log(`Server running → http://localhost:${port}/api/v1`);
}

bootstrap();