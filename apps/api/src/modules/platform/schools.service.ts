import { randomBytes } from 'node:crypto';

import {
  RESERVED_SLUGS,
  SCHOOL_STATUSES,
  TRIAL_WARNING_DAYS,
  type CreateSchool,
  type CreateSchoolResult,
  type PlatformOverview,
  type SchoolListItem,
  type SchoolListQuery,
} from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../shared/auth/password.service';
import { ConflictError } from '../../shared/errors/domain-error';
import { SchoolDirectoryService } from '../../shared/tenancy/school-directory.service';
import { schoolOrigin } from '../../shared/tenancy/school-origin';

/**
 * Schools, seen from the platform console.
 *
 * Everything here runs on the **admin** connection, necessarily: this is the
 * one service in the product whose whole job is to see across tenants, and the
 * application role is scoped to exactly one. That makes it the most dangerous
 * file in the codebase, which is why it is small, why every method is reachable
 * only behind `PlatformGuard`, and why it exposes counts and names rather than
 * any school's actual records.
 *
 * It reads no student, no guardian, no payment. An operator needing those must
 * impersonate, which is audited and consented (docs/17 §5) — not quietly query
 * them from here.
 */

@Injectable()
export class SchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly schools: SchoolDirectoryService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(query: SchoolListQuery): Promise<{ rows: SchoolListItem[]; total: number }> {
    const search = query.q;
    const where = {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(search === undefined
        ? {}
        : {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { slug: { contains: search, mode: 'insensitive' as const } },
            ],
          }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.admin.school.findMany({
        where,
        orderBy: orderFor(query.sort, query.order),
        skip: query.offset,
        take: query.limit,
        select: LIST_SELECT,
      }),
      this.prisma.admin.school.count({ where }),
    ]);

    return { total, rows: rows.map(toListItem) };
  }

  /**
   * The landing numbers. Counts of students and staff exclude soft-deleted
   * rows, so the headline never includes people a school has already removed.
   */
  async overview(now: Date): Promise<PlatformOverview> {
    const horizon = new Date(now.getTime() + TRIAL_WARNING_DAYS * 24 * 60 * 60 * 1000);

    const [grouped, totalStudents, totalStaff, ending, recent] = await Promise.all([
      this.prisma.admin.school.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.admin.student.count({ where: { deletedAt: null } }),
      this.prisma.admin.staff.count({ where: { deletedAt: null } }),
      this.prisma.admin.school.findMany({
        // A lapsed trial (end date already past) is still shown: it is the most
        // urgent row on the page, not one to drop for being late.
        where: { status: 'TRIAL', trialEndsAt: { lte: horizon } },
        orderBy: { trialEndsAt: 'asc' },
        take: 10,
        select: LIST_SELECT,
      }),
      this.prisma.admin.school.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: LIST_SELECT,
      }),
    ]);

    const schoolsByStatus = Object.fromEntries(
      SCHOOL_STATUSES.map((status) => [
        status,
        grouped.find((row) => row.status === status)?._count._all ?? 0,
      ]),
    ) as PlatformOverview['schoolsByStatus'];

    return {
      schoolsByStatus,
      totalSchools: grouped.reduce((sum, row) => sum + row._count._all, 0),
      totalStudents,
      totalStaff,
      trialsEndingSoon: ending.map(toListItem),
      recentSignups: recent.map(toListItem),
    };
  }

  async isSlugAvailable(slug: string): Promise<boolean> {
    if (RESERVED_SLUGS.has(slug)) {
      return false;
    }
    const existing = await this.prisma.admin.school.findUnique({
      where: { slug },
      select: { id: true },
    });
    return existing === null;
  }

  /**
   * Create a school and its first owner, atomically.
   *
   * **One transaction, not two calls.** A school created without an owner is a
   * tenant nobody can sign into, and the only way to notice is a support
   * ticket. Either both exist or neither does.
   *
   * The reserved-slug check is not cosmetic: `api.<domain>` and `admin.<domain>`
   * are real hostnames in this product, and letting a school claim one would
   * make its address shadow the API or the console.
   */
  async create(input: CreateSchool, now: Date): Promise<CreateSchoolResult> {
    if (RESERVED_SLUGS.has(input.slug)) {
      throw new ConflictError(
        `"${input.slug}" is reserved. Choose another short name for this school.`,
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    const school = await this.prisma.admin
      .$transaction(async (tx) => {
        const created = await tx.school.create({
          data: {
            name: input.name,
            slug: input.slug,
            city: input.city ?? null,
            timezone: input.timezone,
            locale: input.locale,
            status: 'TRIAL',
            onboardedAt: now,
          },
          select: { id: true, name: true, slug: true, city: true, status: true, createdAt: true },
        });

        const owner = await tx.user.create({
          data: {
            schoolId: created.id,
            email: input.owner.email,
            name: input.owner.name,
            passwordHash,
            status: 'ACTIVE',
            // The temporary password is handed over out of band and is
            // single-use in practice: the first sign-in must replace it.
            mustChangePassword: true,
            // Operator already collected identity out of band — do not bounce
            // them through the self-serve first-login profile gate.
            profileCompletedAt: now,
          },
          select: { id: true },
        });

        await tx.userRole.create({
          data: { schoolId: created.id, userId: owner.id, role: 'OWNER' },
        });

        return created;
      })
      .catch((error: unknown) => {
        // A unique violation here is a race between two operators, or a slug
        // typed twice. Either way it is the caller's problem to fix, not a 500.
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            `A school already uses the short name "${input.slug}", or that email already has an account there.`,
          );
        }
        throw error;
      });

    return {
      school: {
        id: school.id,
        name: school.name,
        slug: school.slug,
        city: school.city,
        status: school.status,
        studentCount: 0,
        userCount: 1,
        trialEndsAt: null,
        createdAt: school.createdAt.toISOString(),
      },
      loginUrl: `${schoolOrigin(school.slug, this.env.APP_DOMAIN, this.env.WEB_URL, this.env.PORTAL_TENANT_MODE)}/login`,
      owner: { email: input.owner.email, temporaryPassword },
    };
  }

  async changeStatus(
    id: string,
    status: SchoolListItem['status'],
    now: Date,
  ): Promise<SchoolListItem> {
    const updated = await this.prisma.admin.school.update({
      where: { id },
      data: { status, ...(status === 'ACTIVE' ? { onboardedAt: now } : {}) },
      select: LIST_SELECT,
    });

    // Suspension and churn are what the guard reads on every request, so the
    // instance that made the change stops serving the old status immediately.
    // Every other instance is bounded by the directory's TTL — see the note in
    // school-directory.service.ts on why both are needed.
    this.schools.forget(updated.slug);

    return toListItem(updated);
  }
}

const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  city: true,
  status: true,
  trialEndsAt: true,
  createdAt: true,
  _count: { select: { students: true, users: true } },
} as const;

function toListItem(school: {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  status: SchoolListItem['status'];
  trialEndsAt: Date | null;
  createdAt: Date;
  _count: { students: number; users: number };
}): SchoolListItem {
  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    city: school.city,
    status: school.status,
    studentCount: school._count.students,
    userCount: school._count.users,
    trialEndsAt: school.trialEndsAt === null ? null : school.trialEndsAt.toISOString(),
    createdAt: school.createdAt.toISOString(),
  };
}

/** Sort is an allow-list from the contract, so this maps rather than interpolates. */
function orderFor(sort: string, order: 'asc' | 'desc') {
  switch (sort) {
    case 'name':
      return { name: order } as const;
    case 'slug':
      return { slug: order } as const;
    case 'studentCount':
      return { students: { _count: order } } as const;
    default:
      return { createdAt: order } as const;
  }
}

/**
 * A temporary password that is actually strong.
 *
 * 20 base32-ish characters from a CSPRNG — not a memorable phrase, because this
 * is read once from a screen and typed once. Ambiguous characters are excluded
 * so it survives being read aloud over a phone.
 */
function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(20);
  let out = '';
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
