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
import { schoolOrigin } from '../../shared/tenancy/school-origin';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, clockProvider, type Clock } from '../../shared/time/clock.provider';
import { AuthModule } from '../auth/auth.module';
import { HandoffService } from '../auth/handoff.service';
import { decodeAndVerify } from '../schools/school-logo.service';

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
          phone: true,
          email: true,
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
          phone: true,
          email: true,
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
            phone: true,
            email: true,
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
            phone: input.school.phone,
            email: input.school.email,
            timezone: input.school.timezone,
            locale: input.school.locale,
            onboardedAt: now,
          },
          select: {
            name: true,
            slug: true,
            city: true,
            phone: true,
            email: true,
            onboardedAt: true,
          },
        });

        if (input.logo !== undefined) {
          const { bytes, etag } = decodeAndVerify(input.logo);
          await tx.schoolLogo.upsert({
            where: { schoolId: schoolBefore.id },
            create: {
              schoolId: schoolBefore.id,
              bytes: new Uint8Array(bytes),
              mimeType: input.logo.mimeType,
              etag,
              byteSize: bytes.byteLength,
              createdBy: userId,
            },
            update: {
              bytes: new Uint8Array(bytes),
              mimeType: input.logo.mimeType,
              etag,
              byteSize: bytes.byteLength,
              createdBy: userId,
            },
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
              phone: schoolBefore.phone,
              email: schoolBefore.email,
              onboardedAt: null,
            },
            after: {
              name: school.name,
              slug: school.slug,
              city: school.city,
              phone: school.phone,
              email: school.email,
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
  imports: [AuthModule],
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
    phone: string | null;
    email: string | null;
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
      phone: school.phone,
      email: school.email,
      onboarded: school.onboardedAt !== null,
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  // No cast: `'code' in error` has already narrowed it, so the assertion said
  // nothing the types did not.
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
