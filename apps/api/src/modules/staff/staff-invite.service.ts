import { createHash, randomBytes } from 'node:crypto';

import {
  STAFF_ROLE_LABELS,
  STAFF_ROLE_TO_SCHOOL_ROLE,
  staffRoleCanSignIn,
  type AcceptInviteResult,
  type InviteCheckResult,
  type StaffInviteResult,
  type StaffRole,
} from '@ilm/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../shared/auth/password.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/domain-error';
import { MAIL, type MailPort } from '../../shared/mail/mail.port';
import { staffInviteTemplate } from '../../shared/mail/templates/staff-invite.template';
import { schoolOrigin } from '../../shared/tenancy/school-origin';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';

/**
 * Inviting a member of staff to the portal.
 *
 * ## Why this replaced an administrator typing a password
 *
 * The staff form had a password field. Somebody in the office filled it in and
 * then had to hand the password over — out loud, on paper, over WhatsApp — and
 * for the time in between, the school had a list of accounts whose passwords it
 * knew. That is the arrangement where one password ends up on a sticky note
 * behind the counter and four people share it.
 *
 * An invitation removes the middle step. The account is created with **no
 * password at all**, which is why an invited user cannot sign in: `AuthService`
 * requires both `status === 'ACTIVE'` and a non-null hash, and an invitation
 * grants neither until it is accepted. The first password the account ever has
 * is one the person chose, that nobody else has seen.
 *
 * ## The token
 *
 * 32 random bytes, stored as a SHA-256 hash and never in the clear — a database
 * that leaks must not hand over a set of working invitations. Single-use,
 * expiring, and scoped to the school whose hostname it is presented on, so a
 * token from one school cannot be spent against another even where the two
 * share an administrator.
 *
 * Re-inviting supersedes: the previous invitation for that account is deleted
 * before a new one is written, so a link that was forwarded, screenshotted or
 * left in a mailbox stops working the moment the school sends another.
 */

/**
 * Three days.
 *
 * Longer than the one-hour password reset, deliberately. A reset is asked for
 * by somebody sitting at the screen; an invitation lands in the inbox of a
 * teacher who may be mid-term, on leave, or checking mail on Sunday. An hour
 * would make "expired, ask for another" the normal path rather than the
 * exception. Short enough that an invitation left unaccepted does not stay
 * live for a term.
 */
const INVITE_TTL_HOURS = 72;

/** What `issue` produces and `deliver` needs. The token exists only in here. */
export interface IssuedInvitation {
  readonly token: string;
  readonly email: string;
  readonly expiresAt: Date;
  readonly recipientName: string;
  readonly schoolName: string;
  readonly schoolSlug: string;
  readonly roleLabel: string;
}

