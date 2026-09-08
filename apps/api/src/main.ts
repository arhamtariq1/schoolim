import 'reflect-metadata';

import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { loadEnv as loadDotenvFromWorkspaceRoot } from '@ilm/db';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { ENV, loadEnv, type Env } from './config/env';
import { setupOpenApi } from './openapi';

async function bootstrap(): Promise<void> {
  // Reads the workspace-root `.env`, not `apps/api/.env`. Production supplies
  // real environment variables and this finds nothing to load.
  loadDotenvFromWorkspaceRoot();

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

  app.enableShutdownHooks();

  // Registered before `listen`, and only where it belongs — see `openapi.ts`
  // for why this is off in production unless somebody explicitly asks for it.
  const docsPath = setupOpenApi(app, env.NODE_ENV === 'production');

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on ${env.API_URL} (${env.NODE_ENV})`);
  if (docsPath !== null) {
    logger.log(`API docs at ${env.API_URL}${docsPath}`);
  }
}

void bootstrap().catch((error: unknown) => {
  // Nest's logger may not exist yet if the failure was in env validation.
  console.error('Failed to start API:', error);
  process.exit(1);
});

export type { Env };
export { ENV };
