import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';

import { HealthModule } from './modules/health/health.module';
import { AuditInterceptor } from './shared/audit/audit.interceptor';
import { AuthGuard } from './shared/auth/auth.guard';
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
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RbacGuard },

    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
