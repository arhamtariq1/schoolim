/**
 * The one interface every outbound push goes through.
 *
 * Same shape and same reasoning as `MailPort` (ADR-0011): the provider is a
 * configuration decision and this interface is the architectural one. Services
 * never learn that Firebase carried the message.
 *
 * ## Sending never fails the caller's work
 *
 * `send` resolves rather than throws. A fee payment must not roll back because
 * a push provider was slow, and the in-app bell already holds the notification
 * whether or not the push arrived. A push is a nudge to go and look, never the
 * record.
 */

export interface PushMessage {
  /** Device tokens to deliver to. May be any length; the driver batches. */
  readonly tokens: readonly string[];
  readonly title: string;
  readonly body?: string | undefined;
  /** Opaque string pairs the service worker reads to decide where a click goes. */
  readonly data: Readonly<Record<string, string>>;
}

export interface PushResult {
  /** Tokens the provider says will never work again — delete them. */
  readonly invalidTokens: readonly string[];
  readonly sent: number;
  readonly failed: number;
}

export interface PushPort {
  send(message: PushMessage): Promise<PushResult>;
  /** Which driver is active, for the boot log. */
  readonly driver: string;
}

/** DI token. `PushPort` is an interface, so it cannot be a Nest provider token. */
export const PUSH = 'PUSH';