@Injectable()
export class StaffInviteService {
  private readonly logger = new Logger(StaffInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly passwords: PasswordService,
    @Inject(MAIL) private readonly mail: MailPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Send, or re-send, an invitation for one member of staff.
   *
   * Creates the portal account if there is not one yet, which is what makes
   * this the single entry point: the staff form no longer creates accounts, so
   * there is one place where a login comes into existence and one place where
   * the rule about which roles may have one is applied.
   */
  async invite(staffId: string, now: Date): Promise<StaffInviteResult> {
    const issued = await this.prisma.tenant((tx) => this.issue(tx, staffId, now));
    return this.deliver(issued);
  }

  /**
   * The database half: the account, the role, the token, the audit row.
   *
   * Takes a transaction rather than opening one, so that **adding** a member of
   * staff and **inviting** them are one write. The alternative was a second
   * request after the first, and the failure it produces is a teacher on the
   * payroll with no invitation and nobody aware of it — the same shape as the
   * admission that saves a child with no fees, which the students module holds
   * in one transaction for exactly this reason.
   *
   * Sending the mail is deliberately **not** in here. A mail server is slow and
   * outside the database's control, and holding a transaction open across it
   * means holding a row lock for however long a third party takes to answer.
   */
  async issue(
    tx: TransactionClient,
    staffId: string,
    now: Date,
  ): Promise<IssuedInvitation> {
    return (async () => {
        const staff = await tx.staff.findFirst({
          where: { id: staffId, deletedAt: null },
          select: { id: true, name: true, email: true, role: true, userId: true, status: true },
        });

        if (staff === null) {
          throw new NotFoundError('staff member');
        }

        const role: StaffRole = staff.role;

        if (!staffRoleCanSignIn(role)) {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            `${STAFF_ROLE_LABELS[role]} is not a role that uses the portal, so there is nothing to invite them to.`,
          );
        }

        if (staff.status !== 'ACTIVE') {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'This person has left. Re-employ them before inviting them back to the portal.',
          );
        }

        if (staff.email === null || staff.email === '') {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'Add an email address for this person first — the invitation is sent to it.',
          );
        }

        const school = await tx.school.findFirst({ select: { id: true, name: true, slug: true } });
        if (school === null) {
          throw new NotFoundError('school');
        }

        const schoolRole = STAFF_ROLE_TO_SCHOOL_ROLE[role as keyof typeof STAFF_ROLE_TO_SCHOOL_ROLE];

        // The account, if it does not exist yet. No password hash, and
        // `INVITED` — both halves of "cannot sign in" (`AuthService` checks
        // each), so the window between inviting and accepting grants nothing.
        let userId = staff.userId;

        if (userId === null) {
          // A portal account already on this address, belonging to somebody
          // else. `users` is unique on (school, email) and `staff` is not, so
          // this is reachable with two rows and one typo — and it surfaced as a
          // 500, which tells an office that the system is broken about
          // something they could fix in five seconds.
          const taken = await tx.user.findFirst({
            where: { email: staff.email },
            select: { id: true },
          });

          if (taken !== null) {
            throw new ConflictError(
              `Somebody else at this school already uses ${staff.email}. Give this person their own address.`,
            );
          }

          const user = await tx.user.create({
            // `as never` as everywhere else in this codebase: the tenant
            // extension supplies `schoolId`, which the generated input type
            // still insists on.
            data: {
              email: staff.email,
              name: staff.name,
              status: 'INVITED',
              passwordHash: null,
            } as never,
            select: { id: true },
          });
          userId = user.id;

          await tx.userRole.create({ data: { userId, role: schoolRole } as never });
          await tx.staff.update({ where: { id: staff.id }, data: { userId } });
        } else {
          // An existing account whose address has since been corrected on the
          // staff record. The invitation goes to the new one, so the account
          // must hold it — otherwise they would accept an invitation sent to an
          // address their account does not have, and could never reset from.
          await tx.user.update({ where: { id: userId }, data: { email: staff.email } });
        }

        // Supersede. Whatever link was sent before stops working now, which is
        // the point of a re-send: the usual reason is that the old one went
        // somewhere it should not have.
        await tx.invitation.deleteMany({ where: { userId, acceptedAt: null } });

        const token = randomBytes(32).toString('base64url');
        const expires = new Date(now.getTime() + INVITE_TTL_HOURS * 3_600_000);

        await tx.invitation.create({
          data: {
            email: staff.email,
            role: schoolRole,
            userId,
            tokenHash: hash(token),
            invitedBy: this.context.userId ?? null,
            expiresAt: expires,
          } as never,
        });

        await tx.auditLog.create({
          data: {
            schoolId: this.context.schoolId,
            action: 'staff.invite.send',
            entityType: 'Staff',
            entityId: staff.id,
            actorType: 'USER',
            actorUserId: this.context.userId ?? null,
            before: {},
            // The token is not recorded, here or anywhere. An audit log is read
            // by more people than a password store, and a working invitation in
            // it is a working invitation in it.
            after: { email: staff.email, role: schoolRole, expiresAt: expires.toISOString() },
            at: now,
          },
        });

        return {
          token,
          email: staff.email,
          expiresAt: expires,
          recipientName: staff.name,
          schoolName: school.name,
          schoolSlug: school.slug,
          roleLabel: STAFF_ROLE_LABELS[role],
        };
    })();
  }

  /**
   * The mail half, run after the transaction has committed.
   *
   * A `false` is reported, never thrown. `MailPort` never throws by contract,
   * a school must not fail to record an employee because a mail server was
   * slow, and the invitation exists either way — so the honest answer is
   * "invited, but the email did not go", beside a Re-send button that works.
   */
  async deliver(issued: IssuedInvitation): Promise<StaffInviteResult> {
    const { token, email, expiresAt, recipientName, schoolName, schoolSlug, roleLabel } = issued;

    const origin = schoolOrigin(
      schoolSlug,
      this.env.APP_DOMAIN,
      this.env.WEB_URL,
      this.env.PORTAL_TENANT_MODE,
    );

    const result = await this.mail.send(
      staffInviteTemplate({
        to: email,
        recipientName,
        schoolName,
        roleLabel,
        inviteUrl: `${origin}/invite?t=${token}`,
        expiresInHours: INVITE_TTL_HOURS,
      }),
    );

    if (!result.sent) {
      this.logger.warn(`Invitation for ${email} was created but not delivered: ${result.error}`);
    }

    return { sent: result.sent, email, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Read an invitation without spending it.
   *
   * So the page can say "Hello Ayesha, set your password for Demo Public
   * School" rather than presenting a bare form to somebody who clicked a link
   * three days ago and no longer remembers what it was for.
   */
  async check(slug: string, token: string, now: Date): Promise<InviteCheckResult> {
    const invitation = await this.find(slug, token, now);

    return {
      name: invitation.user.name,
      email: invitation.email,
      schoolName: invitation.school.name,
      roleLabel: labelForSchoolRole(invitation.role),
    };
  }

  /**
   * Spend it: set the password, and the account goes live.
   *
   * Everything in one transaction, because a password written without the
   * invitation being marked accepted is a link that still works, and an
   * invitation marked accepted without the password written is an account
   * nobody can ever get into.
   */
  async accept(slug: string, token: string, password: string, now: Date): Promise<AcceptInviteResult> {
    const invitation = await this.find(slug, token, now);
    const passwordHash = await this.passwords.hash(password);

    await this.prisma.admin.$transaction(async (tx) => {
      // Re-read under the transaction and only proceed if it is still
      // unaccepted. Two clicks on the same link, a double-submitted form, or a
      // mail client prefetching the URL would otherwise each set a password —
      // and the second would overwrite the first with whatever it was given.
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });

      if (claimed.count === 0) {
        throw new BusinessRuleError(
          'AUTH_TOKEN_INVALID',
          'That invitation has already been used. Sign in, or ask the school for a new one.',
        );
      }

      await tx.user.update({
        where: { id: invitation.userId },
        data: {
          passwordHash,
          status: 'ACTIVE',
          // They proved they can read mail at this address by following the
          // link, which is the same proof `verify-email` asks for. Asking again
          // would be asking them to confirm the thing they just did.
          emailVerifiedAt: now,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      await tx.auditLog.create({
        data: {
          schoolId: invitation.schoolId,
          action: 'staff.invite.accept',
          entityType: 'User',
          entityId: invitation.userId,
          actorType: 'USER',
          actorUserId: invitation.userId,
          before: { status: 'INVITED' },
          after: { status: 'ACTIVE' },
          at: now,
        },
      });
    });

    return { email: invitation.email };
  }

  /**
   * The one lookup both paths share.
   *
   * On the **admin** connection, necessarily: nobody is signed in, so there is
   * no tenant context for RLS to read. The scoping that RLS would have done is
   * done explicitly instead — the invitation must belong to the school whose
   * hostname the request arrived on, which is what stops a token minted by one
   * school being spent against another.
   *
   * Every failure answers the same way. "Expired", "already used", "no such
   * token" and "wrong school" are four states that a caller probing links must
   * not be able to tell apart.
   */
  private async find(slug: string, token: string, now: Date) {
    const invitation = await this.prisma.admin.invitation.findFirst({
      where: {
        tokenHash: hash(token),
        acceptedAt: null,
        expiresAt: { gt: now },
        userId: { not: null },
        school: { slug },
      },
      select: {
        id: true,
        email: true,
        role: true,
        userId: true,
        schoolId: true,
        school: { select: { name: true } },
        user: { select: { name: true, status: true } },
      },
    });

    if (invitation === null || invitation.userId === null || invitation.user === null) {
      throw new BusinessRuleError(
        'AUTH_TOKEN_INVALID',
        'That invitation link is no longer valid. Ask the school to send another.',
      );
    }

    return { ...invitation, userId: invitation.userId, user: invitation.user };
  }
}

/** `PRINCIPAL` → `Head`, via the staff role it maps from. */
function labelForSchoolRole(schoolRole: string): string {
  for (const [staffRole, mapped] of Object.entries(STAFF_ROLE_TO_SCHOOL_ROLE)) {
    if (mapped === schoolRole) {
      return STAFF_ROLE_LABELS[staffRole as StaffRole];
    }
  }
  return schoolRole;
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
