import {
  completeOnboardingSchema,
  RESERVED_SLUGS,
  ROUTES,
  upsertUserProfileSchema,
  type CompleteOnboarding,
  type UpsertUserProfile,
  type UserProfile,
} from '@ilm/contracts';
import { Body, Controller, Get, Inject, Injectable, Module, Post, Put, Req } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, ConflictError } from '../../shared/errors/domain-error';
import { localKey } from '../../shared/storage/database.store';
import { verifyImage } from '../../shared/storage/image-bytes';
import { STORAGE_PROVIDERS } from '../../shared/storage/storage.port';
import { schoolOrigin } from '../../shared/tenancy/school-origin';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, clockProvider, type Clock } from '../../shared/time/clock.provider';
import { AcademicsModule } from '../academics/academics.module';
import { SchoolLevelClassSyncService } from '../academics/school-level-class-sync.service';
import { AuthModule } from '../auth/auth.module';
import { HandoffService } from '../auth/handoff.service';

/**
 * The signed-in person's own profile, and first-login school onboarding.
 *
 * No permission decorator: every authenticated school member may read and
 * update themselves. Completing onboarding (or a personal profile when the
 * school is already set up) unlocks the rest of the portal.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly handoffs: HandoffService,
    private readonly levelClasses: SchoolLevelClassSyncService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async get(): Promise<UserProfile> {
    const userId = this.requireUserId();

    return this.prisma.tenant(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          phone: true,
          designation: true,
          avatarUrl: true,
          profileCompletedAt: true,
        },
      });

      if (user === null) {
        throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Your session has ended. Sign in again.');
      }

      const school = await tx.school.findUnique({
        where: { id: this.context.schoolId },
        select: {
          name: true,
          slug: true,
          city: true,
          address: true,
          phone: true,
          email: true,
          schoolLevels: true,
          onboardedAt: true,
        },
      });

      if (school === null) {
        throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Your session has ended. Sign in again.');
      }

      return toProfile(user, school);
    });
  }

  /**
   * Personal fields only — after the school is already onboarded.
   *
   * First successful save stamps `profileCompletedAt`. Refuses when the school
   * still needs the full onboarding form (owner after signup OTP).
   */
  async upsert(input: UpsertUserProfile): Promise<UserProfile> {
    const userId = this.requireUserId();
    const now = this.clock.now();

    return this.prisma.tenant(async (tx) => {
      const school = await tx.school.findUnique({
        where: { id: this.context.schoolId },
        select: {
          name: true,
          slug: true,
          city: true,
          address: true,
          phone: true,
          email: true,
          schoolLevels: true,
          onboardedAt: true,
        },
      });

      if (school === null) {
        throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Your session has ended. Sign in again.');
      }

      if (school.onboardedAt === null) {
        throw new BusinessRuleError(
          'PROFILE_ONBOARDING_REQUIRED',
          'Finish setting up your school before editing personal details alone.',
        );
      }

      const before = await tx.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          phone: true,
          designation: true,
          avatarUrl: true,
          profileCompletedAt: true,
        },
      });

      if (before === null) {
        throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Your session has ended. Sign in again.');
      }

      const completing = before.profileCompletedAt === null;

      const user = await tx.user.update({
        where: { id: userId },
        data: {
          name: input.name,
          phone: input.phone,
          designation: input.designation ?? null,
          ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
          ...(completing ? { profileCompletedAt: now } : {}),
        },
        select: {
          name: true,
          email: true,
          phone: true,
          designation: true,
          avatarUrl: true,
          profileCompletedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          schoolId: this.context.schoolId,
          action: completing ? 'user.profile.complete' : 'user.profile.update',
          entityType: 'User',
          entityId: userId,
          actorType: 'USER',
          actorUserId: userId,
          before: {
            name: before.name,
            phone: before.phone,
            designation: before.designation,
            avatarUrl: before.avatarUrl,
            profileCompletedAt: before.profileCompletedAt?.toISOString() ?? null,
          },
          after: {
            name: user.name,
            phone: user.phone,
            designation: user.designation,
            avatarUrl: user.avatarUrl,
            profileCompletedAt: user.profileCompletedAt?.toISOString() ?? null,
          },
          at: now,
        },
      });

      return toProfile(user, school);
    });
  }

  /**
   * First-login setup after signup OTP: school details + owner profile.
   *
   * Stamps `onboardedAt` and `profileCompletedAt` together so the proxy unlocks
   * navigation. If the slug changes, `relocateTo` is a handoff onto the new
   * host — session cookies are host-only (ADR-0009), so a bare redirect would
   * land them signed out.
   */
  async completeOnboarding(
    input: CompleteOnboarding,
    context: { readonly ip?: string; readonly userAgent?: string } = {},
  ): Promise<UserProfile & { relocateTo?: string }> {
    const userId = this.requireUserId();
    const now = this.clock.now();

    if (RESERVED_SLUGS.has(input.school.slug)) {
      throw new ConflictError(`"${input.school.slug}" is reserved. Choose another short name.`);
    }

    const result = await this.prisma
      .tenant(async (tx) => {
        const schoolBefore = await tx.school.findUnique({
          where: { id: this.context.schoolId },
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            address: true,
            phone: true,
            email: true,
            schoolLevels: true,
            timezone: true,
            locale: true,
            onboardedAt: true,
          },
        });

        if (schoolBefore === null) {
          throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Your session has ended. Sign in again.');
        }

        if (schoolBefore.onboardedAt !== null) {
          throw new BusinessRuleError(
            'PROFILE_ALREADY_COMPLETE',
            'Your school is already set up. Use edit profile for personal changes.',
          );
        }

        const userBefore = await tx.user.findUnique({
          where: { id: userId },
          select: {
            name: true,
            email: true,
            phone: true,
            designation: true,
            avatarUrl: true,
            profileCompletedAt: true,
          },
        });

        if (userBefore === null) {
          throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Your session has ended. Sign in again.');
        }

        if (userBefore.profileCompletedAt !== null) {
          throw new BusinessRuleError(
            'PROFILE_ALREADY_COMPLETE',
            'Your profile is already complete.',
          );
        }

        const school = await tx.school.update({
          where: { id: schoolBefore.id },
          data: {
            name: input.school.name,
            slug: input.school.slug,
            city: input.school.city,
            address: input.school.address,
            phone: input.school.phone,
            email: input.school.email,
            schoolLevels: [...input.school.schoolLevels],
            oLevelClassNames: [...(input.school.oLevelClassNames ?? [])],
            aLevelClassNames: [...(input.school.aLevelClassNames ?? [])],
            timezone: input.school.timezone,
            locale: input.school.locale,
            onboardedAt: now,
          },
          select: {
            name: true,
            slug: true,
            city: true,
            address: true,
            phone: true,
            email: true,
            schoolLevels: true,
            oLevelClassNames: true,
            aLevelClassNames: true,
            onboardedAt: true,
          },
        });

        await this.levelClasses.syncInTransaction(tx, school.schoolLevels, {
          oLevelClassNames: school.oLevelClassNames,
          aLevelClassNames: school.aLevelClassNames,
        });

        if (input.logo !== undefined) {
          // Written straight to the database driver, not through `StoragePort`.
          //
          // This runs inside the transaction that onboards a school, and an
          // upload to a CDN is a network call that would hold a Postgres
          // connection open for as long as the provider takes to answer — up to
          // the storage timeout, on the one request a new customer cannot
          // retry. Reading dispatches on the provider recorded per row, so this
          // logo serves correctly forever; replacing it from Settings moves it
          // to whatever driver is configured. See ADR-0013.
          const image = verifyImage('SCHOOL_LOGO', input.logo);
          const stored = {
            bytes: new Uint8Array(image.bytes),
            mimeType: image.mimeType,
            etag: image.etag,
            byteSize: image.bytes.byteLength,
            storageProvider: STORAGE_PROVIDERS.database,
            storageKey: localKey(schoolBefore.id, 'SCHOOL_LOGO'),
            createdBy: userId,
          };

          await tx.schoolLogo.upsert({
            // The school's own mark, not the bank's — a school now has a row
            // for each, and this path only ever writes the letterhead.
            where: { schoolId_kind: { schoolId: schoolBefore.id, kind: 'SCHOOL' } },
            create: { schoolId: schoolBefore.id, kind: 'SCHOOL', ...stored },
            update: stored,
          });
        }

        const user = await tx.user.update({
          where: { id: userId },
          data: {
            name: input.person.name,
            phone: input.person.phone,
            designation: input.person.designation ?? null,
            profileCompletedAt: now,
          },
          select: {
            name: true,
            email: true,
            phone: true,
            designation: true,
            avatarUrl: true,
            profileCompletedAt: true,
          },
        });

        await tx.auditLog.create({
          data: {
            schoolId: this.context.schoolId,
            action: 'school.onboard',
            entityType: 'School',
            entityId: schoolBefore.id,
            actorType: 'USER',
            actorUserId: userId,
            before: {
              name: schoolBefore.name,
              slug: schoolBefore.slug,
              city: schoolBefore.city,
              address: schoolBefore.address,
              phone: schoolBefore.phone,
              email: schoolBefore.email,
              schoolLevels: schoolBefore.schoolLevels,
              onboardedAt: null,
            },
            after: {
              name: school.name,
              slug: school.slug,
              city: school.city,
              address: school.address,
              phone: school.phone,
              email: school.email,
              schoolLevels: school.schoolLevels,
              onboardedAt: school.onboardedAt?.toISOString() ?? null,
            },
            at: now,
          },
        });

        await tx.auditLog.create({
          data: {
            schoolId: this.context.schoolId,
            action: 'user.profile.complete',
            entityType: 'User',
            entityId: userId,
            actorType: 'USER',
            actorUserId: userId,
            before: {
              name: userBefore.name,
              phone: userBefore.phone,
              designation: userBefore.designation,
              profileCompletedAt: null,
            },
            after: {
              name: user.name,
              phone: user.phone,
              designation: user.designation,
              profileCompletedAt: user.profileCompletedAt?.toISOString() ?? null,
            },
            at: now,
          },
        });

        return {
          profile: toProfile(user, school),
          schoolId: schoolBefore.id,
          previousSlug: schoolBefore.slug,
          nextSlug: school.slug,
        };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            `A school already uses the short name "${input.school.slug}". Try another.`,
          );
        }
        throw error;
      });

    if (result.previousSlug === result.nextSlug) {
      return result.profile;
    }

    // New host needs its own session cookies — mint a one-shot handoff, same
    // bridge used after apex sign-in (ADR-0009).
    const token = await this.handoffs.mint(result.schoolId, userId, now, context);
    const origin = schoolOrigin(
      result.nextSlug,
      this.env.APP_DOMAIN,
      this.env.WEB_URL,
      this.env.PORTAL_TENANT_MODE,
    );

    return {
      ...result.profile,
      relocateTo: `${origin}/auth/continue?t=${token}&next=${encodeURIComponent('/')}`,
    };
  }

  private requireUserId(): string {
    const userId = this.context.userId;
    if (userId === undefined) {
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Sign in to continue.');
    }
    return userId;
  }
}

