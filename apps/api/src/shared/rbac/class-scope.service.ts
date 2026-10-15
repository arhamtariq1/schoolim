import { grantFor, PERMISSION_GRANT, type Permission, type SchoolRole } from '@ilm/contracts';
import { Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { TenantContextService } from '../tenancy/tenant-context.service';

/**
 * The classes a caller may reach, or `undefined` for all of them.
 *
 * `undefined` and an empty array are opposites and must never be conflated:
 * the first is "no restriction", the second is "nothing". Every consumer turns
 * it into a query clause, never a post-fetch filter (docs/08 §5) — a filter
 * after the fetch has already pulled the rows into memory and into the count.
 */
export type ClassScope = readonly string[] | undefined;

/**
 * Compiles a scoped grant into the classes it covers (ADR-0014, docs/08 §5).
 *
 * ## Why it is one service
 *
 * The student list, a student's own page, the attendance class cards, a roster
 * and a monthly report are all "which rows may this teacher see", and each of
 * them used to answer it separately — or, in the students module, not at all
 * (a teacher saw nothing, as a placeholder). Five answers to one question is
 * how a teacher ends up unable to list a student but able to open their page.
 *
 * ## Fail closed
 *
 * Anything that is not a clear "all" or a clear assignment resolves to an empty
 * scope: a role with no grant, a scoped role that is not a teacher, a teacher
 * whose staff record is gone or has ended, a teacher with no classes yet.
 * None of those is a reason to show everything.
 */
@Injectable()
export class ClassScopeService {
  constructor(private readonly context: TenantContextService) {}

  /**
   * The class ids the caller's grant of `permission` covers.
   *
   * Takes the caller's transaction rather than opening one (docs/12 §4), so the
   * answer is read in the same snapshot as the rows it is about to narrow.
   */
  async classLevelIds(tx: TransactionClient, permission: Permission): Promise<ClassScope> {
    const roles = this.context.roles as readonly SchoolRole[];
    const grant = grantFor(roles, permission);

    if (grant === PERMISSION_GRANT.ALL) {
      return undefined;
    }
    if (grant === undefined) {
      return [];
    }

    // Scoped. Only a teacher's scope is defined by class assignments; a parent
    // or a student holding a scoped grant reaches nothing through a class.
    const userId = this.context.userId;
    if (userId === undefined || !(roles.includes('TEACHER') || roles.includes('COORDINATOR'))) {
      return [];
    }

    const rows = await tx.staffClassAssignment.findMany({
      where: { staff: { userId, deletedAt: null, status: 'ACTIVE' } },
      select: { classLevelId: true },
    });

    return rows.map((row) => row.classLevelId);
  }
}

/** Whether a class is inside a scope. `undefined` admits everything. */
export function classInScope(scope: ClassScope, classLevelId: string): boolean {
  return scope === undefined || scope.includes(classLevelId);
}
