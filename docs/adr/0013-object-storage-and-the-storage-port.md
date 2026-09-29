# ADR-0013 — Object storage behind a `StoragePort`, with Cloudinary as the first driver

- **Status:** Accepted
- **Date:** 2026-09-30
- **Supersedes:** the "object storage has not been chosen" note in `SchoolLogoService`

## Context

Uploaded files were bytes in Postgres. That was the right call while the only
upload was a school logo — half a megabyte per tenant, one per school, and no
vendor decision forced before it had to be.

It stops being right as soon as there is a second kind of upload, and there
already is: a bank's mark on the fee challan. The ones after it are foreseeable
— student photographs, scanned B-forms, receipts — and they differ from a logo
in two ways that matter. They are far more numerous, so the bytes stop being a
rounding error on the database; and some of them are **personal data**, so where
they can be served from is a legal question and not a performance one.

Three decisions were needed: whether the bytes leave the database, which
provider holds them, and how a screen that accepts a file knows which rules
apply to it.

## Decision

### 1. A `StoragePort`, in the shape of `MailPort` (ADR-0011)

One interface, one driver chosen at boot from configuration, and nothing above
it that knows where bytes went. A service hands over verified bytes and gets
back a key it stores; it never builds a URL, never sees a bucket and never
branches on a driver.

The consequence that matters most is that **the product's own endpoint stays the
only address of an image anywhere**. `/api/v1/schools/logo` is what the portal,
the challan, the PDF and the email all point at. No vendor hostname has ever
been written into anything that left the building, so changing provider does not
invalidate a challan printed last term.

### 2. Cloudinary, over its REST API rather than its SDK

Cloudinary was chosen for the usual reasons — free tier adequate for the first
cohort of schools, a CDN included rather than assembled, and image
transformations available later without a second service.

It is called over `fetch` with a signed request, not through the `cloudinary`
package. What this product needs is an upload, a delete and a delivery URL:
about eighty lines. Writing them means the signature rule is tested here rather
than trusted, the failure modes have the shape the rest of this codebase uses,
and there is no second HTTP client in the process with its own timeout opinions.
Swapping to the SDK later is a change inside one file.

### 3. Visibility is declared per asset kind, and the router enforces it

`packages/contracts/src/assets.ts` declares every kind of file the product
accepts and, for each, its size limit, its permitted types and whether it is
`public` or `private`.

`StorageRouter` then routes on that declaration: public assets go to the remote
driver when one is configured, and **private assets go to the database
whatever is configured**. Not because Postgres is better storage, but because a
row is behind row-level security and a CDN URL is behind nothing — anyone who
learns it can fetch it.

This is the part that is hard to retrofit. "We will remember to mark the student
photograph private" is not a control; a declaration next to the size limit,
where whoever adds the next kind is already looking, is. A file that goes to a
public CDN by mistake is not a bug that can be fixed later — it is public by
then.

### 4. The provider is recorded per row, not read from configuration

`school_logos.storage_provider` says who wrote each row, and reads dispatch on
it.

Without this, turning Cloudinary on would blank every logo uploaded before it,
and turning it off would blank every logo uploaded during — silently, because a
missing image raises nothing. With it, a deployment can switch drivers, switch
back, or restore a backup from an environment configured differently, and every
existing file keeps serving.

## Consequences

- **The default deployment stores nothing remotely.** `STORAGE_DRIVER` defaults
  to `database`, so local development and CI need no account and no secret, and
  a deployment that forgets to configure storage keeps working rather than
  refusing uploads. Naming `cloudinary` without credentials fails at boot
  (docs/03 §8) rather than at the first upload.

- **Signup and the profile wizard still write locally**, on purpose. Both run
  inside the transaction that creates a tenant, and a CDN upload there would
  hold a Postgres connection across a network call on the one request a new
  customer cannot retry. Those rows record `database` and serve correctly
  forever; replacing the logo from Settings moves it to the configured driver.

- **Public ids are deterministic** — `{prefix}/schools/{schoolId}/{folder}` —
  so replacing a file overwrites rather than orphans, retrying a timed-out
  upload is idempotent, and no sweeper job is needed for files nobody can reach.
  Cache-busting comes from the version Cloudinary returns, which changes with
  the bytes.

- **A CDN-backed image answers `302`.** The permission check has already
  happened; the redirect is only issued to someone allowed to see it, and only
  for an asset the catalogue declares public.

- **One Cloudinary account can serve several deployments**, separated by
  `CLOUDINARY_FOLDER`. Without a distinct prefix per environment a staging
  upload silently overwrites the production object with the same deterministic
  id.

## Alternatives considered

**S3 or R2 with presigned URLs.** More control and cheaper at volume, but no CDN
or image pipeline without assembling one, and presigned URLs have an expiry that
is a guess about how long a page stays open. Worth revisiting when the bill
justifies it; the port is what makes that a one-file change.

**Signed Cloudinary delivery URLs for private assets.** Would put everything on
the CDN. Rejected for now because the expiry is the same guess, and because a
private file in Postgres is protected by a policy the database enforces rather
than by a URL staying secret. Nothing needs it yet.

**Browser-direct unsigned uploads.** Faster and cheaper — the bytes never touch
the API. Rejected because this product checks the *actual bytes* against the
declared type before storing anything (a `.png` that begins with `<?xml` is an
SVG, and an SVG served back to a school's users is a script served back to a
school's users). An unsigned upload preset cannot do that.