@Controller()
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get(ROUTES.me.profile)
  async get(): Promise<{ data: UserProfile }> {
    return { data: await this.profiles.get() };
  }

  @Put(ROUTES.me.profile)
  async upsert(@Body() body: unknown): Promise<{ data: UserProfile }> {
    return { data: await this.profiles.upsert(upsertUserProfileSchema.parse(body)) };
  }

  @Post(ROUTES.me.onboarding)
  async completeOnboarding(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: UserProfile & { relocateTo?: string } }> {
    return {
      data: await this.profiles.completeOnboarding(completeOnboardingSchema.parse(body), {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      }),
    };
  }
}

@Module({
  imports: [AuthModule, AcademicsModule],
  controllers: [ProfileController],
  providers: [clockProvider, ProfileService],
})
export class ProfileModule {}

function toProfile(
  user: {
    name: string;
    email: string;
    phone: string | null;
    designation: string | null;
    avatarUrl: string | null;
    profileCompletedAt: Date | null;
  },
  school: {
    name: string;
    slug: string;
    city: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    schoolLevels: string[];
    onboardedAt: Date | null;
  },
): UserProfile {
  return {
    name: user.name,
    email: user.email,
    phone: user.phone,
    designation: user.designation,
    avatarUrl: user.avatarUrl,
    profileCompleted: user.profileCompletedAt !== null,
    completedAt: user.profileCompletedAt?.toISOString() ?? null,
    school: {
      name: school.name,
      slug: school.slug,
      city: school.city,
      address: school.address,
      phone: school.phone,
      email: school.email,
      schoolLevels: school.schoolLevels,
      onboarded: school.onboardedAt !== null,
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  // No cast: `'code' in error` has already narrowed it, so the assertion said
  // nothing the types did not.
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
