import { describe, expect, it, vi } from 'vitest';

import { SchoolDirectoryService } from './school-directory.service';

/**
 * The cache in front of the per-request school lookup.
 *
 * The reason these tests matter more than most: this thing sits in front of the
 * check that decides **which school a request belongs to**. A cache that hands
 * back the wrong row, or that holds a suspended school's old status for too
 * long, breaks tenant isolation or breaks dunning. So the behaviour asserted
 * here is not "it caches" — it is the staleness bound and the herd.
 */

function directoryWith(rows: Record<string, { id: string; status: string }>) {
  const findUnique = vi.fn(({ where }: { where: { slug: string } }) =>
    Promise.resolve(rows[where.slug] ?? null),
  );

  const prisma = { admin: { school: { findUnique } } } as never;

  return { service: new SchoolDirectoryService(prisma), findUnique };
}

const DEMO = { id: 'school-1', status: 'ACTIVE' };

describe('SchoolDirectoryService', () => {
  it('returns the school', async () => {
    const { service } = directoryWith({ demo: DEMO });

    await expect(service.lookup('demo')).resolves.toEqual(DEMO);
  });

  it('asks the database once for repeated lookups', async () => {
    const { service, findUnique } = directoryWith({ demo: DEMO });

    await service.lookup('demo', 1_000);
    await service.lookup('demo', 2_000);
    await service.lookup('demo', 3_000);

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('keeps schools apart', async () => {
    const { service } = directoryWith({
      demo: DEMO,
      beacon: { id: 'school-2', status: 'ACTIVE' },
    });

    await expect(service.lookup('demo')).resolves.toEqual(DEMO);
    await expect(service.lookup('beacon')).resolves.toEqual({ id: 'school-2', status: 'ACTIVE' });
  });

  it('re-reads once the entry is older than the TTL', async () => {
    // The bound that matters: a school suspended on another instance starts
    // being treated as suspended here within this window, with no coordination.
    const { service, findUnique } = directoryWith({ demo: DEMO });

    await service.lookup('demo', 0);
    await service.lookup('demo', 29_999);
    expect(findUnique).toHaveBeenCalledTimes(1);

    await service.lookup('demo', 30_001);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('picks up a status change after the TTL, without being told', async () => {
    const rows: Record<string, { id: string; status: string }> = { demo: { ...DEMO } };
    const { service } = directoryWith(rows);

    await expect(service.lookup('demo', 0)).resolves.toEqual({ id: 'school-1', status: 'ACTIVE' });

    rows['demo'] = { id: 'school-1', status: 'SUSPENDED' };

    // Still the old answer inside the window…
    await expect(service.lookup('demo', 10_000)).resolves.toEqual({
      id: 'school-1',
      status: 'ACTIVE',
    });
    // …and the new one after it.
    await expect(service.lookup('demo', 40_000)).resolves.toEqual({
      id: 'school-1',
      status: 'SUSPENDED',
    });
  });

  it('takes effect immediately on the instance that forgets it', async () => {
    const rows: Record<string, { id: string; status: string }> = { demo: { ...DEMO } };
    const { service } = directoryWith(rows);

    await service.lookup('demo', 0);
    rows['demo'] = { id: 'school-1', status: 'CHURNED' };
    service.forget('demo');

    await expect(service.lookup('demo', 1)).resolves.toEqual({
      id: 'school-1',
      status: 'CHURNED',
    });
  });

  it('caches an unknown slug, so an invented subdomain is not a free query', async () => {
    const { service, findUnique } = directoryWith({});

    await expect(service.lookup('nope', 0)).resolves.toBeNull();
    await service.lookup('nope', 1_000);

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('rechecks an unknown slug sooner than a known one', async () => {
    // A school created a moment ago must start working promptly; a miss is
    // cheap to recheck, so it gets the shorter window.
    const { service, findUnique } = directoryWith({});

    await service.lookup('nope', 0);
    await service.lookup('nope', 5_001);

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('collapses a stampede of concurrent misses into one query', async () => {
    // The failure this prevents: a cold process taking the morning's first
    // hundred requests firing a hundred identical lookups — the cache causing
    // the herd it exists to stop.
    let resolveQuery: (value: { id: string; status: string } | null) => void = () => undefined;
    const findUnique = vi.fn(
      () =>
        new Promise<{ id: string; status: string } | null>((resolve) => {
          resolveQuery = resolve;
        }),
    );
    const service = new SchoolDirectoryService({
      admin: { school: { findUnique } },
    } as never);

    const inFlight = Array.from({ length: 100 }, () => service.lookup('demo', 0));
    expect(findUnique).toHaveBeenCalledTimes(1);

    resolveQuery(DEMO);

    expect(await Promise.all(inFlight)).toEqual(Array.from({ length: 100 }, () => DEMO));
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('lets a failed lookup be retried rather than caching the error', async () => {
    let attempt = 0;
    const findUnique = vi.fn(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('connection lost')) : Promise.resolve(DEMO);
    });
    const service = new SchoolDirectoryService({
      admin: { school: { findUnique } },
    } as never);

    await expect(service.lookup('demo', 0)).rejects.toThrow('connection lost');
    // A blip must not lock the slug out for the length of the TTL.
    await expect(service.lookup('demo', 1)).resolves.toEqual(DEMO);
  });

  it('does not grow without bound when fed invented subdomains', async () => {
    const { service, findUnique } = directoryWith({});

    for (let index = 0; index < 10_050; index += 1) {
      await service.lookup(`slug-${String(index)}`, 0);
    }

    // Every one was a miss, so every one was a query; the point is that the map
    // was dropped rather than kept. A real school simply pays one lookup again.
    expect(findUnique).toHaveBeenCalledTimes(10_050);
    await service.lookup('slug-0', 0);
    expect(findUnique).toHaveBeenCalledTimes(10_051);
  });
});
