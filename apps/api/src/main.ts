import 'reflect-metadata';
// Loads .env before anything reads process.env. Production supplies real
// environment variables and this is a no-op there.
import 'dotenv/config';

import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { ENV, loadEnv, type Env } from './config/env';
import { AllExceptionsFilter } from './shared/errors/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  // Validated before anything else starts. docs/03 section 8: the process
  // refuses to start on an invalid environment, because a server that boots
  // misconfigured does damage before anyone notices.
  const env = loadEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Fastify generates a request id per request; every log line and every
      // problem+json response carries it, so a school can quote one id and the
      // whole request is findable in a single search.
      genReqId: () => crypto.randomUUID(),
      trustProxy: true,
    }),
    { bufferLogs: true },
  );

  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, {
    // The API serves JSON, never HTML, so a script-src policy is meaningless
    // here; the strict CSP belongs on the two Next apps (docs/04 section 7).
    contentSecurityPolicy: false,
  });

  app.useGlobalFilters(new AllExceptionsFilter(env.API_URL));

  app.enableShutdownHooks();

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on ${env.API_URL} (${env.NODE_ENV})`);
}

void bootstrap().catch((error: unknown) => {
  // Nest's logger may not exist yet if the failure was in env validation.
  console.error('Failed to start API:', error);
  process.exit(1);
});

export type { Env };
export { ENV };
