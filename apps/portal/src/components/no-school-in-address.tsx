import { Input } from '@ilm/ui';

/**
 * Shown when the address carries no school.
 *
 * The alternative — offering the form anyway — is what this replaces, and it
 * was actively misleading: a correct password came back as "that email or
 * password is not correct", because the API had no school to look the account
 * up in. Never tell someone their password is wrong when it isn't.
 *
 * This deliberately does **not** list the schools. That list is exactly what
 * subdomain-based tenancy exists to keep private (docs/09 §2), so the person
 * has to know their own address — which they do, because it is the link their
 * school sent them.
 */
export function NoSchoolInAddress({ appDomain }: { appDomain: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm">
        <p className="text-foreground">
          Your school has its own address. Open that one to sign in.
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">your-school.{appDomain}</p>
      </div>

      {/* A plain form, no JavaScript: type the slug, land on the right host. */}
      <form action="/api/go-to-school" method="get" className="space-y-3">
        <label htmlFor="slug" className="text-sm font-medium">
          Know your school’s short name?
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="slug"
            name="slug"
            placeholder="your-school"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono"
          />
          <span className="font-mono text-sm whitespace-nowrap text-muted-foreground">
            .{appDomain}
          </span>
        </div>
        <button
          type="submit"
          className="h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Go
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Not sure? The link in your school’s message has it.
      </p>
    </div>
  );
}
