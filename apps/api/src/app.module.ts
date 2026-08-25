import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';

import { ENV, type Env } from './config/env';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { StudentsModule } from './modules/students/students.module';
import { AuditInterceptor } from './shared/audit/audit.interceptor';
import { AuthGuard } from './shared/auth/auth.guard';
import { AllExceptionsFilter } from './shared/errors/all-exceptions.filter';
import { RbacGuard } from './shared/rbac/rbac.guard';
import { SharedModule } from './shared/shared.module';
import { TenantGuard } from './shared/tenancy/tenant.guard';

/**
 * The guard order below is not arbitrary and must not be reordered:
 *
 *   AuthGuard   — is this request authenticated at all?
 *   TenantGuard — does the token's tenant agree with the request host?
 *   RbacGuard   — does this role hold the required capability?
 *
 * RBAC reads roles from CLS, which TenantGuard populates. Authentication must
 * precede tenancy so that "valid token, wrong school" is a distinct failure
 * from "no token at all". NestJS applies APP_GUARD providers in registration
 * order, so this list is the chain.
 */
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      // AsyncLocalStorage is established per request, which is what makes
      // tenant scope ambient rather than a parameter (docs/12 R2).
      middleware: { mount: true },
    }),
    SharedModule,
    AuthModule,
    HealthModule,
    StudentsModule,
  ],
  providers: [
    // Registered here rather than only in main.ts, so the same error contract
    // applies in tests and in any other host that builds this module.
    {
      provide: APP_FILTER,
      useFactory: (env: Env) => new AllExceptionsFilter(env.API_URL),
      inject: [ENV],
    },

    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RbacGuard },

    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
