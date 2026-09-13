import {
  RESERVED_SLUGS,
  TRIAL_DAYS,
  type SignupRequest,
  type SignupResult,
  type SlugAvailability,
} from '@ilm/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../shared/auth/password.service';
import { ConflictError } from '../../shared/errors/domain-error';
import { schoolOrigin } from '../../shared/tenancy/school-origin';
import { EmailVerificationService } from '../auth/email-verification.service';
import { HandoffService } from '../auth/handoff.service';
import { decodeAndVerify } from '../schools/school-logo.service';

/**
 * Self-serve signup — ADR-0010.
 *
 * A stranger creates a tenant. That sentence is the whole reason this file
 * reads the way it does, and it is worth being blunt about what it changes:
 * until now every school in the database was created by an operator who had
 * already spoken to someone. Now the first contact the business has with a
 * school may be a row this method wrote at 2am.
 *
 * Three things follow, and all three are in the transaction below rather than
 * in a follow-up job:
 *
 * 1. **A school with no owner is a tenant nobody can sign into**, and the only
 *    way to find out is a support ticket. School, owner, role: one transaction
 *    or none of it.
 * 2. **Terms acceptance is recorded at the moment it is given.** There is no
 *    operator to attest to it afterwards (docs/17 §3).
 * 3. **The creation is audited**, because "where did this school come from" is
 *    the first question anyone will ask about an unexpected row.
 *
 * Like `SchoolsService`, this runs on the **admin** connection — it creates the
 * tenant, so by definition there is no tenant to be scoped to yet.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly handoffs: HandoffService,
    private readonly verification: EmailVerificationService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Is this subdomain free?
   *
   * This is an enumeration oracle and there is no way for it not to be: a
   * signup form that cannot say "taken" before submission is a signup form
   * people abandon. Every SaaS with a subdomain has the same endpoint, and what
   * it discloses — that a school with a given short name exists — is the same
   * thing anyone learns by loading that address and seeing a login page.
   *
   * It is rate limited, and it returns nothing beyond yes/no: no school name,
   * no status, no creation date.
   */
  async checkSlug(slug: string): Promise<SlugAvailability> {
    const normalised = slug.trim().toLowerCase();

    if (normalised.length < 2 || !SLUG_SHAPE.test(normalised)) {
      return { slug: normalised, available: false, reason: 'invalid' };
    }

    if (RESERVED_SLUGS.has(normalised)) {
      return { slug: normalised, available: false, reason: 'reserved' };
    }

    const existing = await this.prisma.admin.school.findUnique({
      where: { slug: normalised },
      select: { id: true },
    });

    return existing === null
      ? { slug: normalised, available: true }
      : { slug: normalised, available: false, reason: 'taken' };
  }

  /**
   * Create the school, its owner and its trial, and sign the owner in.
   *
   * The return value is a handoff, not a session: this request arrived on the
   * marketing hostname and the school's cookies belong on the school's
   * hostname (ADR-0009). The person lands inside their own portal without
   * typing the password they chose thirty seconds ago.
   */
  async signup(
    input: SignupRequest,
    now: Date,
    context: { ip?: string; userAgent?: string },
  ): Promise<SignupResult> {
    // `schoolSlugSchema` already refused the reserved names at the contract
    // boundary. Repeated here because this method is also what any future
    // import or migration path would call, and "the caller validated it" is the
    // assumption that eventually turns out to be false.
    if (RESERVED_SLUGS.has(input.school.slug)) {
      throw new ConflictError(`"${input.school.slug}" is reserved. Choose another short name.`);
    }

    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const passwordHash = await this.passwords.hash(input.owner.password);

    const created = await this.prisma.admin
      .$transaction(async (tx) => {
        const school = await tx.school.create({
          data: {
            name: input.school.name,
            slug: input.school.slug,
            city: input.school.city,
            phone: input.school.phone,
            email: input.school.email,
            timezone: input.school.timezone,
            locale: input.school.locale,
            status: 'TRIAL',
            onboardedAt: now,
            trialEndsAt,
          },
          select: { id: true, name: true, slug: true },
        });

        const owner = await tx.user.create({
          data: {
            schoolId: school.id,
            email: input.owner.email,
            name: input.owner.name,
            passwordHash,
            status: 'ACTIVE',
            // They chose this password themselves, thirty seconds ago. Forcing
            // an immediate change is the ritual that follows an operator
            // handing over a temporary one, and there was no operator.
            mustChangePassword: false,
          },
          select: { id: true },
        });

        await tx.userRole.create({
          data: { schoolId: school.id, userId: owner.id, role: 'OWNER' },
        });

        // The logo, if one came with the form.
        //
        // Inside the same transaction as the school, so a rejected image is a
        // signup that did not happen rather than a school with a broken one —
        // and the same `decodeAndVerify` the settings page uses, because "what
        // counts as an image" must not have two answers.
        //
        // `prisma.admin` bypasses the tenant extension, which is the only way
        // to write a row for a school that did not exist a moment ago. The
        // school id is the one just created, never anything from the request.
        if (input.logo !== undefined) {
          const { bytes, etag } = decodeAndVerify(input.logo);
          await tx.schoolLogo.create({
            data: {
              schoolId: school.id,
              bytes: new Uint8Array(bytes),
              mimeType: input.logo.mimeType,
              etag,
              byteSize: bytes.byteLength,
              createdBy: owner.id,
            },
          });
        }

        await tx.schoolAgreement.create({
          data: {
            schoolId: school.id,
            documentType: 'TERMS_OF_SERVICE',
            version: input.termsVersion,
            acceptedAt: now,
            acceptedByUserId: owner.id,
            // Copied, not joined. This record has to still say who signed after
            // the user has been renamed, reassigned or erased.
            acceptedByName: input.owner.name,
            acceptedByEmail: input.owner.email,
            ip: context.ip ?? null,
            userAgent: context.userAgent ?? null,
          },
        });

        await tx.auditLog.create({
          data: {
            schoolId: school.id,
            action: 'school.signup',
            entityType: 'School',
            entityId: school.id,
            actorType: 'USER',
            actorUserId: owner.id,
            after: {
              name: school.name,
              slug: school.slug,
              status: 'TRIAL',
              trialEndsAt: trialEndsAt.toISOString(),
            },
            ip: context.ip ?? null,
            userAgent: context.userAgent ?? null,
            at: now,
          },
        });

        return { school, ownerId: owner.id };
      })
      .catch((error: unknown) => {
        // Two people can reach for the same short name in the same second, and
        // the loser must read "that name is taken", not a 500.
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            `A school already uses the short name "${input.school.slug}". Try another.`,
          );
        }
        throw error;
      });

    this.logger.log(
      { schoolId: created.school.id, slug: created.school.slug },
      'School signed up self-serve',
    );

    // Outside the transaction, and deliberately after it. Sending mail inside a
    // transaction holds a database connection open for the length of an SMTP
    // conversation, and a relay that hangs would roll back a school that is
    // otherwise perfectly created.
    //
    // **Everything past this point is caught**, and that is the important part.
    // The school is already committed. Anything that throws from here would
    // surface as "could not create your school" to somebody whose school does
    // exist and whose slug is now taken — so their retry answers "that name is
    // taken" and they are stuck with no way forward. `mail.send` resolves
    // rather than throwing (ADR-0011), but `sendVerification` also writes rows,
    // and those can fail like any other write.
    //
    // A missing confirmation email is recoverable from inside the portal. An
    // unreachable school is not.
    try {
      const verification = await this.verification.sendVerification(created.ownerId, now);

      if (!verification.sent) {
        this.logger.warn(
          { schoolId: created.school.id },
          'School created but the verification email did not go out; the owner can resend from the portal',
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        { err: error, schoolId: created.school.id },
        'School created but issuing the verification token failed; the owner can resend from the portal',
      );
    }

    const token = await this.handoffs.mint(created.school.id, created.ownerId, now, context);
    const origin = schoolOrigin(
      created.school.slug,
      this.env.APP_DOMAIN,
      this.env.WEB_URL,
      this.env.PORTAL_TENANT_MODE,
    );

    return {
      school: created.school,
      trialEndsAt: trialEndsAt.toISOString(),
      continueTo: {
        schoolId: created.school.id,
        name: created.school.name,
        slug: created.school.slug,
        continueUrl: `${origin}/auth/continue?t=${token}`,
      },
    };
  }
}

/** Same shape as `slugSchema` in the contracts, applied to a raw query string. */
const SLUG_SHAPE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
