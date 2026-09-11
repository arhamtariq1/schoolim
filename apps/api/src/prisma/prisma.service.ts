import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { ENV, type Env } from '../config/env';
import { TenantContextService } from '../shared/tenancy/tenant-context.service';

import {
  createAdminClient,
  createApplicationClient,
  runInTenant,
  runInTenantUnscoped,
  type PrismaClient,
  type TenantTransactionOptions,
  type TransactionClient,
} from './index';

/**
 * The only thing in the API that holds a database connection.
 *
 * Two clients, and the distinction between them is the security model
 * (see `./client`):
 *
 * - `tenant(fn)` runs work as the `NOBYPASSRLS` role, inside a transaction
 *   bound to the tenant in request context. Everything a request does goes
 *   through it.
 * - `admin` is the owner connection. It is used for exactly two things —
 *   resolving a host to a school before any tenant context exists, and
 *   platform-console work. It is a property rather than a method so that a
 *   reviewer can grep for `.admin` and find every use.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  private readonly app: PrismaClient;
  readonly admin: PrismaClient;

  constructor(
    @Inject(ENV) env: Env,
    private readonly context: TenantContextService,
  ) {
    const logQueries = env.NODE_ENV === 'development';
    this.app = createApplicationClient({ url: env.DATABASE_URL, logQueries });
    this.admin = createAdminClient({ url: env.DATABASE_ADMIN_URL });
  }

  async onModuleInit(): Promise<void> {
    await this.app.$connect();
    await this.admin.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.app.$disconnect();
    await this.admin.$disconnect();
  }

  /**
   * Run a unit of work scoped to the tenant in request context.
   *
   * The tenant is read from CLS, never taken as a parameter (docs/12 R2).
   */
  async tenant<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    options?: TenantTransactionOptions,
  ): Promise<T> {
    return runInTenant(this.app, this.context.schoolId, fn, this.context.schoolId, options);
  }

  /**
   * Tenant-bound but without the query-rewriting layer, for the rare raw-SQL
   * path. PostgreSQL RLS still applies — it is the layer that raw SQL cannot
   * escape — but nothing rewrites the query, so the SQL must be correct itself.
   */
  async tenantRaw<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return runInTenantUnscoped(this.app, this.context.schoolId, fn);
  }

  /**
   * Health probe. Uses the application role deliberately: a health check that
   * passes as the owner while the application role is misconfigured is worse
   * than no health check.
   */
  async ping(): Promise<boolean> {
    await this.app.$queryRaw`SELECT 1`;
    return true;
  }
}
