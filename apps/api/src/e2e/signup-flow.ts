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
  const jar = (Array.isArray(raw) ? raw : [String(raw ?? '')]).join('\n');
  return new RegExp(`${name}=([^;]+)`).exec(jar)?.[1] ?? '';
}

export interface SignupFlowInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly school: {
    readonly name: string;
    readonly slug: string;
    readonly city: string;
    readonly phone: string;
    readonly email: string;
    readonly timezone?: string;
    readonly locale?: 'en' | 'ur';
  };
}

/** Walk credentials → OTP → school. Returns the complete response. */
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

  const verify = await app.inject({
    method: 'POST',
    url: ROUTES.public.signupVerifyOtp,
    headers: { host, cookie: `${COOKIES.signupToken}=${session}` },
    payload: { code },
  });

  if (verify.statusCode !== 201 && verify.statusCode !== 200) {
    return verify;
  }

  return app.inject({
    method: 'POST',
    url: ROUTES.public.signupComplete,
    headers: { host, cookie: `${COOKIES.signupToken}=${session}` },
    payload: {
      school: {
        timezone: 'Asia/Karachi',
        locale: 'en',
        ...input.school,
      },
    },
  });
}
