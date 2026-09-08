import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';

import { ENV, type Env } from './config/env';
import { AcademicsModule } from './modules/academics/academics.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { FeesModule } from './modules/fees/fees.module';
import { HealthModule } from './modules/health/health.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PublicModule } from './modules/public/public.module';
import { StaffModule } from './modules/staff/staff.module';
import { StudentsModule } from './modules/students/students.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { AuditInterceptor } from './shared/audit/audit.interceptor';
import { AuthGuard } from './shared/auth/auth.guard';
import { PlatformGuard } from './shared/auth/platform.guard';
import { AllExceptionsFilter } from './shared/errors/all-exceptions.filter';
import { RateLimitGuard } from './shared/http/rate-limit.guard';
import { RbacGuard } from './shared/rbac/rbac.guard';
import { SharedModule } from './shared/shared.module';
import { TenantGuard } from './shared/tenancy/tenant.guard';

/**
 * The guard order below is not arbitrary and must not be reordered:
 *
 *   RateLimitGuard — first, because the endpoints that need it are the ones
 *                   with no session, and a limiter behind AuthGuard would
 *                   protect everything except the public surface.
 *   AuthGuard   — is this request authenticated at all?
 *   TenantGuard — does the token's tenant agree with the request host?
 *   PlatformGuard — for console routes only: a live platform account, and the
 *                   capability it declares. Tenant routes pass straight through.
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
    AcademicsModule,
    AuthModule,
    HealthModule,
    ExpensesModule,
    VouchersModule,
    AttendanceModule,
    FeesModule,
    PlatformModule,
    PublicModule,
    StaffModule,
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

    // Ahead of authentication deliberately: the endpoints that need a limit are
    // the ones with no session to check, so a limiter that ran after AuthGuard
    // would guard everything except the surface it was added for.
    { provide: APP_GUARD, useClass: RateLimitGuard },

    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PlatformGuard },
    { provide: APP_GUARD, useClass: RbacGuard },

    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
