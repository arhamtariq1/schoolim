import { COOKIES, CURRENT_TERMS_VERSION, ROUTES } from '@ilm/contracts';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';

import { type MailMessage, type MailPort, type MailResult } from '../shared/mail/mail.port';

/** Records outbound mail so e2e can read OTP codes and verify-email links. */
export class RecordingMailer implements MailPort {
  readonly driver = 'recording';
  readonly delivered: MailMessage[] = [];
  failNext = false;

  send(message: MailMessage): Promise<MailResult> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.resolve({ sent: false, error: 'simulated relay failure' });
    }
    this.delivered.push(message);
    return Promise.resolve({ sent: true, id: `test-${String(this.delivered.length)}` });
  }

  tokenFor(email: string): string | undefined {
    for (let index = this.delivered.length - 1; index >= 0; index -= 1) {
      const message = this.delivered[index];
      if (message?.to === email) {
        return /\/verify-email\?t=([A-Za-z0-9_-]+)/.exec(message.text)?.[1];
      }
    }
    return undefined;
  }

  /** Six-digit signup OTP from the most recent message to this address. */
  otpFor(email: string): string | undefined {
    for (let index = this.delivered.length - 1; index >= 0; index -= 1) {
      const message = this.delivered[index];
      if (message?.to === email) {
        return /\b(\d{6})\b/.exec(message.text)?.[1];
      }
    }
    return undefined;
  }

  countTo(email: string): number {
    return this.delivered.filter((message) => message.to === email).length;
  }
}

export function cookieValue(response: { headers: Record<string, unknown> }, name: string): string {
  const raw = response.headers['set-cookie'];

  // Narrowed rather than stringified. `set-cookie` is `string | string[] |
  // undefined`, but the header bag is typed `unknown` — and `String(raw)` on
  // anything else yields the literal text `[object Object]`, which is then
  // searched for a cookie as though it were a real header. Nothing matches, so
  // the failure arrives later as an empty token and a puzzling 401 rather than
  // as the malformed response it actually was.
  const cookies = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === 'string')
    : typeof raw === 'string'
      ? [raw]
      : [];

  return new RegExp(`${name}=([^;]+)`).exec(cookies.join('\n'))?.[1] ?? '';
}

export interface SignupFlowInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  /**
   * Deliberately **ignored**, and optional because of it.
   *
   * Credentials and OTP are the whole of signup now: the school is provisioned
   * with a slug the server allocates, and its real details are filled in later
   * at `/me/onboarding`. Nothing in this helper reads this field.
   *
   * It is kept because one test passes a *reserved* slug here to prove that
   * doing so provisions anyway — the conflict belongs at onboarding, not at OTP.
   * Omit it everywhere else: a school payload that looks like it is being used
   * is what led a whole suite to address hosts the server had never created.
   */
  readonly school?: {
    readonly name: string;
    readonly slug: string;
    readonly city: string;
    readonly phone: string;
    readonly email: string;
    readonly timezone?: string;
    readonly locale?: 'en' | 'ur';
  };
}

/**
 * Walk credentials → OTP (provisions tenant + handoff).
 *
 * School details are finished later via `/me/onboarding` inside the portal.
 * Returns the OTP verify response (includes `continueTo`).
 */
export async function runSignupFlow(
  app: NestFastifyApplication,
  mailer: RecordingMailer,
  input: SignupFlowInput,
  host = 'localhost',
) {
  const start = await app.inject({
    method: 'POST',
    url: ROUTES.public.signupStart,
    headers: { host },
    payload: {
      name: input.name,
      email: input.email,
      password: input.password,
      confirmPassword: input.password,
      acceptedTerms: true,
      termsVersion: CURRENT_TERMS_VERSION,
    },
  });

  if (start.statusCode !== 201) {
    return start;
  }

  const session = cookieValue(start, COOKIES.signupToken);
  const code = mailer.otpFor(input.email);
  if (session === '' || code === undefined) {
    throw new Error(`signup start did not yield a session/OTP (status ${String(start.statusCode)})`);
  }

  return app.inject({
    method: 'POST',
    url: ROUTES.public.signupVerifyOtp,
    headers: { host, cookie: `${COOKIES.signupToken}=${session}` },
    payload: { code },
  });
}
