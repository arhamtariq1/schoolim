/**
 * The one interface every outbound email goes through.
 *
 * docs/05 chose "Resend behind a `MailPort` interface", and the reasoning it
 * gave — swap the provider later without touching callers — is the part that
 * matters. The provider is a configuration decision; this shape is the
 * architectural one, and it is what stops a transport library's types leaking
 * into services that only want to send a message.
 *
 * The first driver is SMTP rather than Resend (ADR-0011). Nothing about that is
 * visible on this side of the interface, which is the point.
 *
 * ## Sending never fails the caller's work
 *
 * Every implementation resolves rather than throws, and reports the outcome in
 * the return value. A school must not fail to be created because a mail server
 * was slow, and a person must not see "signup failed" after their tenant was
 * committed. Callers decide what to do with a `false`; none of them may treat
 * it as fatal.
 */

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  /** Always present. Some recipients, and every spam filter, read this one. */
  readonly text: string;
  readonly html: string;
}

export interface MailResult {
  readonly sent: boolean;
  /** Provider message id when there is one — worth logging, never shown. */
  readonly id?: string;
  /** Why it failed, for the log. Never surfaced to a person verbatim. */
  readonly error?: string;
}

export interface MailPort {
  send(message: MailMessage): Promise<MailResult>;
  /** Which driver is active, for the boot log and the health endpoint. */
  readonly driver: string;
}

/** DI token. `MailPort` is an interface, so it cannot be a Nest provider token. */
export const MAIL = 'MAIL';
