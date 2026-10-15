import { randomBytes } from 'node:crypto';

import { SCHOOL_ROLE_LABELS } from '@ilm/contracts';
import { Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import {
  hashInviteToken,
  INVITE_TTL_HOURS,
  StaffInviteService,
  type IssuedInvitation,
} from '../staff/staff-invite.service';

/**
 * Giving a guardian a login, as part of admitting their child.
 *
 * It reuses the invitation machinery staff already go through — the same
 * `invitations` table, the same single-use hashed token, the same
 * `/invite` page and the same acceptance — so there is one way for anybody to
 * get a first password and one thing to secure. What differs is only where the
 * account comes from: a guardian row, not a staff row.
 *
 * ## One account per email, however many children
 *
 * `users` is unique on (school, email), and a family with three children is
 * admitted three times. So the account is **found before it is created**: the
 * second child links to the login the first one made, and the parent switches
 * between them inside one portal. The same holds for a guardian who is also a
 * teacher — they are one user holding two roles, not two users fighting over an
 * address.
 */
@Injectable()
export class ParentInviteService {
  constructor(
    private readonly context: TenantContextService,
    private readonly invites: StaffInviteService,
  ) {}

  /**
   * Link the guardian to a parent account, creating and inviting one if needed.
   *
   * Returns the invitation to send **after** the transaction commits, or
   * `undefined` when nothing needs sending: the account is already active, or
   * an invitation is still outstanding from an earlier child. A second link to
   * the same inbox would supersede the first, and a parent with two admissions
   * in a week should not be sent two emails and have the first stop working.
   */
  async linkOrInvite(
    tx: TransactionClient,
    guardian: { id: string; name: string; email: string; phone: string | null },
    now: Date,
  ): Promise<IssuedInvitation | undefined> {
    const existing = await tx.user.findFirst({
      where: { email: guardian.email },
      select: { id: true, status: true, roles: { select: { role: true } } },
    });

    let userId: string;
    let needsInvite: boolean;

    if (existing === null) {
      const created = await tx.user.create({
        data: {
          email: guardian.email,
          name: guardian.name,
          ...(guardian.phone === null ? {} : { phone: guardian.phone }),
          // No password and INVITED: both halves of "cannot sign in".
          status: 'INVITED',
          passwordHash: null,
        } as never,
        select: { id: true },
      });
      userId = created.id;
      needsInvite = true;
    } else {
      userId = existing.id;
      // An account still INVITED has a link in somebody's inbox already — unless
      // it has since expired, in which case this admission is the moment to send
      // a fresh one rather than leave the family locked out.
      const live =
        existing.status === 'INVITED'
          ? await tx.invitation.findFirst({
              where: { userId, acceptedAt: null, expiresAt: { gt: now } },
              select: { id: true },
            })
          : null;
      needsInvite = existing.status === 'INVITED' && live === null;
    }

    const hasRole = existing?.roles.some((held) => held.role === 'PARENT') ?? false;
    if (!hasRole) {
      await tx.userRole.create({ data: { userId, role: 'PARENT' } as never });
    }

    await tx.guardian.update({ where: { id: guardian.id }, data: { userId } });

    if (!needsInvite) {
      return undefined;
    }

    const school = await tx.school.findFirst({ select: { id: true, name: true, slug: true } });
    if (school === null) {
      return undefined;
    }

    const token = randomBytes(32).toString('base64url');
    const expires = new Date(now.getTime() + INVITE_TTL_HOURS * 3_600_000);

    await tx.invitation.deleteMany({ where: { userId, acceptedAt: null } });
    await tx.invitation.create({
      data: {
        email: guardian.email,
        role: 'PARENT',
        userId,
        tokenHash: hashInviteToken(token),
        invitedBy: this.context.userId ?? null,
        expiresAt: expires,
      } as never,
    });

    await tx.auditLog.create({
      data: {
        schoolId: this.context.schoolId,
        action: 'guardian.invite.send',
        entityType: 'Guardian',
        entityId: guardian.id,
        actorType: 'USER',
        actorUserId: this.context.userId ?? null,
        before: {},
        // The token is never recorded, here or anywhere.
        after: { email: guardian.email, role: 'PARENT', expiresAt: expires.toISOString() },
        at: now,
      },
    });

    return {
      token,
      email: guardian.email,
      expiresAt: expires,
      recipientName: guardian.name,
      schoolName: school.name,
      schoolSlug: school.slug,
      roleLabel: SCHOOL_ROLE_LABELS.PARENT,
    };
  }

  /** The mail half, after commit. Never throws — see `StaffInviteService.deliver`. */
  deliver(issued: IssuedInvitation) {
    return this.invites.deliver(issued);
  }
}
