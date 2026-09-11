import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Slug → school, cached.
 *
 * ## The problem
 *
 * `TenantGuard` resolved the host to a school with a `findUnique` on **every
 * single request**. Measured against a database in another region that was
 * 83ms — a fifth of a trivial read's whole latency — spent looking up a row
 * that changes when a school is created, renamed, suspended or churned, and at
 * no other time. Co-located it is cheap, but it is still one connection
 * borrowed from the pool per request before any real work starts, and the pool
 * is what runs out first when a school's whole staff arrives at 8am.
 *
 * ## Why a TTL and not "cache forever, invalidate on write"
 *
 * Invalidation alone is not enough, because this cache lives in **each API
 * process**. Suspending a school writes on one instance; the other three keep
 * serving from their own maps and never hear about it. `docs/19 §4` makes
 * suspension a read-only state that dunning relies on, so an unbounded stale
 * entry means an unpaid school keeps writing.
 *
 * So both: invalidate locally on write for the instance that made the change,
 * and a short TTL as the backstop that bounds how long any *other* instance can
 * be wrong. Thirty seconds removes essentially every lookup while keeping the
 * worst case well inside the minute a person would call it instant.
 *
 * ## Single flight
 *
 * Concurrent misses for the same slug share one query. Without that, a cold
 * process taking the morning's first hundred requests fires a hundred identical
 * lookups — the cache would make the thundering herd it exists to prevent.
 *
 * ## Negative results
 *
 * A slug that does not exist is cached too, briefly. Otherwise anyone can make
 * the API hit the database on every request just by asking for
 * `nonsense.<domain>`, and no cache in front of it would help.
 */

export interface SchoolDirectoryEntry {
  readonly id: string;
  readonly status: string;
}

interface CacheLine {
  readonly value: SchoolDirectoryEntry | null;
  readonly expiresAt: number;
}

/** Long enough to erase the lookups, short enough that a suspension bites. */
const HIT_TTL_MS = 30_000;

/** Shorter: a miss is cheap to recheck and is the enumeration-shaped load. */
const MISS_TTL_MS = 5_000;

/**
 * A ceiling, so a flood of invented subdomains cannot grow this without bound.
 * Well above any plausible number of real schools per process.
 */
const MAX_ENTRIES = 10_000;

@Injectable()
export class SchoolDirectoryService {
  private readonly cache = new Map<string, CacheLine>();
  private readonly inFlight = new Map<string, Promise<SchoolDirectoryEntry | null>>();

  constructor(private readonly prisma: PrismaService) {}

  async lookup(slug: string, now: number = Date.now()): Promise<SchoolDirectoryEntry | null> {
    const cached = this.cache.get(slug);
    if (cached !== undefined && cached.expiresAt > now) {
      return cached.value;
    }

    // Someone else is already asking. Wait for their answer rather than adding
    // a second identical query to the pile.
    const pending = this.inFlight.get(slug);
    if (pending !== undefined) {
      return pending;
    }

    const query = this.prisma.admin.school
      .findUnique({ where: { slug }, select: { id: true, status: true } })
      .then((row) => {
        const value: SchoolDirectoryEntry | null = row === null ? null : row;
        this.store(slug, value, now);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(slug);
      });

    this.inFlight.set(slug, query);
    return query;
  }

  /**
   * Drop a slug, for the instance that just changed it.
   *
   * Best-effort by design: it fixes the process that made the write
   * immediately, and the TTL fixes every other one. See the note above.
   */
  forget(slug: string): void {
    this.cache.delete(slug);
  }

  /** Test seam, and what a deploy-wide config change would call. */
  clear(): void {
    this.cache.clear();
  }

  private store(slug: string, value: SchoolDirectoryEntry | null, now: number): void {
    if (this.cache.size >= MAX_ENTRIES) {
      // Not an LRU. At this size the map is being used as a weapon rather than
      // a cache, and dropping the lot is the cheap, predictable response —
      // every real school simply pays one lookup to come back.
      this.cache.clear();
    }

    this.cache.set(slug, {
      value,
      expiresAt: now + (value === null ? MISS_TTL_MS : HIT_TTL_MS),
    });
  }
}
